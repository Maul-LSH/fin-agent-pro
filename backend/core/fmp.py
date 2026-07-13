"""
core/fmp.py — Financial Modeling Prep fallback client
"""

import os
import re
from urllib.parse import urlencode

import requests

from .utils import safe_round, to_billion, persistent_cached_fetch


FMP_BASE_URL = "https://financialmodelingprep.com/stable"
QUOTE_TTL = 30 * 60
FINANCIAL_TTL = 7 * 24 * 60 * 60
STALE_TTL = 30 * 24 * 60 * 60


def _api_key() -> str | None:
    return os.getenv("FMP_API_KEY") or os.getenv("FINANCIAL_MODELING_PREP_API_KEY")


def is_configured() -> bool:
    return bool(_api_key())


def _get(endpoint: str, params: dict) -> list | dict | None:
    key = _api_key()
    if not key:
        return None

    query = dict(params)
    query["apikey"] = key
    url = f"{FMP_BASE_URL}/{endpoint}?{urlencode(query)}"
    response = requests.get(url, timeout=12)
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict) and data.get("Error Message"):
        return None
    return data


def quote(symbol: str) -> dict | None:
    def _fetch():
        data = _get("quote", {"symbol": symbol})
        if isinstance(data, list) and data:
            row = data[0]
            return {
                "symbol": row.get("symbol") or symbol,
                "name": row.get("name"),
                "price": safe_round(row.get("price")),
                "change_pct": safe_round(row.get("changesPercentage"), 2),
                "pe": safe_round(row.get("pe")),
                "pb": safe_round(row.get("priceToBookRatio")),
                "market_cap": row.get("marketCap"),
                "volume": row.get("volume"),
                "year_high": safe_round(row.get("yearHigh")),
                "year_low": safe_round(row.get("yearLow")),
            }
        return None

    return persistent_cached_fetch(
        f"fmp.quote.{symbol}",
        _fetch,
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    )


def quotes(symbols: list[str]) -> dict[str, dict]:
    return {symbol: data for symbol in symbols if (data := quote(symbol))}


def cn_symbol(ticker: str) -> str:
    digits = "".join(c for c in ticker if c.isdigit())[:6]
    if digits.startswith(("6", "9")):
        return f"{digits}.SS"
    return f"{digits}.SZ"


def hk_symbol(ticker: str) -> str:
    digits = "".join(c for c in ticker if c.isdigit())
    return f"{digits.zfill(4)}.HK"


def financial_data(symbol: str, period: str, market: str, ticker: str) -> dict | None:
    def _fetch():
        income = _statement("income-statement", symbol)
        balance = _statement("balance-sheet-statement", symbol)
        cashflow = _statement("cash-flow-statement", symbol)
        quote_data = quote(symbol) or {}

        result = {
            "market": market,
            "ticker": ticker,
            "period": period,
            "requested_period": str(period),
            "data_source": "fmp",
        }

        if quote_data:
            result["valuation"] = {
                "PE (TTM)": quote_data.get("pe"),
                "PB": quote_data.get("pb"),
                "Market Cap (B)": to_billion(quote_data.get("market_cap")),
                "Latest Price": quote_data.get("price"),
                "Change %": quote_data.get("change_pct"),
                "52W High": quote_data.get("year_high"),
                "52W Low": quote_data.get("year_low"),
                "Volume": quote_data.get("volume"),
            }

        inc = _pick_period(income, period)
        bal = _pick_period(balance, period)
        cf = _pick_period(cashflow, period)
        statement_periods = {}

        if inc:
            statement_periods["income"] = _row_year(inc)
            revenue = inc.get("revenue")
            gross_profit = inc.get("grossProfit")
            net_income = inc.get("netIncome")
            result["income"] = {
                "Revenue (B)": to_billion(revenue),
                "Gross Profit (B)": to_billion(gross_profit),
                "Operating Income (B)": to_billion(inc.get("operatingIncome")),
                "Net Income (B)": to_billion(net_income),
                "EPS": safe_round(inc.get("eps")),
            }
            if revenue:
                result["income"]["Gross Margin (%)"] = safe_round(gross_profit / revenue * 100, 2) if gross_profit else None
                result["income"]["Net Margin (%)"] = safe_round(net_income / revenue * 100, 2) if net_income else None

        if bal:
            statement_periods["balance"] = _row_year(bal)
            total_assets = bal.get("totalAssets")
            total_liabilities = bal.get("totalLiabilities")
            result["balance"] = {
                "Total Assets (B)": to_billion(total_assets),
                "Total Liabilities (B)": to_billion(total_liabilities),
                "Stockholders Equity (B)": to_billion(bal.get("totalStockholdersEquity")),
                "Cash & Equivalents (B)": to_billion(bal.get("cashAndCashEquivalents")),
                "Total Debt (B)": to_billion(bal.get("totalDebt")),
            }
            if total_assets and total_liabilities:
                result["balance"]["Debt-to-Asset Ratio (%)"] = safe_round(total_liabilities / total_assets * 100, 2)

        if cf:
            statement_periods["cashflow"] = _row_year(cf)
            result["cashflow"] = {
                "Operating Cash Flow (B)": to_billion(cf.get("netCashProvidedByOperatingActivities")),
                "Capital Expenditure (B)": to_billion(cf.get("capitalExpenditure")),
                "Free Cash Flow (B)": to_billion(cf.get("freeCashFlow")),
            }

        if statement_periods:
            actual = _resolve_actual_period(statement_periods)
            result["statement_periods"] = statement_periods
            result["actual_period_used"] = actual
            result["resolved_period"] = actual or str(period)
            result["period_matched"] = bool(actual and str(actual) == str(period))
        else:
            result["actual_period_used"] = None
            result["resolved_period"] = str(period)
            result["period_matched"] = False
        result["is_stale"] = bool(result.get("_stale"))

        return result if any(k in result for k in ("valuation", "income", "balance", "cashflow")) else None

    return persistent_cached_fetch(
        f"fmp.financial.{symbol}.{period}",
        _fetch,
        ttl=FINANCIAL_TTL,
        stale_ttl=STALE_TTL,
    )


def _statement(endpoint: str, symbol: str) -> list:
    data = _get(endpoint, {"symbol": symbol, "period": "annual", "limit": 8})
    return data if isinstance(data, list) else []


def _pick_period(rows: list[dict], period: str) -> dict | None:
    if not rows:
        return None
    for row in rows:
        date = str(row.get("date") or row.get("calendarYear") or row.get("fiscalYear") or "")
        if str(period) in date:
            return row
    return rows[0]


def _row_year(row: dict) -> str | None:
    date = str(row.get("date") or row.get("calendarYear") or row.get("fiscalYear") or "")
    match = re.search(r"\b(20\d{2}|19\d{2})\b", date)
    return match.group(1) if match else None


def _resolve_actual_period(section_periods: dict) -> str | None:
    counts: dict[str, int] = {}
    for year in section_periods.values():
        if year:
            counts[str(year)] = counts.get(str(year), 0) + 1
    if not counts:
        return None
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)[0][0]
