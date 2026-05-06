"""
api.py — FastAPI 后端主入口
把 core/ 包装成 REST API，供 Next.js 前端调用
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal

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
from core.data import get_company_info, get_financial_data
from core.agent import extract_company_and_intent, generate_analysis
from core.risk import assess_company_risk
from core.dcf import calc_dcf, calc_sensitivity
from core.portfolio import diagnose_portfolio


# ─────────────────────────────────────────
# 创建 FastAPI 应用
# ─────────────────────────────────────────
app = FastAPI(
    title="fin-agent API",
    description="AI-powered financial analysis backend (US + CN markets)",
    version="2.0.0",
)

# CORS 设置：允许前端跨域访问
# 上线后把 allow_origins 改成你的 Vercel 域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发用，生产环境改成具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────
# 健康检查
# ─────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "service": "fin-agent API"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


# ─────────────────────────────────────────
# 市场指数
# ─────────────────────────────────────────
@app.get("/api/markets/{market}")
def markets(market: Literal["us", "cn"]):
    """市场大盘指数：美股 (us) 或 A 股 (cn)"""
    if market == "us":
        return {"market": "us", "data": get_us_market_overview()}
    return {"market": "cn", "data": get_cn_market_overview()}


# ─────────────────────────────────────────
# 板块涨跌（基础视图）
# ─────────────────────────────────────────
@app.get("/api/sectors/{market}/{category}")
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
# 板块关注度评分（二维象限图数据）
# ─────────────────────────────────────────
@app.get("/api/attention/{market}")
def attention(
    market: Literal["us", "cn"],
    category: Optional[str] = "industry",
):
    """
    板块关注度 + 波动性二维评分
    用于象限图展示
    """
    if market == "us":
        return {"data": get_us_sector_attention(category=category)}
    return {"data": get_cn_sector_attention()}


# ─────────────────────────────────────────
# 板块历史趋势（点击板块时调用）
# ─────────────────────────────────────────
@app.get("/api/sector/history")
def sector_history(market: Literal["us", "cn"], identifier: str, days: int = 90):
    """
    板块历史价格序列
    - market=us 时 identifier 是 ETF ticker（XLK 等）
    - market=cn 时 identifier 是板块名（如「半导体」）
    """
    if market == "us":
        return {"data": get_us_sector_history(identifier, days=days)}
    return {"data": get_cn_sector_history(identifier, days=days)}


# ─────────────────────────────────────────
# ETF 前 N 大持仓（板块 → 5 家公司）
# ─────────────────────────────────────────
@app.get("/api/sector/holdings")
def sector_holdings(etf_ticker: str, top_n: int = 5):
    """获取 ETF 前 N 大成分股"""
    return {"data": get_etf_top_holdings(etf_ticker, top_n=top_n)}


# ─────────────────────────────────────────
# 公司分析（AI Agent）
# ─────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    user_input: str
    llm_api_key: str
    provider: str = "Claude (Anthropic)"
    lang: str = "zh"


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    """
    完整的 AI 分析流程：
    1. 抽取意图
    2. 拉财务数据
    3. 生成分析报告
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
        # LLM 没识别到 ticker，给友好提示
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

    # 修正未来年份：如果用户问 2026 年但当前是 2026 年中，默认改成上一年（更可能有数据）
    period = intent.get("period", "2024")
    try:
        from datetime import datetime
        current_year = datetime.now().year
        if int(period) >= current_year:
            # 当前年份还没出年报，回退到最近一个完整年份
            period = str(current_year - 1)
    except (ValueError, TypeError):
        period = "2024"

    financial_data = get_financial_data(ticker, period)

    # 第三步：风险评估（财务舞弊识别 + 健康度评分）
    # 失败时不影响主分析流程
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
# 多公司对比（Apple-style comparison）
# ─────────────────────────────────────────
class CompareRequest(BaseModel):
    tickers: list[str]                  # ["AAPL", "MSFT", "GOOGL"]
    period: str = "2024"


@app.post("/api/compare")
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


# ─────────────────────────────────────────
# DCF 估值（Model Builder）
# ─────────────────────────────────────────
class DCFRequest(BaseModel):
    ticker: str
    discount_rate: float = 0.10           # WACC
    growth_rate: float = 0.05             # 5 年 FCF 增速
    terminal_growth: float = 0.025        # 终值增长率
    forecast_years: int = 5


@app.post("/api/dcf")
def dcf(req: DCFRequest):
    """单次 DCF 估值"""
    return calc_dcf(
        req.ticker,
        discount_rate=req.discount_rate,
        growth_rate=req.growth_rate,
        terminal_growth=req.terminal_growth,
        forecast_years=req.forecast_years,
    )


@app.post("/api/dcf/sensitivity")
def dcf_sensitivity(req: DCFRequest):
    """敏感性分析：保守 / 中性 / 激进 三档场景"""
    return calc_sensitivity(
        req.ticker,
        base_discount=req.discount_rate,
        base_growth=req.growth_rate,
    )


# ─────────────────────────────────────────
# 投资组合诊断（不推荐买卖）
# ─────────────────────────────────────────
class HoldingItem(BaseModel):
    ticker: str
    weight: float  # 0-1 之间


class PortfolioRequest(BaseModel):
    holdings: list[HoldingItem]


@app.post("/api/portfolio/diagnose")
def portfolio_diagnose(req: PortfolioRequest):
    """诊断用户的投资组合：加权风险、集中度、个股信号。
    
    NOTE: This endpoint provides diagnostic analysis only.
    It does NOT generate buy/sell recommendations.
    """
    holdings = [{"ticker": h.ticker, "weight": h.weight} for h in req.holdings]
    return diagnose_portfolio(holdings)
