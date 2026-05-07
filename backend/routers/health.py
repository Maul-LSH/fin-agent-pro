"""
routers/health.py — 健康检查
"""

from fastapi import APIRouter


router = APIRouter(tags=["system"])


@router.get("/")
def root():
    return {"status": "ok", "service": "fin-agent API"}


@router.get("/api/health")
def health():
    return {"status": "healthy"}
