"""
core/markets.py — 市场概览模块（顶部指数）
美股：S&P 500 / NASDAQ 100 / Dow Jones / Russell 2000
A 股：上证 + 深证（包含深证成指、创业板指）
"""

from datetime import datetime, timedelta

import yfinance as yf
import akshare as ak
import requests

from .utils import retry, safe_round, cached_fetch, persistent_cached_fetch
from . import fmp


QUOTE_TTL = 30 * 60
STALE_TTL = 30 * 24 * 60 * 60


# ─────────────────────────────────────────
# 美股指数
# ─────────────────────────────────────────
def get_us_market_overview() -> list:
    """美股核心指数 ETF"""
    tickers = ["SPY", "QQQ", "DIA", "IWM"]
    labels = ["S&P 500", "NASDAQ 100", "Dow Jones", "Russell 2000"]
    results = []

    for ticker, label in zip(tickers, labels):
        item = {"label": label, "ticker": ticker, "price": None, "change_pct": None}
        try:
            stock = yf.Ticker(ticker)
            hist = retry(lambda: stock.history(period="5d"), retries=2)
            if hist is not None and not hist.empty:
                if len(hist) >= 2:
                    latest = hist["Close"].iloc[-1]
                    prev = hist["Close"].iloc[-2]
                    item["price"] = safe_round(latest)
                    item["change_pct"] = safe_round((latest - prev) / prev * 100, 2)
                else:
                    item["price"] = safe_round(hist["Close"].iloc[-1])
                    item["change_pct"] = 0
        except Exception:
            pass
        results.append(item)

    return results


# ─────────────────────────────────────────
# A 股指数（上交所 + 深交所合并）
# ─────────────────────────────────────────
def get_cn_market_overview() -> list:
    """A 股核心指数：上证、深证成指、创业板指、沪深300"""
    def _fetch():
        indices = [
            ("000001", "上证指数", "上证系列指数", ["000001.SS", "SH000001"]),
            ("399001", "深证成指", "深证系列指数", ["399001.SZ", "SZ399001"]),
            ("399006", "创业板指", "深证系列指数", ["399006.SZ", "SZ399006"]),
            ("000300", "沪深300", "上证系列指数", ["000300.SS", "000300.SZ", "SH000300"]),
        ]

        sh_df = cached_fetch(
            "ak.cn.index_sh",
            lambda: retry(lambda: ak.stock_zh_index_spot_em(symbol="上证系列指数"), retries=1),
            ttl=QUOTE_TTL,
        )
        sz_df = cached_fetch(
            "ak.cn.index_sz",
            lambda: retry(lambda: ak.stock_zh_index_spot_em(symbol="深证系列指数"), retries=1),
            ttl=QUOTE_TTL,
        )
        sina_df = cached_fetch(
            "ak.cn.index_sina",
            lambda: retry(lambda: ak.stock_zh_index_spot_sina(), retries=1),
            ttl=QUOTE_TTL,
        )

        results = []
        for code, label, source, fmp_symbols in indices:
            item = {"label": label, "ticker": code, "price": None, "change_pct": None, "source": None}
            df = sh_df if source == "上证系列指数" else sz_df
            if df is not None:
                try:
                    row = df[df["代码"] == code]
                    if not row.empty:
                        r = row.iloc[0]
                        item["price"] = safe_round(r.get("最新价"))
                        item["change_pct"] = safe_round(r.get("涨跌幅"), 2)
                        item["source"] = "akshare"
                except Exception:
                    pass

            if item["price"] is None:
                quote = _cn_index_quote_from_sina(sina_df, code)
                if quote:
                    item["price"] = quote.get("price")
                    item["change_pct"] = quote.get("change_pct")
                    item["source"] = quote.get("source")

            if item["price"] is None:
                quote = _cn_index_quote_from_daily(code) or _first_fmp_quote(fmp_symbols)
                if quote:
                    item["price"] = quote.get("price")
                    item["change_pct"] = quote.get("change_pct")
                    item["source"] = quote.get("source") or "fmp"

            results.append(item)

        return results if any(item["price"] is not None for item in results) else None

    return persistent_cached_fetch(
        "markets.cn.overview.v2",
        _fetch,
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    ) or []


# ─────────────────────────────────────────
# 港股指数（恒生 + 国企 + 科技 + 红筹）
# ─────────────────────────────────────────
def get_hk_market_overview() -> list:
    """
    港股核心指数：
    - 恒生指数 (HSI)
    - 国企指数 (HSCEI)
    - 科技指数 (HSTECH)
    - 红筹指数 (HSCCI)

    注：AkShare 的 stock_hk_index_spot_em() 经常被东方财富服务器拒绝
    （RemoteDisconnected），改用 stock_hk_index_daily_em(symbol=) 拉日 K 数据，
    取最近两个交易日算涨跌幅。这个接口更稳定（单指数请求，每次只拿一支）。
    """
    def _fetch():
        indices = [
            ("HSI", "Hang Seng / 恒生指数", ["^HSI", "HSI"]),
            ("HSCEI", "HSCEI / 国企指数", ["^HSCE", "HSCEI"]),
            ("HSTECH", "HS Tech / 恒生科技", ["^HSTECH", "HSTECH"]),
            ("HSCCI", "Red Chip / 红筹", ["^HSCCI", "HSCCI"]),
        ]
        sina_df = cached_fetch(
            "ak.hk.index_sina",
            lambda: retry(lambda: ak.stock_hk_index_spot_sina(), retries=1),
            ttl=QUOTE_TTL,
        )

        results = []
        for symbol, label, fmp_symbols in indices:
            item = {"label": label, "ticker": symbol, "price": None, "change_pct": None, "source": None}
            quote = _hk_index_quote_from_sina(sina_df, symbol)
            if quote:
                item["price"] = quote.get("price")
                item["change_pct"] = quote.get("change_pct")
                item["source"] = quote.get("source")

            try:
                if item["price"] is None:
                    df = cached_fetch(
                        f"ak.hk.index_daily.{symbol}",
                        lambda s=symbol: retry(
                            lambda: ak.stock_hk_index_daily_em(symbol=s),
                            retries=1,
                        ),
                        ttl=QUOTE_TTL,
                    )
                else:
                    df = None
                if df is not None and not df.empty and len(df) >= 2:
                    close_col = None
                    for c in ["close", "收盘", "收盘价", "latest", "最新价"]:
                        if c in df.columns:
                            close_col = c
                            break

                    if close_col:
                        latest = float(df[close_col].iloc[-1])
                        prev = float(df[close_col].iloc[-2])
                        item["price"] = safe_round(latest)
                        if prev > 0:
                            item["change_pct"] = safe_round(
                                (latest - prev) / prev * 100, 2
                            )
                        item["source"] = "akshare"
            except Exception:
                pass

            if item["price"] is None:
                quote = _hk_red_chip_quote_from_aastocks() if symbol == "HSCCI" else None
                quote = quote or _first_fmp_quote(fmp_symbols)
                if quote:
                    item["price"] = quote.get("price")
                    item["change_pct"] = quote.get("change_pct")
                    item["source"] = quote.get("source") or "fmp"

            results.append(item)

        return results if any(item["price"] is not None for item in results) else None

    return persistent_cached_fetch(
        "markets.hk.overview.v2",
        _fetch,
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    ) or []


def _first_fmp_quote(symbols: list[str]) -> dict | None:
    if not fmp.is_configured():
        return None
    for symbol in symbols:
        quote = fmp.quote(symbol)
        if quote and quote.get("price") is not None:
            return quote
    return None


def _cn_index_quote_from_daily(code: str) -> dict | None:
    try:
        hist = _cn_index_history(code, days=2)
        if not hist:
            return None
        latest = hist[-1][1]
        prev = hist[-2][1] if len(hist) >= 2 else latest
        change_pct = (latest - prev) / prev * 100 if prev else None
        return {
            "price": safe_round(latest),
            "change_pct": safe_round(change_pct, 2),
            "source": "akshare_daily",
        }
    except Exception:
        return None


def _cn_index_quote_from_sina(df, code: str) -> dict | None:
    if df is None or df.empty:
        return None
    try:
        symbol = _cn_index_symbol(code)
        row = df[df["代码"] == symbol]
        if row.empty:
            return None
        r = row.iloc[0]
        return {
            "price": safe_round(r.get("最新价")),
            "change_pct": safe_round(r.get("涨跌幅"), 2),
            "source": "sina",
        }
    except Exception:
        return None


def _hk_red_chip_quote_from_aastocks() -> dict | None:
    try:
        html = requests.get(
            "https://www.aastocks.com/en/stocks/market/index/hk-index-con.aspx?index=HSCCI",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        ).text
        marker = "HSI - Red Chips Index"
        if marker not in html:
            return None
        import re
        tail = re.sub(r"<[^>]+>", " ", html.split(marker, 1)[1])
        numbers = re.findall(r"[+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?", tail[:2000])
        if not numbers:
            return None
        price = float(numbers[0].replace(",", ""))
        pct_match = re.search(r"\(([+-]?\d+(?:\.\d+)?)%\)", tail[:2000])
        previous_match = re.search(r"Previous\s+(\d{1,3}(?:,\d{3})*(?:\.\d+)?)", tail[:2000])
        if pct_match:
            change_pct = float(pct_match.group(1))
        elif previous_match:
            previous = float(previous_match.group(1).replace(",", ""))
            change_pct = (price - previous) / previous * 100 if previous else None
        else:
            change_pct = None
        return {
            "price": safe_round(price),
            "change_pct": safe_round(change_pct, 2),
            "source": "aastocks",
        }
    except Exception:
        return None


def _hk_index_quote_from_sina(df, symbol: str) -> dict | None:
    if df is None or df.empty:
        return None
    try:
        row = df[df["代码"] == symbol]
        if row.empty:
            row = df[df["代码"] == f"hk{symbol}"]
        if row.empty:
            return None
        r = row.iloc[0]
        return {
            "price": safe_round(r.get("最新价")),
            "change_pct": safe_round(r.get("涨跌幅"), 2),
            "source": "sina",
        }
    except Exception:
        return None


def get_market_index_history(market: str, identifier: str, days: int = 90) -> list:
    """大盘指数历史走势。返回 [(date, close), ...]"""
    if market == "us":
        return _yf_history(identifier, days)
    if market == "hk":
        return _hk_index_history(identifier, days)
    return _cn_index_history(identifier, days)


def _yf_history(ticker: str, days: int) -> list:
    try:
        stock = yf.Ticker(ticker)
        hist = retry(lambda: stock.history(period=f"{days}d"), retries=2)
        if hist is None or hist.empty:
            return []
        return [
            (idx.strftime("%Y-%m-%d"), safe_round(close))
            for idx, close in zip(hist.index, hist["Close"])
            if close is not None
        ]
    except Exception:
        return []


def _cn_index_history(code: str, days: int) -> list:
    """
    A 股指数历史行情分层回退：
    1. 东方财富指数日线（带交易所前缀）
    2. 新浪指数日线
    3. 腾讯指数日线
    4. 深证系 -> 国证指数历史
    5. 沪深 300 -> 中证指数历史
    """
    symbol = _cn_index_symbol(code)
    fetchers = [
        lambda: ak.stock_zh_index_daily_em(symbol=symbol),
        lambda: ak.stock_zh_index_daily(symbol=symbol),
        lambda: ak.stock_zh_index_daily_tx(symbol=symbol),
    ]

    for fetcher in fetchers:
        rows = _normalize_index_history_frame(retry(fetcher, retries=1), days)
        if rows:
            return rows

    if code.startswith("399"):
        rows = _cn_cni_index_history(code, days)
        if rows:
            return rows

    if code == "000300":
        rows = _cn_csindex_history(code, days)
        if rows:
            return rows

    return []


def _cn_index_symbol(code: str) -> str:
    if code.startswith("399"):
        return f"sz{code}"
    return f"sh{code}"


def _normalize_index_history_frame(df, days: int) -> list:
    if df is None or df.empty:
        return []
    df = df.tail(days)
    close_col = _first_existing_column(df, ["close", "收盘", "收盘价", "latest", "最新价"])
    date_col = _first_existing_column(df, ["date", "日期"])
    if not close_col or not date_col:
        return []
    return [
        (str(d)[:10], safe_round(c))
        for d, c in zip(df[date_col], df[close_col])
        if safe_round(c) is not None
    ]


def _cn_cni_index_history(code: str, days: int) -> list:
    try:
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=max(days * 3, 180))).strftime("%Y%m%d")
        df = retry(
            lambda: ak.index_hist_cni(symbol=code, start_date=start, end_date=end),
            retries=1,
        )
        return _normalize_index_history_frame(df, days)
    except Exception:
        return []


def _cn_csindex_history(code: str, days: int) -> list:
    try:
        end = datetime.now().strftime("%Y%m%d")
        start = (datetime.now() - timedelta(days=max(days * 3, 180))).strftime("%Y%m%d")
        df = retry(
            lambda: ak.stock_zh_index_hist_csindex(
                symbol=code,
                start_date=start,
                end_date=end,
            ),
            retries=1,
        )
        return _normalize_index_history_frame(df, days)
    except Exception:
        return []


def _hk_index_history(symbol: str, days: int) -> list:
    fetchers = [
        lambda: ak.stock_hk_index_daily_em(symbol=symbol),
        lambda: ak.stock_hk_index_daily_sina(symbol=symbol),
    ]

    for fetcher in fetchers:
        rows = _normalize_index_history_frame(retry(fetcher, retries=1), days)
        if rows:
            return rows

    yahoo_symbol = _hk_yahoo_symbol(symbol)
    if yahoo_symbol:
        rows = _yf_history(yahoo_symbol, days)
        if rows:
            return rows

    return []


def _hk_yahoo_symbol(symbol: str) -> str | None:
    return {
        "HSI": "^HSI",
        "HSCEI": "^HSCE",
        "HSTECH": "^HSTECH",
        "HSCCI": "^HSCCI",
    }.get(symbol)


def _first_existing_column(df, columns: list[str]) -> str | None:
    for col in columns:
        if col in df.columns:
            return col
    return None
