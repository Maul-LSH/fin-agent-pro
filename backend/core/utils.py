"""
core/utils.py — 通用工具函数
所有数据格式化、重试、单位转换的共享逻辑
"""

import time
import pandas as pd


def retry(func, retries: int = 2, delay: float = 0.5):
    """
    简单重试机制，应对外部 API 偶发失败
    成功返回结果，失败返回 None
    """
    for i in range(retries + 1):
        try:
            result = func()
            if result is not None:
                return result
        except Exception:
            pass
        if i < retries:
            time.sleep(delay)
    return None


def safe_round(val, digits: int = 2):
    """安全四舍五入，处理 None / NaN / 字符串"""
    if val is None or pd.isna(val):
        return None
    try:
        return round(float(val), digits)
    except (TypeError, ValueError):
        return None


def to_billion(val):
    """美元数值 → 十亿单位（B）"""
    if val is None or pd.isna(val):
        return None
    try:
        return round(float(val) / 1e9, 2)
    except (TypeError, ValueError):
        return None


def to_yi(val):
    """人民币数值 → 亿元单位"""
    if val is None or pd.isna(val):
        return None
    try:
        return round(float(val) / 1e8, 2)
    except (TypeError, ValueError):
        return None


def find_year_column(columns, year: str):
    """在 yfinance 财报列中找到对应年份的列"""
    for col in columns:
        try:
            if hasattr(col, "year") and str(col.year) == str(year):
                return col
        except Exception:
            continue
    return columns[0] if len(columns) > 0 else None


def detect_market(ticker: str) -> str:
    """根据 ticker 格式判断市场，返回 'us' 或 'cn'"""
    if not ticker:
        return "us"
    ticker = ticker.strip().upper()
    if ticker.isdigit() and len(ticker) == 6:
        return "cn"
    if any(suffix in ticker for suffix in [".SS", ".SZ", ".SH", ".BJ"]):
        return "cn"
    return "us"


def normalize_ticker(ticker: str, market: str) -> str:
    """标准化 ticker 格式"""
    ticker = ticker.strip().upper()
    if market == "cn":
        digits = "".join(c for c in ticker if c.isdigit())[:6]
        return digits if len(digits) == 6 else ticker
    return ticker
