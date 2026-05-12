"""
routers/valuation.py — 估值模型：DCF + 敏感性分析（Model Builder）
"""

from fastapi import APIRouter
from pydantic import BaseModel

from core.dcf import calc_dcf, calc_sensitivity, suggested_dcf_assumptions


router = APIRouter(prefix="/api", tags=["valuation"])


class DCFRequest(BaseModel):
    ticker: str
    discount_rate: float = 0.10
    growth_rate: float = 0.05
    terminal_growth: float = 0.025
    forecast_years: int = 10


class DCFTickerRequest(BaseModel):
    ticker: str


@router.post("/dcf")
def dcf(req: DCFRequest):
    """单次 DCF 估值 — 给定 WACC、增长率，算每股内在价值"""
    return calc_dcf(
        req.ticker,
        discount_rate=req.discount_rate,
        growth_rate=req.growth_rate,
        terminal_growth=req.terminal_growth,
        forecast_years=req.forecast_years,
    )


@router.post("/dcf/assumptions")
def dcf_assumptions(req: DCFTickerRequest):
    """按 ticker 自动生成 DCF 建议假设：WACC、增长率、终值增长率"""
    return suggested_dcf_assumptions(req.ticker)


@router.post("/dcf/sensitivity")
def dcf_sensitivity(req: DCFRequest):
    """敏感性分析：保守 / 中性 / 激进 三档场景"""
    return calc_sensitivity(
        req.ticker,
        base_discount=req.discount_rate,
        base_growth=req.growth_rate,
        terminal_growth=req.terminal_growth,
        forecast_years=req.forecast_years,
    )
