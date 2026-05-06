"""
core/dcf.py — DCF 估值计算 + 敏感性分析
让用户输入折现率 / 增长率 / 终值倍数，计算公司的内在价值

公式：
  PV = Σ FCF_t / (1+r)^t  +  TV / (1+r)^N
  其中 TV = FCF_N * (1+g_terminal) / (r - g_terminal)  或  FCF_N * EV/EBITDA multiple
"""

from typing import Optional
import yfinance as yf

from .utils import retry, find_year_column, safe_round


def calc_dcf(
    ticker: str,
    discount_rate: float = 0.10,           # 折现率（WACC，默认 10%）
    growth_rate: float = 0.05,             # 未来 5 年自由现金流年增长率
    terminal_growth: float = 0.025,        # 终值增长率（默认 2.5%，长期 GDP）
    forecast_years: int = 5,               # 预测期
) -> dict:
    """
    DCF 估值主入口
    返回：
    {
        "ticker": "AAPL",
        "current_fcf": 99.6,           # 当前自由现金流（十亿美元）
        "shares_outstanding": 15.2,    # 流通股本（十亿股）
        "current_price": 220.5,
        "intrinsic_value_per_share": 245.3,
        "upside_pct": 11.2,            # 比当前价高/低多少 %
        "projection": [
            {"year": 1, "fcf": 104.6, "pv": 95.1},
            ...
        ],
        "terminal_value": 2400.5,
        "terminal_value_pv": 1340.2,
        "enterprise_value": 1800.5,
        "assumptions": {...}
    }
    """
    result = {
        "ticker": ticker,
        "assumptions": {
            "discount_rate": discount_rate,
            "growth_rate": growth_rate,
            "terminal_growth": terminal_growth,
            "forecast_years": forecast_years,
        },
        "current_fcf": None,
        "current_price": None,
        "shares_outstanding": None,
        "intrinsic_value_per_share": None,
        "upside_pct": None,
        "projection": [],
        "terminal_value": None,
        "terminal_value_pv": None,
        "enterprise_value": None,
        "error": None,
    }

    # 校验：折现率必须大于终值增长率
    if discount_rate <= terminal_growth:
        result["error"] = "Discount rate must be > terminal growth rate"
        return result

    try:
        stock = yf.Ticker(ticker)
        info = retry(lambda: stock.info, retries=2) or {}
        cashflow = retry(lambda: stock.cashflow, retries=2)

        # 拿当前自由现金流
        current_fcf = None
        if cashflow is not None and not cashflow.empty:
            col = cashflow.columns[0]  # 最新一年
            try:
                fcf_val = cashflow[col].get("Free Cash Flow")
                if fcf_val is not None:
                    current_fcf = float(fcf_val)
            except Exception:
                pass

        # fallback: 用 info 里的 freeCashflow
        if current_fcf is None:
            current_fcf = info.get("freeCashflow")

        if not current_fcf or current_fcf <= 0:
            result["error"] = "Cannot retrieve positive free cash flow"
            return result

        result["current_fcf"] = safe_round(current_fcf / 1e9, 2)

        # 当前价 + 流通股本
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        shares = info.get("sharesOutstanding")
        result["current_price"] = safe_round(current_price)
        result["shares_outstanding"] = safe_round((shares or 0) / 1e9, 2) if shares else None

        # ── 计算未来 N 年 FCF 现值 ──
        projection = []
        total_pv_fcf = 0.0
        last_fcf = current_fcf

        for year in range(1, forecast_years + 1):
            future_fcf = last_fcf * (1 + growth_rate)
            pv = future_fcf / ((1 + discount_rate) ** year)
            projection.append({
                "year": year,
                "fcf": safe_round(future_fcf / 1e9, 2),
                "pv": safe_round(pv / 1e9, 2),
            })
            total_pv_fcf += pv
            last_fcf = future_fcf

        result["projection"] = projection

        # ── 终值（Gordon Growth Model）──
        terminal_fcf = last_fcf * (1 + terminal_growth)
        terminal_value = terminal_fcf / (discount_rate - terminal_growth)
        terminal_value_pv = terminal_value / ((1 + discount_rate) ** forecast_years)

        result["terminal_value"] = safe_round(terminal_value / 1e9, 2)
        result["terminal_value_pv"] = safe_round(terminal_value_pv / 1e9, 2)

        # 企业价值
        enterprise_value = total_pv_fcf + terminal_value_pv
        result["enterprise_value"] = safe_round(enterprise_value / 1e9, 2)

        # 每股内在价值
        if shares and shares > 0:
            iv_per_share = enterprise_value / shares
            result["intrinsic_value_per_share"] = safe_round(iv_per_share, 2)

            if current_price and current_price > 0:
                upside = (iv_per_share - current_price) / current_price * 100
                result["upside_pct"] = safe_round(upside, 2)

    except Exception as e:
        result["error"] = str(e)

    return result


def calc_sensitivity(ticker: str, base_discount: float = 0.10, base_growth: float = 0.05) -> dict:
    """
    敏感性分析：在 base 案例周围做 3 档场景
    - 保守：折现率 +2%，增长率 -2%
    - 中性：base
    - 激进：折现率 -2%，增长率 +2%
    """
    scenarios = {
        "conservative": {
            "label": "Conservative",
            "discount_rate": base_discount + 0.02,
            "growth_rate": max(0.0, base_growth - 0.02),
        },
        "base": {
            "label": "Base Case",
            "discount_rate": base_discount,
            "growth_rate": base_growth,
        },
        "optimistic": {
            "label": "Optimistic",
            "discount_rate": max(0.05, base_discount - 0.02),
            "growth_rate": base_growth + 0.02,
        },
    }

    out = {"ticker": ticker, "scenarios": {}}
    for key, params in scenarios.items():
        dcf = calc_dcf(
            ticker,
            discount_rate=params["discount_rate"],
            growth_rate=params["growth_rate"],
        )
        out["scenarios"][key] = {
            "label": params["label"],
            "discount_rate": params["discount_rate"],
            "growth_rate": params["growth_rate"],
            "intrinsic_value": dcf.get("intrinsic_value_per_share"),
            "upside_pct": dcf.get("upside_pct"),
            "current_price": dcf.get("current_price"),
            "error": dcf.get("error"),
        }

    return out
