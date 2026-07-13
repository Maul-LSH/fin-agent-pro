"""
core/sectors.py — 板块数据模块
- 美股行业板块（11 个 GICS）
- 美股市值板块（大盘 / 中盘 / 小盘）
- A 股行业板块（按涨幅 Top 15，含主力净流入）
- A 股地域板块
- 板块历史趋势（点击时调用）
"""

import yfinance as yf
import akshare as ak

from .utils import retry, safe_round, cached_fetch, persistent_cached_fetch


QUOTE_TTL = 30 * 60
STALE_TTL = 30 * 24 * 60 * 60


def _first_existing(row, columns: list[str]):
    for col in columns:
        if col in row and row.get(col) is not None:
            return row.get(col)
    return None


def _num(value):
    try:
        if value is None:
            return None
        if isinstance(value, str):
            value = value.replace(",", "").replace("%", "").strip()
            if value in {"", "-", "--", "nan", "None"}:
                return None
        return float(value)
    except Exception:
        return None


def _fetch_cn_industry_frame():
    return cached_fetch(
        "ak.cn.industry_name",
        lambda: retry(lambda: ak.stock_board_industry_name_em(), retries=1),
        ttl=QUOTE_TTL,
    )


def _fetch_cn_industry_flow_frame():
    return cached_fetch(
        "ak.cn.industry_fund_flow",
        lambda: retry(
            lambda: ak.stock_sector_fund_flow_rank(
                indicator="今日", sector_type="行业资金流"
            ),
            retries=1,
        ),
        ttl=QUOTE_TTL,
    )


def _normalize_cn_sector_row(row, flow_df=None) -> dict | None:
    name = _first_existing(row, ["板块名称", "名称", "行业名称"])
    if not name:
        return None

    change = _num(_first_existing(row, ["涨跌幅", "今日涨跌幅", "涨跌幅(%)", "涨幅"]))
    price = _num(_first_existing(row, ["最新价", "最新", "收盘", "收盘价"]))
    code = _first_existing(row, ["板块代码", "代码", "行业代码"])
    main_inflow = _num(_first_existing(row, ["今日主力净流入-净额", "主力净流入-净额", "净流入"]))

    if main_inflow is None and flow_df is not None and not flow_df.empty:
        try:
            matched = flow_df[flow_df["名称"] == name] if "名称" in flow_df.columns else None
            if matched is not None and not matched.empty:
                flow_row = matched.iloc[0]
                main_inflow = _num(_first_existing(flow_row, ["今日主力净流入-净额", "主力净流入-净额", "净流入"]))
        except Exception:
            pass

    return {
        "label": name,
        "code": code,
        "price": safe_round(price),
        "change_pct": safe_round(change, 2),
        "main_inflow_yi": safe_round(main_inflow / 1e8, 2) if main_inflow is not None else None,
        "source": "akshare",
    }


# ─────────────────────────────────────────
# 美股 11 个 GICS 行业板块（用 SPDR ETF 代理）
# ─────────────────────────────────────────
US_INDUSTRY_ETFS = [
    ("XLK", "Technology / 科技"),
    ("XLV", "Health Care / 医疗"),
    ("XLF", "Financials / 金融"),
    ("XLY", "Consumer Discretionary / 非必需消费"),
    ("XLP", "Consumer Staples / 必需消费"),
    ("XLI", "Industrials / 工业"),
    ("XLE", "Energy / 能源"),
    ("XLU", "Utilities / 公用事业"),
    ("XLRE", "Real Estate / 房地产"),
    ("XLB", "Materials / 材料"),
    ("XLC", "Communication / 通讯"),
]

# 美股按市值规模板块
US_SIZE_ETFS = [
    ("MGC", "Mega Cap / 超大盘"),
    ("VV", "Large Cap / 大盘"),
    ("VO", "Mid Cap / 中盘"),
    ("VB", "Small Cap / 小盘"),
    ("VIOO", "Micro Cap / 微盘"),
]


def _get_us_etf_data(ticker_list: list) -> list:
    """通用：拉一组 ETF 的最新价格 + 涨跌幅，按涨幅倒序排"""
    results = []
    for ticker, label in ticker_list:
        item = {
            "label": label,
            "ticker": ticker,
            "price": None,
            "change_pct": None,
        }
        try:
            stock = yf.Ticker(ticker)
            hist = retry(lambda: stock.history(period="5d"), retries=2)
            if hist is not None and not hist.empty and len(hist) >= 2:
                latest = hist["Close"].iloc[-1]
                prev = hist["Close"].iloc[-2]
                item["price"] = safe_round(latest)
                item["change_pct"] = safe_round((latest - prev) / prev * 100, 2)
        except Exception:
            pass
        results.append(item)

    # 按涨跌幅降序
    results.sort(
        key=lambda x: (x["change_pct"] if x["change_pct"] is not None else -999),
        reverse=True,
    )
    return results


def get_us_industry_sectors() -> list:
    """美股行业板块（11 个 GICS）"""
    return _get_us_etf_data(US_INDUSTRY_ETFS)


def get_us_size_sectors() -> list:
    """美股按市值规模板块"""
    return _get_us_etf_data(US_SIZE_ETFS)


# ─────────────────────────────────────────
# A 股行业板块（前 15，按涨幅，含主力净流入）
# ─────────────────────────────────────────
def get_cn_industry_sectors(top_n: int = 15) -> list:
    """
    A 股行业板块涨跌幅排行 + 主力净流入
    返回前 top_n 个
    """
    def _fetch():
        results = []

        try:
            df = _fetch_cn_industry_frame()
            flow_df = _fetch_cn_industry_flow_frame()
            source_df = df if df is not None and not df.empty else flow_df
            if source_df is None or source_df.empty:
                return None

            sort_col = next((c for c in ["涨跌幅", "今日涨跌幅", "涨跌幅(%)", "涨幅"] if c in source_df.columns), None)
            if sort_col:
                source_df = source_df.assign(_sort_change=source_df[sort_col].map(_num))
                source_df = source_df.sort_values("_sort_change", ascending=False)

            for _, row in source_df.head(top_n).iterrows():
                item = _normalize_cn_sector_row(row, flow_df=flow_df)
                if item:
                    results.append(item)
        except Exception:
            return None

        return results or None

    return persistent_cached_fetch(
        f"sectors.cn.industry.{top_n}",
        _fetch,
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    ) or []


# ─────────────────────────────────────────
# A 股地域板块（按地域/省份）
# ─────────────────────────────────────────
def get_cn_region_sectors(top_n: int = 15) -> list:
    """A 股地域概念板块涨跌幅"""
    def _fetch():
        results = []

        try:
            df = cached_fetch(
                "ak.cn.concept_name",
                lambda: retry(lambda: ak.stock_board_concept_name_em(), retries=1),
                ttl=QUOTE_TTL,
            )
            if df is None or df.empty:
                return None

            provinces = [
                "北京", "上海", "天津", "重庆", "广东", "江苏", "浙江",
                "山东", "四川", "湖北", "湖南", "河南", "河北", "福建",
                "安徽", "辽宁", "陕西", "江西", "山西", "云南", "贵州",
                "广西", "甘肃", "海南", "新疆", "内蒙古", "黑龙江", "吉林",
                "宁夏", "青海", "西藏", "深圳", "雄安",
            ]
            region_rows = []
            seen_names = set()
            for _, row in df.iterrows():
                name = str(row.get("板块名称", ""))
                if not name or name in seen_names:
                    continue
                if any(p in name for p in provinces):
                    region_rows.append(row)
                    seen_names.add(name)

            region_rows.sort(
                key=lambda r: (r.get("涨跌幅") if r.get("涨跌幅") is not None else -999),
                reverse=True,
            )

            for row in region_rows[:top_n]:
                results.append({
                    "label": row.get("板块名称"),
                    "code": row.get("板块代码"),
                    "price": safe_round(row.get("最新价")),
                    "change_pct": safe_round(row.get("涨跌幅"), 2),
                    "main_inflow_yi": None,
                    "source": "akshare",
                })
        except Exception:
            return None

        return results or None

    return persistent_cached_fetch(
        f"sectors.cn.region.{top_n}",
        _fetch,
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    ) or []


# ─────────────────────────────────────────
# 板块历史趋势（点击时调用）
# ─────────────────────────────────────────
def get_us_sector_history(ticker: str, days: int = 90) -> list:
    """
    美股板块历史价格序列
    返回 [(date_string, close_price), ...]
    """
    try:
        stock = yf.Ticker(ticker)
        hist = retry(lambda: stock.history(period=f"{days}d"), retries=2)
        if hist is None or hist.empty:
            return []
        return [
            (idx.strftime("%Y-%m-%d"), safe_round(close))
            for idx, close in zip(hist.index, hist["Close"])
        ]
    except Exception:
        return []


def get_cn_sector_history(board_identifier: str, days: int = 90) -> list:
    """
    A 股行业/概念板块历史价格序列
    AkShare 用板块名查询，不是代码
    """
    board_name = board_identifier
    try:
        # 兼容前端传入板块代码的情况：AkShare 历史接口实际需要板块名称。
        if board_identifier and str(board_identifier).isdigit():
            df_names = cached_fetch(
                "ak.cn.industry_name",
                lambda: retry(lambda: ak.stock_board_industry_name_em(), retries=1),
                ttl=QUOTE_TTL,
            )
            if df_names is not None and not df_names.empty:
                matched = df_names[df_names["板块代码"].astype(str) == str(board_identifier)]
                if not matched.empty:
                    board_name = matched.iloc[0]["板块名称"]

        # 行业板块历史
        df = retry(lambda: ak.stock_board_industry_hist_em(symbol=board_name, period="日k", adjust=""), retries=1)
        if df is None or df.empty:
            # 尝试概念板块（地域板块属于这里）
            df = retry(lambda: ak.stock_board_concept_hist_em(symbol=board_name, period="日k", adjust=""), retries=1)

        if df is None or df.empty:
            return []

        df = df.tail(days)
        return [
            (str(d), safe_round(c))
            for d, c in zip(df["日期"], df["收盘"])
        ]
    except Exception:
        return []
