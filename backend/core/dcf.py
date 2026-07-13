"""
core/dcf.py — DCF 估值计算 + 敏感性分析
"""

from typing import Optional
import yfinance as yf

from .utils import retry, safe_round, detect_market
from .valuation_framework import classify_valuation_framework


DEFAULT_RISK_FREE_RATE = 0.045
DEFAULT_EQUITY_RISK_PREMIUM = 0.06
DEFAULT_TAX_RATE = 0.21


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _clean_num(value) -> Optional[float]:
    try:
        if value is None:
            return None
        val = float(value)
        if val != val:
            return None
        return val
    except (TypeError, ValueError):
        return None


def _get_row_value(frame, col, labels: list[str]) -> Optional[float]:
    if frame is None or frame.empty:
        return None
    for label in labels:
        if label in frame.index:
            value = _clean_num(frame[col].get(label))
            if value is not None:
                return value
    return None


def _calc_fcf_history(cashflow, info: dict) -> list[dict]:
    history = []
    if cashflow is not None and not cashflow.empty:
        for col in list(cashflow.columns)[:3]:
            ocf = _get_row_value(
                cashflow,
                col,
                ["Operating Cash Flow", "Total Cash From Operating Activities"],
            )
            capex = _get_row_value(
                cashflow,
                col,
                ["Capital Expenditure", "Capital Expenditures"],
            )
            reported_fcf = _get_row_value(cashflow, col, ["Free Cash Flow"])
            fcf = None
            if ocf is not None and capex is not None:
                fcf = ocf + capex if capex < 0 else ocf - capex
            elif reported_fcf is not None:
                fcf = reported_fcf
            if fcf is not None:
                year = getattr(col, "year", None) or str(col)[:4]
                history.append({"year": str(year), "fcf": fcf, "ocf": ocf, "capex": capex})

    if not history:
        fallback = _clean_num(info.get("freeCashflow"))
        if fallback:
            history.append({"year": "TTM", "fcf": fallback, "ocf": None, "capex": None})

    return history


def _normalized_fcf(history: list[dict]) -> Optional[float]:
    positive = [row["fcf"] for row in history if row.get("fcf") and row["fcf"] > 0]
    if not positive:
        return None
    return sum(positive) / len(positive)


def _calc_margin_trend(financials) -> dict:
    trend = {"gross_margin": [], "operating_margin": []}
    if financials is None or financials.empty:
        return trend

    for col in list(financials.columns)[:4]:
        revenue = _get_row_value(financials, col, ["Total Revenue", "Revenue"])
        if not revenue:
            continue
        gross_profit = _get_row_value(financials, col, ["Gross Profit"])
        operating_income = _get_row_value(
            financials,
            col,
            ["Operating Income", "Operating Income or Loss"],
        )
        year = getattr(col, "year", None) or str(col)[:4]
        if gross_profit is not None:
            trend["gross_margin"].append({
                "year": str(year),
                "value": safe_round(gross_profit / revenue, 4),
            })
        if operating_income is not None:
            trend["operating_margin"].append({
                "year": str(year),
                "value": safe_round(operating_income / revenue, 4),
            })
    return trend


def _analyst_entries(stock) -> list[dict]:
    try:
        table = retry(lambda: stock.upgrades_downgrades, retries=1)
    except Exception:
        table = None
    if table is None or getattr(table, "empty", True):
        return []

    entries = []
    try:
        rows = table.reset_index().head(12)
        for _, row in rows.iterrows():
            date_value = row.get("Date") or row.get("index")
            date = str(date_value)[:10] if date_value is not None else None
            entries.append({
                "date": date,
                "firm": str(row.get("Firm")) if row.get("Firm") is not None else None,
                "to_grade": str(row.get("ToGrade")) if row.get("ToGrade") is not None else None,
                "from_grade": str(row.get("FromGrade")) if row.get("FromGrade") is not None else None,
                "action": str(row.get("Action")) if row.get("Action") is not None else None,
            })
    except Exception:
        return []
    return [entry for entry in entries if entry.get("firm")]


def _valuation_context(info: dict, financials, implied_growth_rate: Optional[float], analyst_entries: list[dict]) -> dict:
    revenue_growth = _clean_num(info.get("revenueGrowth"))
    earnings_growth = _clean_num(info.get("earningsGrowth"))
    beta = _clean_num(info.get("beta"))
    sector_text = f"{info.get('sector') or ''} {info.get('industry') or ''}".lower()
    is_growth_tech = any(word in sector_text for word in ["technology", "semiconductor", "software"])
    observed_growth = earnings_growth if earnings_growth is not None else revenue_growth
    high_growth = bool(
        (observed_growth is not None and observed_growth >= 0.25)
        or (revenue_growth is not None and revenue_growth >= 0.25)
        or (is_growth_tech and observed_growth is not None and observed_growth >= 0.20)
        or (beta is not None and beta >= 1.6)
    )

    ev_to_sales = _clean_num(info.get("enterpriseToRevenue"))
    ev_to_revenue_growth = None
    if ev_to_sales is not None and revenue_growth and revenue_growth > 0:
        ev_to_revenue_growth = ev_to_sales / (revenue_growth * 100)

    return {
        "forward_pe": safe_round(_clean_num(info.get("forwardPE")), 2),
        "peg_ratio": safe_round(
            _clean_num(info.get("pegRatio")) or _clean_num(info.get("trailingPegRatio")),
            2,
        ),
        "ev_to_sales": safe_round(ev_to_sales, 2),
        "ev_to_revenue_growth": safe_round(ev_to_revenue_growth, 2),
        "revenue_growth": safe_round(revenue_growth, 4),
        "earnings_growth": safe_round(earnings_growth, 4),
        "gross_margin": safe_round(_clean_num(info.get("grossMargins")), 4),
        "operating_margin": safe_round(_clean_num(info.get("operatingMargins")), 4),
        "margin_trend": _calc_margin_trend(financials),
        "implied_growth_rate": implied_growth_rate,
        "analyst_target": {
            "mean_price": safe_round(_clean_num(info.get("targetMeanPrice")), 2),
            "median_price": safe_round(_clean_num(info.get("targetMedianPrice")), 2),
            "low_price": safe_round(_clean_num(info.get("targetLowPrice")), 2),
            "high_price": safe_round(_clean_num(info.get("targetHighPrice")), 2),
            "recommendation": info.get("recommendationKey"),
            "opinion_count": int(_clean_num(info.get("numberOfAnalystOpinions")) or 0) or None,
            "entries": analyst_entries,
        },
        "is_high_growth": high_growth,
        "dcf_stability": "unstable" if high_growth else "moderate",
    }


def _get_risk_free_rate() -> tuple[float, str]:
    try:
        tnx = yf.Ticker("^TNX")
        hist = retry(lambda: tnx.history(period="5d"), retries=1)
        if hist is not None and not hist.empty:
            raw = _clean_num(hist["Close"].dropna().iloc[-1])
            if raw:
                if raw > 10:
                    return raw / 1000, "^TNX"
                if raw > 1:
                    return raw / 100, "^TNX"
                return raw, "^TNX"
    except Exception:
        pass
    return DEFAULT_RISK_FREE_RATE, "fallback"


def _industry_debt_spread(sector: str | None, industry: str | None, beta: float) -> float:
    text = f"{sector or ''} {industry or ''}".lower()
    if any(word in text for word in ["utility", "consumer defensive", "staples"]):
        return 0.010
    if any(word in text for word in ["technology", "communication", "healthcare"]):
        return 0.015
    if any(word in text for word in ["energy", "basic materials", "industrial", "consumer cyclical"]):
        return 0.020
    if beta >= 1.5:
        return 0.030
    if beta <= 0.8:
        return 0.012
    return 0.018


def _is_special_industry(sector: str | None, industry: str | None) -> Optional[str]:
    text = f"{sector or ''} {industry or ''}".lower()
    if any(word in text for word in ["bank", "insurance", "financial services", "capital markets"]):
        return "Banks and financial companies are better valued with Residual Income / P/B models, not classic FCF DCF."
    if "reit" in text:
        return "REITs are better valued with FFO/AFFO, not classic FCF DCF."
    return None


def calculate_wacc(ticker: str, stock=None, info: Optional[dict] = None) -> dict:
    stock = stock or yf.Ticker(ticker)
    info = info or retry(lambda: stock.info, retries=2) or {}

    rf, rf_source = _get_risk_free_rate()
    raw_beta = _clean_num(info.get("beta")) or 1.0
    raw_beta = _clamp(raw_beta, 0.6, 2.5)
    beta = _clamp(0.67 * raw_beta + 0.33 * 1.0, 0.6, 2.2)
    market_premium = DEFAULT_EQUITY_RISK_PREMIUM
    cost_of_equity = rf + beta * market_premium

    sector = info.get("sector")
    industry = info.get("industry")
    debt_spread = _industry_debt_spread(sector, industry, beta)
    pre_tax_cost_of_debt = rf + debt_spread
    tax_rate = _clean_num(info.get("effectiveTaxRate")) or DEFAULT_TAX_RATE
    tax_rate = _clamp(tax_rate, 0.0, 0.35)
    after_tax_cost_of_debt = pre_tax_cost_of_debt * (1 - tax_rate)

    market_cap = _clean_num(info.get("marketCap")) or 0
    total_debt = _clean_num(info.get("totalDebt")) or 0
    capital = market_cap + total_debt
    equity_weight = market_cap / capital if capital > 0 else 0.9
    debt_weight = total_debt / capital if capital > 0 else 0.1
    raw_wacc = equity_weight * cost_of_equity + debt_weight * after_tax_cost_of_debt
    suggested_wacc = _clamp(raw_wacc, 0.06, 0.20)

    return {
        "discount_rate": suggested_wacc,
        "raw_wacc": raw_wacc,
        "risk_free_rate": rf,
        "risk_free_source": rf_source,
        "raw_beta": raw_beta,
        "beta": beta,
        "beta_adjustment": "Blume",
        "equity_risk_premium": market_premium,
        "cost_of_equity": cost_of_equity,
        "debt_spread": debt_spread,
        "pre_tax_cost_of_debt": pre_tax_cost_of_debt,
        "tax_rate": tax_rate,
        "after_tax_cost_of_debt": after_tax_cost_of_debt,
        "equity_weight": equity_weight,
        "debt_weight": debt_weight,
        "sector": sector,
        "industry": industry,
    }


def suggested_dcf_assumptions(ticker: str) -> dict:
    market = detect_market(ticker)
    result = {
        "ticker": ticker.upper(),
        "supported": market == "us",
        "market": market,
        "discount_rate": 0.10,
        "growth_rate": 0.05,
        "terminal_growth": 0.025,
        "wacc_breakdown": None,
        "warning": None,
        "error": None,
    }
    if market != "us":
        result["error"] = "DCF is currently supported for US-listed stocks only."
        return result

    try:
        stock = yf.Ticker(ticker)
        info = retry(lambda: stock.info, retries=2) or {}
        special = _is_special_industry(info.get("sector"), info.get("industry"))
        if special:
            result["warning"] = special
        wacc = calculate_wacc(ticker, stock=stock, info=info)
        result["discount_rate"] = safe_round(wacc["discount_rate"], 4)
        result["wacc_breakdown"] = wacc
        observed_growth = _clean_num(info.get("earningsGrowth")) or _clean_num(info.get("revenueGrowth")) or 0.05
        sector_text = f"{info.get('sector') or ''} {info.get('industry') or ''}".lower()
        is_growth_tech = any(word in sector_text for word in ["technology", "semiconductor", "software"]) and observed_growth >= 0.20
        growth_cap = 0.45 if is_growth_tech else 0.25
        result["growth_rate"] = _clamp(observed_growth, -0.05, growth_cap)
    except Exception as e:
        result["warning"] = f"Using fallback assumptions because live WACC lookup failed: {e}"
    return result


def calc_dcf(
    ticker: str,
    discount_rate: float = 0.10,           # 折现率（WACC，默认 10%）
    growth_rate: float = 0.05,             # 未来 5 年自由现金流年增长率
    terminal_growth: float = 0.025,        # 终值增长率（默认 2.5%，长期 GDP）
    forecast_years: int = 5,               # 预测期
    stage1_years: int = 5,
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
    market = detect_market(ticker)
    result = {
        "ticker": ticker,
        "assumptions": {
            "discount_rate": discount_rate,
            "growth_rate": growth_rate,
            "terminal_growth": terminal_growth,
            "forecast_years": forecast_years,
            "stage1_years": stage1_years,
        },
        "current_fcf": None,
        "fcf_history": [],
        "current_price": None,
        "shares_outstanding": None,
        "intrinsic_value_per_share": None,
        "upside_pct": None,
        "projection": [],
        "terminal_value": None,
        "terminal_value_pv": None,
        "enterprise_value": None,
        "cash": None,
        "debt": None,
        "net_debt": None,
        "equity_value": None,
        "terminal_value_pct": None,
        "implied_growth_rate": None,
        "market_implied_assumptions": [],
        "valuation_context": None,
        "framework": None,
        "wacc_breakdown": None,
        "warning": None,
        "error": None,
    }

    if market != "us":
        result["error"] = "DCF is currently supported for US-listed stocks only."
        return result

    # 校验：折现率必须大于终值增长率
    if discount_rate <= terminal_growth:
        result["error"] = "Discount rate must be > terminal growth rate"
        return result

    try:
        stock = yf.Ticker(ticker)
        info = retry(lambda: stock.info, retries=2) or {}
        cashflow = retry(lambda: stock.cashflow, retries=2)
        financials = retry(lambda: stock.financials, retries=2)
        special = _is_special_industry(info.get("sector"), info.get("industry"))
        if special:
            result["warning"] = special
        framework_info = dict(info)
        framework_info.setdefault("ticker", ticker)
        framework_info.setdefault("symbol", ticker)
        result["framework"] = classify_valuation_framework(framework_info)

        fcf_history = _calc_fcf_history(cashflow, info)
        current_fcf = _normalized_fcf(fcf_history)

        if not current_fcf or current_fcf <= 0:
            result["error"] = "Cannot retrieve positive free cash flow"
            return result

        result["current_fcf"] = safe_round(current_fcf / 1e9, 2)
        result["fcf_history"] = [
            {
                "year": row["year"],
                "fcf": safe_round(row["fcf"] / 1e9, 2),
                "ocf": safe_round(row["ocf"] / 1e9, 2) if row.get("ocf") is not None else None,
                "capex": safe_round(row["capex"] / 1e9, 2) if row.get("capex") is not None else None,
            }
            for row in fcf_history
        ]
        result["wacc_breakdown"] = calculate_wacc(ticker, stock=stock, info=info)

        # 当前价 + 流通股本
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        shares = info.get("sharesOutstanding")
        result["current_price"] = safe_round(current_price)
        result["shares_outstanding"] = safe_round((shares or 0) / 1e9, 2) if shares else None
        cash = _clean_num(info.get("totalCash")) or 0
        debt = _clean_num(info.get("totalDebt")) or 0
        net_debt = debt - cash
        result["cash"] = safe_round(cash / 1e9, 2)
        result["debt"] = safe_round(debt / 1e9, 2)
        result["net_debt"] = safe_round(net_debt / 1e9, 2)

        total_years = max(forecast_years, stage1_years + 5)
        stage1_years = min(stage1_years, total_years)
        result["assumptions"]["forecast_years"] = total_years
        result["assumptions"]["stage1_years"] = stage1_years

        # ── 计算未来 N 年 FCF 现值：前 5 年高增长，后 5 年线性衰减到终值增长 ──
        projection = []
        total_pv_fcf = 0.0
        last_fcf = current_fcf

        for year in range(1, total_years + 1):
            if year <= stage1_years:
                year_growth = growth_rate
                stage = 1
            else:
                fade_year = year - stage1_years
                fade_years = total_years - stage1_years
                step = fade_year / fade_years if fade_years else 1
                year_growth = growth_rate + (terminal_growth - growth_rate) * step
                stage = 2
            future_fcf = last_fcf * (1 + year_growth)
            pv = future_fcf / ((1 + discount_rate) ** year)
            projection.append({
                "year": year,
                "stage": stage,
                "growth_rate": safe_round(year_growth, 4),
                "fcf": safe_round(future_fcf / 1e9, 2),
                "pv": safe_round(pv / 1e9, 2),
            })
            total_pv_fcf += pv
            last_fcf = future_fcf

        result["projection"] = projection

        # ── 终值（Gordon Growth Model）──
        terminal_fcf = last_fcf * (1 + terminal_growth)
        terminal_value = terminal_fcf / (discount_rate - terminal_growth)
        terminal_value_pv = terminal_value / ((1 + discount_rate) ** total_years)

        result["terminal_value"] = safe_round(terminal_value / 1e9, 2)
        result["terminal_value_pv"] = safe_round(terminal_value_pv / 1e9, 2)

        # 企业价值
        enterprise_value = total_pv_fcf + terminal_value_pv
        equity_value = enterprise_value - net_debt
        result["enterprise_value"] = safe_round(enterprise_value / 1e9, 2)
        result["equity_value"] = safe_round(equity_value / 1e9, 2)
        if enterprise_value > 0:
            result["terminal_value_pct"] = safe_round(terminal_value_pv / enterprise_value * 100, 1)

        # 每股内在价值
        if shares and shares > 0:
            iv_per_share = equity_value / shares
            result["intrinsic_value_per_share"] = safe_round(iv_per_share, 2)

            if current_price and current_price > 0:
                upside = (iv_per_share - current_price) / current_price * 100
                result["upside_pct"] = safe_round(upside, 2)
                result["implied_growth_rate"] = _solve_implied_growth(
                    market_equity_value=current_price * shares,
                    current_fcf=current_fcf,
                    discount_rate=discount_rate,
                    terminal_growth=terminal_growth,
                    net_debt=net_debt,
                    total_years=total_years,
                    stage1_years=stage1_years,
                )
                result["market_implied_assumptions"] = _market_implied_assumptions(
                    current_price=current_price,
                    intrinsic_value=iv_per_share,
                    shares=shares,
                    current_fcf=current_fcf,
                    discount_rate=discount_rate,
                    growth_rate=growth_rate,
                    terminal_growth=terminal_growth,
                    net_debt=net_debt,
                    enterprise_value=enterprise_value,
                    equity_value=equity_value,
                    terminal_value_pct=result["terminal_value_pct"],
                    implied_growth_rate=result["implied_growth_rate"],
                    framework=result["framework"],
                    total_years=total_years,
                    stage1_years=stage1_years,
                )
        result["valuation_context"] = _valuation_context(
            info,
            financials,
            result["implied_growth_rate"],
            _analyst_entries(stock),
        )

    except Exception as e:
        result["error"] = str(e)

    return result


def _project_enterprise_value(
    current_fcf: float,
    discount_rate: float,
    growth_rate: float,
    terminal_growth: float,
    total_years: int,
    stage1_years: int,
) -> float:
    total_pv = 0.0
    last_fcf = current_fcf
    for year in range(1, total_years + 1):
        if year <= stage1_years:
            year_growth = growth_rate
        else:
            fade_year = year - stage1_years
            fade_years = total_years - stage1_years
            year_growth = growth_rate + (terminal_growth - growth_rate) * (fade_year / fade_years)
        last_fcf *= 1 + year_growth
        total_pv += last_fcf / ((1 + discount_rate) ** year)
    terminal_fcf = last_fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (discount_rate - terminal_growth)
    return total_pv + terminal_value / ((1 + discount_rate) ** total_years)


def _solve_implied_growth(
    market_equity_value: float,
    current_fcf: float,
    discount_rate: float,
    terminal_growth: float,
    net_debt: float,
    total_years: int,
    stage1_years: int,
) -> Optional[float]:
    target_ev = market_equity_value + net_debt
    low, high = -0.15, 0.60
    for _ in range(60):
        mid = (low + high) / 2
        ev = _project_enterprise_value(
            current_fcf, discount_rate, mid, terminal_growth, total_years, stage1_years
        )
        if ev < target_ev:
            low = mid
        else:
            high = mid
    return safe_round((low + high) / 2, 4)


def _solve_implied_terminal_growth(
    market_equity_value: float,
    current_fcf: float,
    discount_rate: float,
    growth_rate: float,
    net_debt: float,
    total_years: int,
    stage1_years: int,
) -> tuple[Optional[float], bool]:
    target_ev = market_equity_value + net_debt
    low = -0.02
    high = min(0.08, discount_rate - 0.005)
    if high <= low:
        return None, False
    high_ev = _project_enterprise_value(
        current_fcf, discount_rate, growth_rate, high, total_years, stage1_years
    )
    capped = target_ev > high_ev
    for _ in range(60):
        mid = (low + high) / 2
        ev = _project_enterprise_value(
            current_fcf, discount_rate, growth_rate, mid, total_years, stage1_years
        )
        if ev < target_ev:
            low = mid
        else:
            high = mid
    return safe_round((low + high) / 2, 4), capped


def _implied_status(value: Optional[float], high: float, extreme: float) -> str:
    if value is None:
        return "unknown"
    if value >= extreme:
        return "extreme"
    if value >= high:
        return "stretched"
    return "reasonable"


def _market_implied_assumptions(
    current_price: float,
    intrinsic_value: float,
    shares: float,
    current_fcf: float,
    discount_rate: float,
    growth_rate: float,
    terminal_growth: float,
    net_debt: float,
    enterprise_value: float,
    equity_value: float,
    terminal_value_pct: Optional[float],
    implied_growth_rate: Optional[float],
    framework: Optional[dict],
    total_years: int,
    stage1_years: int,
) -> list[dict]:
    market_equity_value = current_price * shares
    required_ev = market_equity_value + net_debt
    premium = market_equity_value - equity_value
    premium_pct = premium / equity_value * 100 if equity_value else None
    price_gap_pct = (current_price - intrinsic_value) / intrinsic_value * 100 if intrinsic_value else None
    implied_terminal_growth, terminal_capped = _solve_implied_terminal_growth(
        market_equity_value=market_equity_value,
        current_fcf=current_fcf,
        discount_rate=discount_rate,
        growth_rate=growth_rate,
        net_debt=net_debt,
        total_years=total_years,
        stage1_years=stage1_years,
    )
    framework_type = (framework or {}).get("type")

    items = [
        {
            "key": "stage1_fcf_growth",
            "label": "Required Stage 1 FCF growth",
            "value": implied_growth_rate,
            "unit": "percent",
            "status": _implied_status(implied_growth_rate, 0.25, 0.45),
            "baseline": growth_rate,
            "explanation": "The annual FCF growth rate needed for this DCF structure to reach the current market price.",
        },
        {
            "key": "terminal_growth",
            "label": "Required terminal growth",
            "value": implied_terminal_growth,
            "unit": "percent",
            "status": "extreme" if terminal_capped else _implied_status(implied_terminal_growth, 0.04, 0.06),
            "baseline": terminal_growth,
            "capped": terminal_capped,
            "explanation": "The perpetual growth rate needed if near-term FCF growth stays at your current assumption.",
        },
        {
            "key": "market_premium",
            "label": "Market premium vs this DCF",
            "value": safe_round(premium / 1e9, 2),
            "unit": "currency_billion",
            "status": "stretched" if premium > 0 and (premium_pct or 0) > 50 else "reasonable",
            "baseline": safe_round(equity_value / 1e9, 2),
            "explanation": "The extra equity value the market is assigning above this explicit DCF scenario.",
        },
        {
            "key": "price_gap",
            "label": "Share-price gap",
            "value": safe_round(price_gap_pct, 1),
            "unit": "percent",
            "status": "stretched" if price_gap_pct and price_gap_pct > 50 else "reasonable",
            "baseline": safe_round(intrinsic_value, 2),
            "explanation": "How far the current market price sits above or below the model's intrinsic value per share.",
        },
        {
            "key": "terminal_value_weight",
            "label": "Terminal value dependence",
            "value": terminal_value_pct,
            "unit": "percent",
            "status": "stretched" if terminal_value_pct and terminal_value_pct > 75 else "reasonable",
            "baseline": None,
            "explanation": "The share of enterprise value coming from terminal value rather than explicit forecast years.",
        },
    ]

    if framework_type == "growth_optionality" and premium > 0:
        items.append({
            "key": "optionality_premium",
            "label": "Optionality premium to explain",
            "value": safe_round(premium / 1e9, 2),
            "unit": "currency_billion",
            "status": "stretched" if (premium_pct or 0) > 100 else "reasonable",
            "baseline": safe_round(required_ev / 1e9, 2),
            "explanation": "For optionality companies, this is the value that must be justified by drivers such as subscription attach rate, TAM, market share, or success probability.",
        })

    return items


def calc_sensitivity(
    ticker: str,
    base_discount: float = 0.10,
    base_growth: float = 0.05,
    terminal_growth: float = 0.025,
    forecast_years: int = 10,
) -> dict:
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
            "discount_rate": max(0.06, base_discount - 0.02),
            "growth_rate": base_growth + 0.02,
        },
    }

    out = {"ticker": ticker, "scenarios": {}}
    for key, params in scenarios.items():
        dcf = calc_dcf(
            ticker,
            discount_rate=params["discount_rate"],
            growth_rate=params["growth_rate"],
            terminal_growth=terminal_growth,
            forecast_years=forecast_years,
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
