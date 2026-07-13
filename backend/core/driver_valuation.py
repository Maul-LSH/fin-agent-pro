"""
core/driver_valuation.py - Driver-based valuation calculations.

This is the first executable version of the Driver Library idea. It keeps the
assumptions explicit and user-editable; the model only performs calculations.
"""

from typing import Any


def _num(value: Any, fallback: float) -> float:
    try:
        if value is None:
            return fallback
        out = float(value)
        if out != out:
            return fallback
        return out
    except (TypeError, ValueError):
        return fallback


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


TESLA_DEFAULTS = {
    "auto": {
        "deliveries_m": 2.0,
        "asp": 43000,
        "gross_margin": 0.18,
        "operating_margin": 0.10,
        "reinvestment_rate": 0.35,
        "multiple": 16.0,
    },
    "energy": {
        "revenue_b": 12.0,
        "growth": 0.28,
        "operating_margin": 0.14,
        "multiple": 18.0,
    },
    "fsd": {
        "fleet_m": 8.0,
        "attach_rate": 0.18,
        "monthly_arpu": 99.0,
        "gross_margin": 0.75,
        "operating_margin": 0.55,
        "multiple": 22.0,
        "success_probability": 0.65,
    },
    "robotaxi": {
        "tam_b": 900.0,
        "market_share": 0.04,
        "take_rate": 0.22,
        "operating_margin": 0.35,
        "multiple": 20.0,
        "success_probability": 0.20,
        "discount_years": 7.0,
        "discount_rate": 0.12,
    },
}


def default_driver_assumptions(ticker: str) -> dict:
    symbol = ticker.strip().upper()
    if symbol == "TSLA":
        return {
            "ticker": symbol,
            "template": "tesla_optionality",
            "currency": "USD",
            "assumptions": TESLA_DEFAULTS,
            "supported": True,
        }
    return {
        "ticker": symbol,
        "template": "generic",
        "currency": "USD",
        "assumptions": {},
        "supported": False,
        "error": "Driver valuation is currently available for TSLA first.",
    }


def _merge_defaults(input_assumptions: dict | None) -> dict:
    input_assumptions = input_assumptions or {}
    merged = {}
    for segment, defaults in TESLA_DEFAULTS.items():
        merged[segment] = {**defaults, **(input_assumptions.get(segment) or {})}
    return merged


def calculate_driver_valuation(
    ticker: str,
    assumptions: dict | None,
    shares_outstanding_b: float | None = None,
    net_debt_b: float | None = None,
    current_price: float | None = None,
) -> dict:
    symbol = ticker.strip().upper()
    if symbol != "TSLA":
        return {
            "ticker": symbol,
            "supported": False,
            "error": "Driver valuation is currently available for TSLA first.",
        }

    a = _merge_defaults(assumptions)
    shares = _num(shares_outstanding_b, 3.76)
    net_debt = _num(net_debt_b, -28.9)
    price = _num(current_price, 0)

    auto_revenue = _num(a["auto"].get("deliveries_m"), 2.0) * _num(a["auto"].get("asp"), 43000) / 1000
    auto_ebit = auto_revenue * _num(a["auto"].get("operating_margin"), 0.10)
    auto_fcf = auto_ebit * (1 - _num(a["auto"].get("reinvestment_rate"), 0.35))
    auto_value = auto_fcf * _num(a["auto"].get("multiple"), 16.0)

    energy_revenue = _num(a["energy"].get("revenue_b"), 12.0) * (1 + _num(a["energy"].get("growth"), 0.28))
    energy_ebit = energy_revenue * _num(a["energy"].get("operating_margin"), 0.14)
    energy_value = energy_ebit * _num(a["energy"].get("multiple"), 18.0)

    fsd_arr = (
        _num(a["fsd"].get("fleet_m"), 8.0)
        * _num(a["fsd"].get("attach_rate"), 0.18)
        * _num(a["fsd"].get("monthly_arpu"), 99.0)
        * 12
        / 1000
    )
    fsd_ebit = fsd_arr * _num(a["fsd"].get("operating_margin"), 0.55)
    fsd_value = (
        fsd_ebit
        * _num(a["fsd"].get("multiple"), 22.0)
        * _num(a["fsd"].get("success_probability"), 0.65)
    )

    robotaxi_revenue = (
        _num(a["robotaxi"].get("tam_b"), 900.0)
        * _num(a["robotaxi"].get("market_share"), 0.04)
        * _num(a["robotaxi"].get("take_rate"), 0.22)
    )
    robotaxi_ebit = robotaxi_revenue * _num(a["robotaxi"].get("operating_margin"), 0.35)
    robotaxi_future_value = (
        robotaxi_ebit
        * _num(a["robotaxi"].get("multiple"), 20.0)
        * _num(a["robotaxi"].get("success_probability"), 0.20)
    )
    robotaxi_discount = (1 + _num(a["robotaxi"].get("discount_rate"), 0.12)) ** _num(
        a["robotaxi"].get("discount_years"), 7.0
    )
    robotaxi_value = robotaxi_future_value / robotaxi_discount if robotaxi_discount else robotaxi_future_value

    segments = [
        {
            "key": "auto",
            "label": "Auto core",
            "revenue_b": _round(auto_revenue),
            "profit_b": _round(auto_fcf),
            "value_b": _round(auto_value),
            "method": "FCF multiple",
        },
        {
            "key": "energy",
            "label": "Energy",
            "revenue_b": _round(energy_revenue),
            "profit_b": _round(energy_ebit),
            "value_b": _round(energy_value),
            "method": "EBIT multiple",
        },
        {
            "key": "fsd",
            "label": "FSD subscription",
            "revenue_b": _round(fsd_arr),
            "profit_b": _round(fsd_ebit),
            "value_b": _round(fsd_value),
            "method": "Probability-weighted software EBIT",
        },
        {
            "key": "robotaxi",
            "label": "Robotaxi",
            "revenue_b": _round(robotaxi_revenue),
            "profit_b": _round(robotaxi_ebit),
            "value_b": _round(robotaxi_value),
            "method": "Discounted probability option",
        },
    ]

    enterprise_value = sum(segment["value_b"] or 0 for segment in segments)
    equity_value = enterprise_value - net_debt
    per_share = equity_value / shares if shares else None
    market_cap = price * shares if price else None
    market_gap = market_cap - equity_value if market_cap is not None else None

    return {
        "ticker": symbol,
        "supported": True,
        "template": "tesla_optionality",
        "assumptions": a,
        "segments": segments,
        "enterprise_value_b": _round(enterprise_value),
        "equity_value_b": _round(equity_value),
        "value_per_share": _round(per_share),
        "shares_outstanding_b": _round(shares),
        "net_debt_b": _round(net_debt),
        "market_cap_b": _round(market_cap),
        "market_gap_b": _round(market_gap),
        "current_price": _round(price),
        "explanation": "Editable driver model. AI can help source assumptions, but the user controls the inputs.",
    }
