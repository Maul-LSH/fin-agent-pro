"""
core/utils.py — 通用工具函数
所有数据格式化、重试、单位转换、内存缓存的共享逻辑
"""

import json
import re
import time
import threading
from pathlib import Path
import pandas as pd


# ─────────────────────────────────────────
# 简易内存缓存（线程安全，TTL 过期）
# ─────────────────────────────────────────
# 解决 AkShare 接口被多个 endpoint 重复调用的性能问题
# 例如 /api/sectors/cn 和 /api/attention/cn 都用 stock_board_industry_name_em()
# 加了缓存后，5 分钟内只拉一次，第二个请求直接用缓存

_cache: dict = {}
_cache_lock = threading.Lock()
_persistent_cache_lock = threading.Lock()
_persistent_cache_dir = Path(__file__).resolve().parents[1] / ".cache"


def cached_fetch(key: str, fetcher, ttl: int = 300):
    """
    带 TTL 的内存缓存

    用法:
        df = cached_fetch("ak.industry_name", lambda: ak.stock_board_industry_name_em())

    参数:
        key: 缓存键
        fetcher: 无参函数，返回要缓存的数据
        ttl: 过期时间（秒），默认 5 分钟
    """
    now = time.time()
    with _cache_lock:
        if key in _cache:
            value, expires_at = _cache[key]
            if expires_at > now:
                return value

    # 缓存未命中或已过期 — 拉取（在锁外，避免阻塞其他请求）
    try:
        value = fetcher()
    except Exception:
        return None

    if value is not None:
        with _cache_lock:
            _cache[key] = (value, now + ttl)

    return value


def _cache_path(key: str) -> Path:
    safe_key = re.sub(r"[^A-Za-z0-9_.-]+", "_", key).strip("._")
    return _persistent_cache_dir / f"{safe_key}.json"


def persistent_cached_fetch(key: str, fetcher, ttl: int = 300, stale_ttl: int | None = None):
    """
    JSON 持久缓存。

    - ttl 内直接返回 fresh cache
    - ttl 过期后优先尝试 fetcher
    - fetcher 失败时返回 stale cache（如果 stale_ttl 未过期）

    适合行情/财务这类「旧数据比空白页面更好」的外部接口。
    """
    now = time.time()
    path = _cache_path(key)
    stale_ttl = stale_ttl if stale_ttl is not None else ttl * 24

    cached_payload = None
    with _persistent_cache_lock:
        if path.exists():
            try:
                cached_payload = json.loads(path.read_text())
                if now - cached_payload.get("fetched_at", 0) <= ttl:
                    return cached_payload.get("data")
            except Exception:
                cached_payload = None

    try:
        value = fetcher()
    except Exception:
        value = None

    if value:
        with _persistent_cache_lock:
            _persistent_cache_dir.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"fetched_at": now, "data": value}, ensure_ascii=False, default=str))
        return value

    if cached_payload and now - cached_payload.get("fetched_at", 0) <= stale_ttl:
        data = cached_payload.get("data")
        if isinstance(data, dict):
            data.setdefault("_stale", True)
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    item.setdefault("_stale", True)
        return data

    return value


def cache_clear(prefix: str = ""):
    """清除缓存（可选前缀过滤）"""
    with _cache_lock:
        if not prefix:
            _cache.clear()
        else:
            for k in list(_cache.keys()):
                if k.startswith(prefix):
                    del _cache[k]


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
    """
    根据 ticker 格式判断市场，返回 'us' / 'cn' / 'hk'

    规则:
    - 6 位纯数字 → A 股 (cn)，例 600519
    - 5 位纯数字 / 包含 .HK → 港股 (hk)，例 00700, 00700.HK, 0700.HK
    - 含 .SS / .SZ / .SH / .BJ → A 股 (cn)
    - 其他 → 美股 (us)
    """
    if not ticker:
        return "us"
    ticker = ticker.strip().upper()

    # HK 后缀显式
    if ".HK" in ticker:
        return "hk"

    # A 股交易所后缀
    if any(suffix in ticker for suffix in [".SS", ".SZ", ".SH", ".BJ"]):
        return "cn"

    if ticker.isdigit():
        if len(ticker) == 6:
            return "cn"
        # HK: 4 或 5 位数字（4 位会被 pad 到 5 位，例 0700 → 00700）
        if len(ticker) in (4, 5):
            return "hk"

    return "us"


def normalize_ticker(ticker: str, market: str) -> str:
    """标准化 ticker 格式"""
    ticker = ticker.strip().upper()
    if market == "cn":
        digits = "".join(c for c in ticker if c.isdigit())[:6]
        return digits if len(digits) == 6 else ticker
    if market == "hk":
        # 提取所有数字，pad 到 5 位
        digits = "".join(c for c in ticker if c.isdigit())
        if digits:
            return digits.zfill(5)[-5:]
        return ticker
    return ticker
