"""
routers/markets.py — 市场数据：大盘指数 + 板块涨跌 + 关注度热度图
"""

from typing import Optional, Literal
from fastapi import APIRouter, HTTPException

from core.markets import get_us_market_overview, get_cn_market_overview
from core.sectors import (
    get_us_industry_sectors,
    get_us_size_sectors,
    get_cn_industry_sectors,
    get_cn_region_sectors,
    get_us_sector_history,
    get_cn_sector_history,
)
from core.attention import get_us_sector_attention, get_cn_sector_attention
from core.holdings import get_etf_top_holdings


router = APIRouter(prefix="/api", tags=["markets"])


# ─────────────────────────────────────────
# 市场指数
# ─────────────────────────────────────────
@router.get("/markets/{market}")
def markets(market: Literal["us", "cn"]):
    """市场大盘指数：美股 (us) 或 A 股 (cn)"""
    if market == "us":
        return {"market": "us", "data": get_us_market_overview()}
    return {"market": "cn", "data": get_cn_market_overview()}


# ─────────────────────────────────────────
# 板块涨跌（基础视图）
# ─────────────────────────────────────────
@router.get("/sectors/{market}/{category}")
def sectors(
    market: Literal["us", "cn"],
    category: str,
):
    """
    板块涨跌列表
    - market=us, category=industry: 美股 11 GICS 行业
    - market=us, category=size: 美股市值板块
    - market=cn, category=industry: A 股行业板块
    - market=cn, category=region: A 股地域板块
    """
    if market == "us":
        if category == "industry":
            return {"data": get_us_industry_sectors()}
        if category == "size":
            return {"data": get_us_size_sectors()}
        raise HTTPException(status_code=400, detail="category must be 'industry' or 'size'")

    if category == "industry":
        return {"data": get_cn_industry_sectors()}
    if category == "region":
        return {"data": get_cn_region_sectors()}
    raise HTTPException(status_code=400, detail="category must be 'industry' or 'region'")


# ─────────────────────────────────────────
# 关注度评分（二维象限 / 气泡图）
# ─────────────────────────────────────────
@router.get("/attention/{market}")
def attention(
    market: Literal["us", "cn"],
    category: Optional[str] = "industry",
):
    """板块关注度 + 波动性评分，用于热度气泡图"""
    if market == "us":
        return {"data": get_us_sector_attention(category=category)}
    return {"data": get_cn_sector_attention()}


# ─────────────────────────────────────────
# 板块历史走势
# ─────────────────────────────────────────
@router.get("/sector/history")
def sector_history(
    market: Literal["us", "cn"],
    identifier: str,
    days: int = 90,
):
    """板块历史价格序列（点击板块时调用）"""
    if market == "us":
        return {"data": get_us_sector_history(identifier, days=days)}
    return {"data": get_cn_sector_history(identifier, days=days)}


# ─────────────────────────────────────────
# ETF 前 N 大持仓
# ─────────────────────────────────────────
@router.get("/sector/holdings")
def sector_holdings(etf_ticker: str, top_n: int = 5):
    """获取 ETF 前 N 大成分股"""
    return {"data": get_etf_top_holdings(etf_ticker, top_n=top_n)}
