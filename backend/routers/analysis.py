"""
routers/analysis.py — AI 分析 + 多公司对比
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.data import get_company_info, get_financial_data
from core.agent import extract_company_and_intent, generate_analysis
from core.risk import assess_company_risk


router = APIRouter(prefix="/api", tags=["analysis"])


# ─────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    user_input: str
    llm_api_key: str
    provider: str = "Claude (Anthropic)"
    lang: str = "zh"


class CompareRequest(BaseModel):
    tickers: list[str]
    period: str = "2024"


# ─────────────────────────────────────────
# AI 公司分析（单公司，含风险评估）
# ─────────────────────────────────────────
@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    """
    完整的 AI 分析流程：
    1. 抽取意图（公司名 → ticker）
    2. 拉财务数据
    3. 风险评估（Altman Z, Beneish M, 现金流匹配等）
    4. LLM 生成可读的分析报告
    """
    # 第一步：意图识别
    intent = extract_company_and_intent(
        req.user_input,
        llm_api_key=req.llm_api_key,
        provider=req.provider,
        lang=req.lang,
    )

    ticker = intent.get("ticker")
    company_name = intent.get("company_name")

    if not ticker:
        if company_name:
            msg_zh = f"识别到公司「{company_name}」，但暂时找不到对应的股票代码。请尝试直接输入股票代码（如美股 'AAPL' 或 A 股 6 位数字）。"
            msg_en = f"Identified company '{company_name}' but couldn't find its ticker. Try entering the ticker directly (e.g. 'AAPL' for US or 6-digit code for China A-shares)."
        else:
            msg_zh = "没有识别到具体公司。请尝试更明确的查询，例如「分析苹果 2024 财务」或「分析 600519 财务」。"
            msg_en = "No company identified. Try a clearer query like 'Analyze Apple 2024 financials'."
        return {
            "status": "no_company",
            "message": msg_zh if req.lang == "zh" else msg_en,
        }

    # 第二步：拉数据
    company_info = get_company_info(ticker)
    if not company_info or not company_info.get("name"):
        company_info = {
            "ticker": ticker,
            "market": intent.get("market", "us"),
            "name": company_name or ticker,
        }

    # 修正未来年份：当前年份还没出年报，回退到上一年
    period = intent.get("period", "2024")
    try:
        current_year = datetime.now().year
        if int(period) >= current_year:
            period = str(current_year - 1)
    except (ValueError, TypeError):
        period = "2024"

    financial_data = get_financial_data(ticker, period)

    # 第三步：风险评估（失败时不影响主流程）
    try:
        risk_assessment = assess_company_risk(
            ticker, company_info["market"], period
        )
    except Exception as e:
        risk_assessment = {
            "overall_score": None,
            "risk_level": None,
            "summary": f"风险评估暂不可用: {e}" if req.lang == "zh" else f"Risk assessment unavailable: {e}",
            "dimension_scores": {},
            "red_flags": [],
        }

    # 第四步：生成分析
    analysis = generate_analysis(
        company_name=company_info["name"],
        ticker=ticker,
        market=company_info["market"],
        financial_data=financial_data,
        analysis_types=intent.get("analysis_types", ["financial", "valuation", "risk"]),
        period=period,
        llm_api_key=req.llm_api_key,
        provider=req.provider,
        lang=req.lang,
    )

    return {
        "status": "ok",
        "intent": intent,
        "company": company_info,
        "financial_data": financial_data,
        "risk": risk_assessment,
        "analysis": analysis,
    }


# ─────────────────────────────────────────
# 多公司对比（Apple-style）
# ─────────────────────────────────────────
@router.post("/compare")
def compare(req: CompareRequest):
    """
    批量拉多家公司的财务数据 + 风险评估
    用于多公司对比页面
    """
    if not req.tickers or len(req.tickers) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tickers")
    if len(req.tickers) > 4:
        raise HTTPException(status_code=400, detail="Max 4 tickers for comparison")

    companies = []
    for ticker in req.tickers:
        company_info = get_company_info(ticker) or {
            "ticker": ticker,
            "market": "us",
            "name": ticker,
        }
        financial = get_financial_data(ticker, req.period)

        try:
            risk = assess_company_risk(ticker, company_info["market"], req.period)
        except Exception as e:
            risk = {
                "overall_score": None,
                "risk_level": None,
                "summary": f"Risk assessment unavailable: {e}",
                "dimension_scores": {},
                "red_flags": [],
            }

        companies.append({
            "company": company_info,
            "financial": financial,
            "risk": risk,
        })

    return {"period": req.period, "companies": companies}
