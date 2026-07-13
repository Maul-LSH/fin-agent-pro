"""
core/attention.py — 板块关注度 + 波动性评分
基于市场数据本身计算「资金在盯哪里」「哪里在剧烈波动」
完全用 yfinance，不需要爬社交媒体
"""

import yfinance as yf
import pandas as pd
import numpy as np

from .utils import retry, safe_round, cached_fetch, persistent_cached_fetch
from .sectors import US_INDUSTRY_ETFS, US_SIZE_ETFS, get_cn_industry_sectors


QUOTE_TTL = 30 * 60
STALE_TTL = 30 * 24 * 60 * 60


# ─────────────────────────────────────────
# 美股板块关注度 + 波动性评分
# ─────────────────────────────────────────
def get_us_sector_attention(category: str = "industry") -> list:
    """
    计算美股板块的二维评分：
    - attention_score: 当前成交量 / 过去 20 天平均成交量（越大越热）
    - volatility_score: 最近 5 天日收益率标准差（百分比）
    
    category: "industry" 用 GICS 11 行业 / "size" 用市值板块
    
    返回：
    [
        {
            "label": "Technology",
            "ticker": "XLK",
            "price": 220.5,
            "change_pct": 1.23,
            "attention_score": 1.8,    # 成交量是平均的 1.8 倍
            "volatility_score": 2.5,    # 5 日波动 2.5%
            "quadrant": "hot"           # hot / volatile / popular / quiet
        },
        ...
    ]
    """
    if category == "size":
        ticker_list = US_SIZE_ETFS
    else:
        ticker_list = US_INDUSTRY_ETFS

    results = []
    for ticker, label in ticker_list:
        item = _compute_etf_scores(ticker, label)
        results.append(item)

    # 计算分位数，用来给 quadrant 打标签
    _assign_quadrants(results)

    # 按关注度降序
    results.sort(
        key=lambda x: (x["attention_score"] if x["attention_score"] is not None else -999),
        reverse=True,
    )
    return results


def _compute_etf_scores(ticker: str, label: str) -> dict:
    """计算单个 ETF 的关注度和波动性"""
    item = {
        "label": label,
        "ticker": ticker,
        "price": None,
        "change_pct": None,
        "attention_score": None,
        "volatility_score": None,
        "quadrant": None,
    }

    try:
        stock = yf.Ticker(ticker)
        # 拉 30 天数据，足够计算 20 日均量和 5 日波动
        hist = retry(lambda: stock.history(period="30d"), retries=2)

        if hist is None or hist.empty or len(hist) < 6:
            return item

        # 价格 & 涨跌幅
        latest_close = hist["Close"].iloc[-1]
        prev_close = hist["Close"].iloc[-2]
        item["price"] = safe_round(latest_close)
        item["change_pct"] = safe_round((latest_close - prev_close) / prev_close * 100, 2)

        # 关注度 = 当日成交量 / 过去 20 日平均成交量
        latest_volume = hist["Volume"].iloc[-1]
        avg_volume_20d = hist["Volume"].iloc[-21:-1].mean() if len(hist) >= 21 else hist["Volume"].iloc[:-1].mean()
        if avg_volume_20d > 0:
            item["attention_score"] = safe_round(latest_volume / avg_volume_20d, 2)

        # 波动性 = 最近 5 天日收益率的标准差（百分比）
        returns_5d = hist["Close"].pct_change().iloc[-5:] * 100
        item["volatility_score"] = safe_round(returns_5d.std(), 2)

    except Exception:
        pass

    return item


def _assign_quadrants(results: list):
    """
    根据 attention 和 volatility 的中位数，给每个板块打四象限标签
    - hot: 高关注 + 高波动（爆炸热点）
    - volatile: 低关注 + 高波动（妖股板块）
    - popular: 高关注 + 低波动（稳定主流）
    - quiet: 低关注 + 低波动（无人问津）
    """
    valid = [r for r in results if r["attention_score"] is not None and r["volatility_score"] is not None]
    if not valid:
        return

    att_median = np.median([r["attention_score"] for r in valid])
    vol_median = np.median([r["volatility_score"] for r in valid])

    for r in results:
        att = r["attention_score"]
        vol = r["volatility_score"]
        if att is None or vol is None:
            r["quadrant"] = None
            continue
        is_high_att = att >= att_median
        is_high_vol = vol >= vol_median
        if is_high_att and is_high_vol:
            r["quadrant"] = "hot"
        elif not is_high_att and is_high_vol:
            r["quadrant"] = "volatile"
        elif is_high_att and not is_high_vol:
            r["quadrant"] = "popular"
        else:
            r["quadrant"] = "quiet"


# ─────────────────────────────────────────
# A 股板块关注度（成交量 + 资金流）
# ─────────────────────────────────────────
def get_cn_sector_attention() -> list:
    """
    A 股行业板块的关注度评分
    用 AkShare 拉行业板块的成交额变化 + 主力净流入作为关注度
    """
    def _fetch():
        import akshare as ak

        results = []
        try:
            df = cached_fetch(
                "ak.cn.industry_name",
                lambda: retry(lambda: ak.stock_board_industry_name_em(), retries=1),
                ttl=QUOTE_TTL,
            )
            if df is None or df.empty:
                df = None

            flow_df = cached_fetch(
                "ak.cn.industry_fund_flow",
                lambda: retry(
                    lambda: ak.stock_sector_fund_flow_rank(
                        indicator="今日", sector_type="行业资金流"
                    ),
                    retries=1,
                ),
                ttl=QUOTE_TTL,
            )

            if df is None and (flow_df is None or flow_df.empty):
                fallback = get_cn_industry_sectors(top_n=15)
                for sector in fallback:
                    change = sector.get("change_pct") or 0
                    inflow = abs(sector.get("main_inflow_yi") or 0)
                    item = {
                        **sector,
                        "turnover": None,
                        "attention_score": safe_round(max(inflow, abs(change), 0.1), 2),
                        "volatility_score": safe_round(abs(change), 2),
                    }
                    results.append(item)
                _assign_quadrants(results)
                return results or None

            if df is None or df.empty:
                df = flow_df

            sort_col = next((c for c in ["涨跌幅", "今日涨跌幅", "涨跌幅(%)", "涨幅"] if c in df.columns), None)
            if sort_col:
                df = df.assign(_sort_change=df[sort_col].map(_to_float))
                df = df.sort_values("_sort_change", ascending=False)
            df = df.head(15)

            for _, row in df.iterrows():
                name = _first_existing(row, ["板块名称", "名称", "行业名称"])
                if not name:
                    continue
                change = _to_float(_first_existing(row, ["涨跌幅", "今日涨跌幅", "涨跌幅(%)", "涨幅"]))
                turnover = _to_float(_first_existing(row, ["换手率", "换手率%", "成交额占比"]))
                inflow = _to_float(_first_existing(row, ["今日主力净流入-净额", "主力净流入-净额", "净流入"]))
                item = {
                    "label": name,
                    "code": _first_existing(row, ["板块代码", "代码", "行业代码"]),
                    "price": safe_round(_to_float(_first_existing(row, ["最新价", "最新", "收盘", "收盘价"]))),
                    "change_pct": safe_round(change, 2),
                    "turnover": safe_round(turnover, 2),
                    "main_inflow_yi": None,
                    "source": "akshare",
                }

                if flow_df is not None and not flow_df.empty:
                    try:
                        matched = flow_df[flow_df["名称"] == name]
                        if not matched.empty:
                            for col in ["今日主力净流入-净额", "主力净流入-净额"]:
                                if col in matched.columns:
                                    val = _to_float(matched.iloc[0][col])
                                    if val is not None:
                                        item["main_inflow_yi"] = safe_round(val / 1e8, 2)
                                    break
                    except Exception:
                        pass
                elif inflow is not None:
                    item["main_inflow_yi"] = safe_round(inflow / 1e8, 2)

                inflow_attention = abs(item["main_inflow_yi"] or 0)
                item["attention_score"] = item["turnover"] if item["turnover"] is not None else safe_round(max(inflow_attention, abs(item["change_pct"] or 0), 0.1), 2)
                item["volatility_score"] = safe_round(abs(item["change_pct"]) if item["change_pct"] else 0, 2)

                results.append(item)

            _assign_quadrants(results)
        except Exception:
            return None

        return results or None

    return persistent_cached_fetch(
        "attention.cn.industry",
        _fetch,
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    ) or []


def _first_existing(row, columns: list[str]):
    for col in columns:
        if col in row and row.get(col) is not None:
            return row.get(col)
    return None


def _to_float(value):
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
