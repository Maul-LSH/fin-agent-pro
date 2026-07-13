"""
routers/valuation.py — 估值模型：DCF + 敏感性分析（Model Builder）
"""

from fastapi import APIRouter
from pydantic import BaseModel

from core.dcf import calc_dcf, calc_sensitivity, suggested_dcf_assumptions
from core.driver_valuation import calculate_driver_valuation, default_driver_assumptions
from core.symbols import resolve_symbol


router = APIRouter(prefix="/api", tags=["valuation"])


class DCFRequest(BaseModel):
    ticker: str
    discount_rate: float = 0.10
    growth_rate: float = 0.05
    terminal_growth: float = 0.025
    forecast_years: int = 10


class DCFTickerRequest(BaseModel):
    ticker: str


class SymbolResolveRequest(BaseModel):
    query: str


class DriverValuationRequest(BaseModel):
    ticker: str
    assumptions: dict | None = None
    shares_outstanding_b: float | None = None
    net_debt_b: float | None = None
    current_price: float | None = None


@router.post("/symbol/resolve")
def symbol_resolve(req: SymbolResolveRequest):
    """Resolve a company name or loose input into US-listed ticker candidates."""
    return resolve_symbol(req.query)


@router.post("/valuation/drivers/defaults")
def driver_defaults(req: DCFTickerRequest):
    """Return editable default driver assumptions for supported companies."""
    return default_driver_assumptions(req.ticker)


@router.post("/valuation/drivers")
def driver_valuation(req: DriverValuationRequest):
    """Calculate an editable driver-based SOTP valuation."""
    return calculate_driver_valuation(
        req.ticker,
        req.assumptions,
        shares_outstanding_b=req.shares_outstanding_b,
        net_debt_b=req.net_debt_b,
        current_price=req.current_price,
    )


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
