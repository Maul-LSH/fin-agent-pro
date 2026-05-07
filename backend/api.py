"""
api.py — FastAPI 应用入口

架构：domain-driven routers
- routers/health.py        — 健康检查
- routers/markets.py       — 市场数据 (大盘 / 板块 / 关注度 / 持仓)
- routers/analysis.py      — AI 分析 + 多公司对比
- routers/valuation.py     — DCF 估值 + 敏感性分析 (Model Builder)
- routers/portfolio.py     — 投资组合诊断

业务逻辑全部在 core/ 下，路由层只做 HTTP 协议适配。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, markets, analysis, valuation, portfolio


# ─────────────────────────────────────────
# 创建 FastAPI 应用
# ─────────────────────────────────────────
app = FastAPI(
    title="fin-agent API",
    description="AI-powered financial analysis backend (US + CN markets)",
    version="2.1.0",  # 2.1: routers refactor
)

# CORS 设置：允许前端跨域访问
# 生产环境应该把 allow_origins 改成具体的 Vercel 域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发用
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────
# 注册所有 router
# ─────────────────────────────────────────
app.include_router(health.router)
app.include_router(markets.router)
app.include_router(analysis.router)
app.include_router(valuation.router)
app.include_router(portfolio.router)
