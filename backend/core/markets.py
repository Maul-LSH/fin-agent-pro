"""
core/markets.py — 市场概览模块（顶部指数）
美股：S&P 500 / NASDAQ 100 / Dow Jones / Russell 2000
A 股：上证 + 深证（包含深证成指、创业板指）
"""

import yfinance as yf
import akshare as ak

from .utils import retry, safe_round


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
    indices = [
        ("000001", "上证指数", "上证系列指数"),
        ("399001", "深证成指", "深证系列指数"),
        ("399006", "创业板指", "深证系列指数"),
        ("000300", "沪深300", "上证系列指数"),
    ]

    # 一次性把两个系列都拉下来
    sh_df = retry(lambda: ak.stock_zh_index_spot_em(symbol="上证系列指数"), retries=1)
    sz_df = retry(lambda: ak.stock_zh_index_spot_em(symbol="深证系列指数"), retries=1)

    results = []
    for code, label, source in indices:
        item = {"label": label, "ticker": code, "price": None, "change_pct": None}
        df = sh_df if source == "上证系列指数" else sz_df
        if df is not None:
            try:
                row = df[df["代码"] == code]
                if not row.empty:
                    r = row.iloc[0]
                    item["price"] = safe_round(r.get("最新价"))
                    item["change_pct"] = safe_round(r.get("涨跌幅"), 2)
            except Exception:
                pass
        results.append(item)

    return results
