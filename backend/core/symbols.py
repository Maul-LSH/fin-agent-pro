"""
core/symbols.py - Company-name to ticker lookup for valuation workflows.
"""

from typing import Any
import re

import requests
import yfinance as yf

from .utils import detect_market, retry


YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"

COMMON_SYMBOL_ALIASES = {
    "tesla": ("TSLA", "Tesla, Inc.", "NasdaqGS"),
    "tesla inc": ("TSLA", "Tesla, Inc.", "NasdaqGS"),
    "特斯拉": ("TSLA", "Tesla, Inc.", "NasdaqGS"),
    "apple": ("AAPL", "Apple Inc.", "NasdaqGS"),
    "苹果": ("AAPL", "Apple Inc.", "NasdaqGS"),
    "microsoft": ("MSFT", "Microsoft Corporation", "NasdaqGS"),
    "微软": ("MSFT", "Microsoft Corporation", "NasdaqGS"),
    "nvidia": ("NVDA", "NVIDIA Corporation", "NasdaqGS"),
    "英伟达": ("NVDA", "NVIDIA Corporation", "NasdaqGS"),
    "amazon": ("AMZN", "Amazon.com, Inc.", "NasdaqGS"),
    "亚马逊": ("AMZN", "Amazon.com, Inc.", "NasdaqGS"),
    "google": ("GOOGL", "Alphabet Inc.", "NasdaqGS"),
    "alphabet": ("GOOGL", "Alphabet Inc.", "NasdaqGS"),
    "谷歌": ("GOOGL", "Alphabet Inc.", "NasdaqGS"),
    "meta": ("META", "Meta Platforms, Inc.", "NasdaqGS"),
    "facebook": ("META", "Meta Platforms, Inc.", "NasdaqGS"),
    "脸书": ("META", "Meta Platforms, Inc.", "NasdaqGS"),
    "berkshire": ("BRK-B", "Berkshire Hathaway Inc.", "NYSE"),
    "伯克希尔": ("BRK-B", "Berkshire Hathaway Inc.", "NYSE"),
    "netflix": ("NFLX", "Netflix, Inc.", "NasdaqGS"),
    "奈飞": ("NFLX", "Netflix, Inc.", "NasdaqGS"),
    "jpmorgan": ("JPM", "JPMorgan Chase & Co.", "NYSE"),
    "jp morgan": ("JPM", "JPMorgan Chase & Co.", "NYSE"),
    "jpmorgan chase": ("JPM", "JPMorgan Chase & Co.", "NYSE"),
    "摩根": ("JPM", "JPMorgan Chase & Co.", "NYSE"),
    "摩根大通": ("JPM", "JPMorgan Chase & Co.", "NYSE"),
    "morgan stanley": ("MS", "Morgan Stanley", "NYSE"),
    "morgan": ("MS", "Morgan Stanley", "NYSE"),
    "摩根士丹利": ("MS", "Morgan Stanley", "NYSE"),
}


def _clean_query(query: str) -> str:
    return re.sub(r"\s+", " ", (query or "").strip())


def _alias_key(query: str) -> str:
    return _clean_query(query).lower().replace(",", "").replace(".", "")


def _is_probable_symbol(query: str) -> bool:
    normalized = _clean_query(query).upper()
    return bool(re.fullmatch(r"[A-Z]{1,5}([.-][A-Z])?", normalized))


def _format_exchange(exchange: str | None) -> str | None:
    if not exchange:
        return None
    return str(exchange)


def _candidate(symbol: str, name: str | None, exchange: str | None, source: str, confidence: float) -> dict:
    return {
        "symbol": symbol.upper(),
        "name": name or symbol.upper(),
        "exchange": _format_exchange(exchange),
        "market": detect_market(symbol),
        "source": source,
        "confidence": confidence,
    }


def _direct_symbol_candidate(query: str) -> dict | None:
    symbol = _clean_query(query).upper()
    if not _is_probable_symbol(symbol):
        return None
    try:
        info = retry(lambda: yf.Ticker(symbol).info, retries=1) or {}
    except Exception:
        info = {}

    quote_type = info.get("quoteType")
    name = info.get("longName") or info.get("shortName")
    if quote_type in {"EQUITY", "ETF"} or name:
        return _candidate(symbol, name, info.get("exchange"), "direct", 1.0)
    return None


def _alias_candidate(query: str) -> dict | None:
    match = COMMON_SYMBOL_ALIASES.get(_alias_key(query))
    if not match:
        return None
    symbol, name, exchange = match
    return _candidate(symbol, name, exchange, "alias", 0.98)


def _yahoo_search(query: str) -> list[dict[str, Any]]:
    params = {
        "q": query,
        "quotes_count": 8,
        "news_count": 0,
        "enableFuzzyQuery": "true",
        "quotesQueryId": "tss_match_phrase_query",
    }
    response = requests.get(YAHOO_SEARCH_URL, params=params, timeout=6)
    response.raise_for_status()
    payload = response.json()
    return payload.get("quotes") or []


def resolve_symbol(query: str, max_results: int = 5) -> dict:
    cleaned = _clean_query(query)
    result = {
        "query": query,
        "resolved": None,
        "candidates": [],
        "error": None,
    }
    if not cleaned:
        result["error"] = "Enter a company name or ticker."
        return result

    candidates: list[dict] = []
    alias = _alias_candidate(cleaned)
    if alias:
        candidates.append(alias)

    direct = _direct_symbol_candidate(cleaned)
    if direct and not any(c["symbol"] == direct["symbol"] for c in candidates):
        candidates.append(direct)

    try:
        for item in _yahoo_search(cleaned):
            symbol = item.get("symbol")
            quote_type = item.get("quoteType")
            if not symbol or quote_type not in {"EQUITY", "ETF"}:
                continue
            market = detect_market(symbol)
            if market != "us":
                continue
            name = item.get("longname") or item.get("shortname")
            exchange = item.get("exchDisp") or item.get("exchange")
            confidence = 0.95 if symbol.upper() == cleaned.upper() else 0.82
            if any(c["symbol"] == symbol.upper() for c in candidates):
                continue
            candidates.append(_candidate(symbol, name, exchange, "yahoo", confidence))
            if len(candidates) >= max_results:
                break
    except Exception as e:
        if not candidates:
            result["error"] = f"Could not search symbols: {e}"

    result["candidates"] = candidates[:max_results]
    if candidates and candidates[0]["confidence"] >= 0.9:
        result["resolved"] = candidates[0]
    elif not candidates and not result["error"]:
        result["error"] = "No matching US-listed symbol found."
    return result
