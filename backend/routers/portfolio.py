"""
routers/portfolio.py — 投资组合诊断
NOTE: This router provides DIAGNOSTIC analysis only.
It never generates buy/sell recommendations.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from core.portfolio import diagnose_portfolio


router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class HoldingItem(BaseModel):
    ticker: str
    weight: float  # 0-1


class PortfolioRequest(BaseModel):
    holdings: list[HoldingItem]


@router.post("/diagnose")
def portfolio_diagnose(req: PortfolioRequest):
    """诊断用户的投资组合：加权风险、行业集中度、个股信号。

    This is a diagnostic tool — never returns buy/sell recommendations.
    """
    holdings = [{"ticker": h.ticker, "weight": h.weight} for h in req.holdings]
    return diagnose_portfolio(holdings)
