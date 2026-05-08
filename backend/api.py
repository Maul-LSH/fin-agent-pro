"""
api.py — FastAPI 应用入口

架构：domain-driven routers
- routers/health.py        — 健康检查
- routers/markets.py       — 市场数据 (大盘 / 板块 / 关注度 / 持仓)
- routers/analysis.py      — AI 分析 + 多公司对比
- routers/valuation.py     — DCF 估值 + 敏感性分析 (Model Builder)
- routers/portfolio.py     — 投资组合诊断

业务逻辑全部在 core/ 下，路由层只做 HTTP 协议适配。
配置通过 .env 文件加载（可选，没有也能跑）。
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ─────────────────────────────────────────
# 加载 .env 文件（如果存在）
# ─────────────────────────────────────────
def _load_env():
    """简易 .env 加载器，避免引入 python-dotenv 依赖"""
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # 不覆盖已设置的环境变量
            if key and key not in os.environ:
                os.environ[key] = value


_load_env()


# 必须在 _load_env 之后再导入 routers
# 因为 data_sec 模块在加载时会读 SEC_EDGAR_IDENTITY 环境变量
from routers import health, markets, analysis, valuation, portfolio


# ─────────────────────────────────────────
# 创建 FastAPI 应用
# ─────────────────────────────────────────
app = FastAPI(
    title="fin-agent API",
    description="AI-powered financial analysis backend (US + CN markets)",
    version="2.2.0",  # 2.2: SEC EDGAR integration
)

# CORS: 从环境变量读取允许的 origin，默认全开（开发用）
cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "*")
if cors_origins_env == "*":
    cors_origins = ["*"]
else:
    cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
