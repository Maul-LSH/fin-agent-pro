"""
core/valuation_framework.py - Explainable valuation framework selection.

This layer does not calculate a target price. It classifies the company into a
valuation archetype, selects appropriate model families, and exposes the
drivers a user should inspect before trusting a DCF result.
"""

from typing import Any


def _text(info: dict[str, Any]) -> str:
    return " ".join(
        str(info.get(key) or "")
        for key in ("longName", "shortName", "sector", "industry", "longBusinessSummary")
    ).lower()


def _method(key: str, label: str, role: str) -> dict:
    return {"key": key, "label": label, "role": role}


def _driver(category: str, label: str, inputs: list[str], source: str) -> dict:
    return {
        "category": category,
        "label": label,
        "inputs": inputs,
        "source": source,
    }


def _market_question(driver: str, question: str) -> dict:
    return {"driver": driver, "question": question}


def _segment(name: str, method: str, drivers: list[str], outputs: list[str]) -> dict:
    return {
        "name": name,
        "method": method,
        "drivers": drivers,
        "outputs": outputs,
    }


def _template(label: str, segments: list[dict], next_steps: list[str]) -> dict:
    return {
        "label": label,
        "segments": segments,
        "next_steps": next_steps,
    }


FRAMEWORKS = {
    "stable_fcf": {
        "label": "Stable FCF compounder",
        "description": "Mature operating company where normalized free cash flow, reinvestment, and terminal assumptions carry most of the valuation.",
        "methods": [
            _method("dcf", "DCF", "primary"),
            _method("relative", "Relative multiples", "cross-check"),
            _method("market_implied", "Market-implied assumptions", "diagnostic"),
        ],
        "drivers": [
            _driver("revenue", "Revenue growth", ["organic growth", "pricing", "volume"], "SEC filings + consensus"),
            _driver("margin", "Operating margin", ["gross margin", "opex leverage"], "SEC filings + peer margins"),
            _driver("capital", "Reinvestment", ["capex intensity", "working capital"], "cash-flow statement"),
            _driver("capital", "Shareholder return", ["buybacks", "dilution", "dividends"], "cash-flow statement"),
        ],
        "market_implied_questions": [
            _market_question("terminal_growth", "What long-term growth rate is required to justify the current price?"),
            _market_question("operating_margin", "What steady-state operating margin is the market pricing in?"),
        ],
    },
    "software_platform": {
        "label": "Software / cloud platform",
        "description": "Platform company where segment growth, recurring revenue, software mix, and margin expansion matter more than one top-line growth slider.",
        "methods": [
            _method("driver_dcf", "Driver-based DCF", "primary"),
            _method("sotp", "SOTP by segment", "primary"),
            _method("relative", "Revenue / earnings multiples", "cross-check"),
            _method("market_implied", "Market-implied assumptions", "diagnostic"),
        ],
        "drivers": [
            _driver("revenue", "Cloud / subscription growth", ["ARR", "seat growth", "usage growth"], "segment disclosures + consensus"),
            _driver("revenue", "AI product adoption", ["attach rate", "ARPU uplift", "retention"], "management guidance + product metrics"),
            _driver("margin", "Software margin expansion", ["gross margin", "sales efficiency", "R&D intensity"], "SEC filings + peers"),
            _driver("capital", "Capital intensity", ["AI capex", "data-center depreciation"], "cash-flow statement + guidance"),
        ],
        "market_implied_questions": [
            _market_question("ai_arpu", "How much AI ARPU uplift is needed to support today's multiple?"),
            _market_question("cloud_margin", "What cloud margin and growth path is the market assuming?"),
        ],
    },
    "ai_semiconductor_cycle": {
        "label": "AI semiconductor cycle",
        "description": "Cyclical growth company where demand cycles, supply constraints, gross margin normalization, and customer concentration dominate valuation.",
        "methods": [
            _method("cycle_dcf", "Cycle-aware DCF", "primary"),
            _method("relative", "Forward multiples", "cross-check"),
            _method("scenario", "Bull/base/bear cycle scenarios", "primary"),
            _method("market_implied", "Market-implied assumptions", "diagnostic"),
        ],
        "drivers": [
            _driver("revenue", "Accelerator demand", ["units", "ASP", "backlog", "hyperscaler capex"], "segment disclosures + industry data"),
            _driver("margin", "Gross margin normalization", ["mix", "supply tightness", "pricing"], "SEC filings + peers"),
            _driver("capital", "Inventory and working capital", ["inventory turns", "prepayments"], "balance sheet + cash-flow statement"),
            _driver("probability", "Cycle duration", ["peak year", "normalization year", "replacement cycle"], "industry data + scenarios"),
        ],
        "market_implied_questions": [
            _market_question("peak_revenue", "What peak revenue and duration are required to justify current value?"),
            _market_question("normalized_margin", "What normalized gross margin is embedded in today's price?"),
        ],
    },
    "growth_optionality": {
        "label": "Growth optionality company",
        "description": "Company where the current FCF base is only one layer; software, autonomy, energy, or platform options can dominate the market price.",
        "methods": [
            _method("sotp", "SOTP", "primary"),
            _method("probability_dcf", "Probability-weighted DCF", "primary"),
            _method("real_option", "Real option analysis", "supplemental"),
            _method("market_implied", "Market-implied assumptions", "diagnostic"),
        ],
        "drivers": [
            _driver("revenue", "Core product volume", ["deliveries", "ASP", "market share"], "SEC filings + industry data"),
            _driver("margin", "Core gross margin", ["pricing", "cost curve", "mix"], "SEC filings + peer margins"),
            _driver("optionality", "Software / subscription", ["attach rate", "ARPU", "churn", "software margin"], "management guidance + user assumptions"),
            _driver("optionality", "New market option", ["TAM", "success probability", "launch year", "take rate"], "assumption database + user selection"),
            _driver("capital", "Scaling investment", ["capex", "working capital", "manufacturing footprint"], "cash-flow statement + guidance"),
        ],
        "market_implied_questions": [
            _market_question("option_success", "What probability of the optionality case is required to justify the current price?"),
            _market_question("attach_rate", "What subscription attach rate or market share is embedded in today's price?"),
            _market_question("terminal_growth", "Does the market price require a terminal growth rate that looks economically unrealistic?"),
        ],
    },
    "bank": {
        "label": "Bank / financial institution",
        "description": "Financial company where classic FCF DCF is usually inappropriate; book value growth, ROTCE, credit losses, and capital returns drive value.",
        "methods": [
            _method("residual_income", "Residual income", "primary"),
            _method("pb_rotce", "P/TBV vs ROTCE", "primary"),
            _method("dividend_discount", "Dividend / capital return model", "cross-check"),
        ],
        "drivers": [
            _driver("financial", "ROTCE", ["net interest margin", "fee income", "efficiency ratio"], "bank filings + consensus"),
            _driver("financial", "Credit cycle", ["charge-offs", "provisions", "reserve build"], "bank filings + macro scenarios"),
            _driver("capital", "Tangible book value", ["retained earnings", "buybacks", "AOCI"], "balance sheet"),
            _driver("capital", "Capital return", ["CET1", "dividends", "repurchases"], "regulatory filings + guidance"),
        ],
        "market_implied_questions": [
            _market_question("rotce", "What sustainable ROTCE is required to support the current P/TBV?"),
            _market_question("credit_losses", "What credit-loss cycle is the market discounting?"),
        ],
    },
    "reit": {
        "label": "REIT / real asset company",
        "description": "REIT where AFFO, occupancy, cap rates, leverage, and NAV are more useful than classic FCF DCF.",
        "methods": [
            _method("affo", "AFFO model", "primary"),
            _method("nav", "NAV / cap-rate model", "primary"),
            _method("relative", "P/AFFO and implied cap rate", "cross-check"),
        ],
        "drivers": [
            _driver("real_asset", "NOI growth", ["rent growth", "occupancy", "same-store NOI"], "supplemental filings"),
            _driver("real_asset", "Cap rate", ["market cap rate", "asset quality", "geography"], "industry transactions"),
            _driver("capital", "Leverage", ["net debt / EBITDA", "refinancing rate"], "balance sheet + debt schedule"),
            _driver("capital", "AFFO payout", ["dividend", "retained AFFO"], "REIT filings"),
        ],
        "market_implied_questions": [
            _market_question("cap_rate", "What implied cap rate does the current price represent?"),
            _market_question("affo_growth", "What AFFO growth is required to justify the current multiple?"),
        ],
    },
    "pharma_pipeline": {
        "label": "Pharma / biotech pipeline",
        "description": "Healthcare company where existing products, patent cliffs, and probability-weighted pipeline assets should be valued separately.",
        "methods": [
            _method("base_dcf", "Existing portfolio DCF", "primary"),
            _method("pipeline_rnpv", "Pipeline probability-weighted NPV", "primary"),
            _method("relative", "Peer multiples", "cross-check"),
        ],
        "drivers": [
            _driver("revenue", "Existing products", ["volume", "price", "LOE year"], "SEC filings + product disclosures"),
            _driver("probability", "Pipeline assets", ["phase", "probability of approval", "launch year", "peak sales"], "clinical pipeline + assumptions"),
            _driver("margin", "R&D and SG&A intensity", ["R&D spend", "sales leverage"], "income statement"),
            _driver("capital", "Capital allocation", ["M&A", "buybacks", "dividend"], "cash-flow statement + guidance"),
        ],
        "market_implied_questions": [
            _market_question("pipeline_success", "What pipeline success probability is embedded in the current price?"),
            _market_question("patent_cliff", "How severe a patent-cliff decline is the market discounting?"),
        ],
    },
    "energy_commodity": {
        "label": "Energy / commodity producer",
        "description": "Commodity-sensitive business where price decks, production, reserves, reinvestment, and balance sheet discipline drive value.",
        "methods": [
            _method("commodity_scenario", "Commodity scenario DCF", "primary"),
            _method("nav", "Reserve / asset NAV", "primary"),
            _method("relative", "EV/EBITDA and FCF yield", "cross-check"),
        ],
        "drivers": [
            _driver("revenue", "Commodity price deck", ["oil price", "gas price", "crack spread"], "market data + scenarios"),
            _driver("revenue", "Production", ["volume", "decline rate", "reserve life"], "operating disclosures"),
            _driver("capital", "Reinvestment", ["maintenance capex", "growth capex"], "cash-flow statement"),
            _driver("capital", "Shareholder returns", ["dividends", "buybacks", "debt reduction"], "cash-flow statement + guidance"),
        ],
        "market_implied_questions": [
            _market_question("price_deck", "What long-term commodity price deck is implied by the current share price?"),
            _market_question("reinvestment", "What reinvestment and decline-rate assumptions are embedded?"),
        ],
    },
}

DRIVER_TEMPLATES = {
    "TSLA": _template(
        "Tesla optionality SOTP",
        [
            _segment(
                "Auto core",
                "Driver DCF",
                ["vehicle deliveries", "ASP", "auto gross margin", "capex intensity"],
                ["revenue", "EBIT", "FCF"],
            ),
            _segment(
                "Energy",
                "Segment DCF",
                ["storage deployments", "revenue per GWh", "energy gross margin"],
                ["revenue", "EBIT", "FCF"],
            ),
            _segment(
                "FSD subscription",
                "Probability-weighted software DCF",
                ["fleet size", "attach rate", "monthly ARPU", "software gross margin"],
                ["ARR", "gross profit", "option value"],
            ),
            _segment(
                "Robotaxi",
                "Real option / probability DCF",
                ["launch year", "TAM", "market share", "take rate", "success probability"],
                ["probability-weighted value", "market-implied probability"],
            ),
        ],
        [
            "Let users choose FSD attach-rate and Robotaxi success-probability assumptions.",
            "Back-solve the Robotaxi probability or FSD attach rate required by the current market price.",
        ],
    ),
    "MSFT": _template(
        "Microsoft cloud and AI SOTP",
        [
            _segment(
                "Productivity and business processes",
                "Segment DCF",
                ["seat growth", "ARPU", "Copilot attach rate", "renewal rate"],
                ["revenue", "operating income", "FCF"],
            ),
            _segment(
                "Azure and cloud",
                "Driver DCF",
                ["cloud revenue growth", "AI workload mix", "data-center capex", "cloud margin"],
                ["revenue", "EBIT", "reinvestment"],
            ),
            _segment(
                "Gaming and devices",
                "Relative / segment DCF",
                ["content growth", "subscription users", "hardware cycle"],
                ["segment value", "margin contribution"],
            ),
        ],
        [
            "Separate AI ARPU uplift from baseline cloud growth.",
            "Back-solve the Copilot attach rate or Azure margin embedded in market price.",
        ],
    ),
    "JPM": _template(
        "JPMorgan bank valuation",
        [
            _segment(
                "Core banking",
                "Residual income",
                ["tangible book value", "ROTCE", "cost of equity", "retention ratio"],
                ["residual income", "equity value"],
            ),
            _segment(
                "Credit cycle",
                "Scenario overlay",
                ["charge-offs", "provision rate", "reserve build", "macro stress"],
                ["loss-adjusted earnings", "capital impact"],
            ),
            _segment(
                "Capital return",
                "P/TBV cross-check",
                ["CET1 ratio", "buybacks", "dividends", "AOCI recovery"],
                ["TBV growth", "shareholder yield"],
            ),
        ],
        [
            "Use residual income as the primary model instead of FCF DCF.",
            "Back-solve sustainable ROTCE required by the current P/TBV.",
        ],
    ),
    "PLD": _template(
        "Prologis REIT NAV and AFFO",
        [
            _segment(
                "Operating portfolio",
                "AFFO model",
                ["same-store NOI growth", "occupancy", "rent spreads", "AFFO payout"],
                ["AFFO", "dividend capacity"],
            ),
            _segment(
                "Real estate NAV",
                "NAV / cap-rate model",
                ["NOI", "market cap rate", "asset quality", "net debt"],
                ["NAV", "implied cap rate"],
            ),
            _segment(
                "Development pipeline",
                "Probability-weighted NAV",
                ["development yield", "lease-up probability", "funding cost"],
                ["incremental NAV", "AFFO contribution"],
            ),
        ],
        [
            "Use AFFO and NAV as primary methods rather than classic FCF DCF.",
            "Back-solve the implied cap rate embedded in the current share price.",
        ],
    ),
}

DEFAULT_TEMPLATES = {
    "growth_optionality": DRIVER_TEMPLATES["TSLA"],
    "software_platform": DRIVER_TEMPLATES["MSFT"],
    "bank": DRIVER_TEMPLATES["JPM"],
    "reit": DRIVER_TEMPLATES["PLD"],
}


def classify_valuation_framework(info: dict[str, Any]) -> dict:
    text = _text(info)
    sector = str(info.get("sector") or "")
    industry = str(info.get("industry") or "")
    ticker = str(info.get("symbol") or info.get("ticker") or "").upper()

    if any(word in text for word in ["reit", "real estate investment trust"]):
        key = "reit"
    elif any(word in text for word in ["bank", "capital markets", "credit services", "financial services"]):
        key = "bank"
    elif any(word in text for word in ["pharmaceutical", "biotechnology", "drug manufacturers", "therapeutics"]):
        key = "pharma_pipeline"
    elif sector.lower() in {"energy", "basic materials"} or any(word in text for word in ["oil", "gas", "mining", "commodity"]):
        key = "energy_commodity"
    elif any(word in text for word in ["semiconductor", "gpu", "accelerated computing", "chip"]):
        key = "ai_semiconductor_cycle"
    elif any(word in text for word in ["automobiles", "auto manufacturers", "electric vehicle", "autonomous", "robotaxi", "solar", "energy storage"]):
        key = "growth_optionality"
    elif any(word in text for word in ["software", "cloud", "platform", "subscription", "saas", "internet content"]):
        key = "software_platform"
    else:
        key = "stable_fcf"

    framework = FRAMEWORKS[key]
    template = DRIVER_TEMPLATES.get(ticker) or DEFAULT_TEMPLATES.get(key)
    confidence = 0.78
    if key in {"bank", "reit", "pharma_pipeline"}:
        confidence = 0.88
    if ticker in {"TSLA", "NVDA", "JPM", "PLD", "MSFT", "AAPL", "XOM", "PFE"}:
        confidence = 0.92

    return {
        "type": key,
        "label": framework["label"],
        "description": framework["description"],
        "confidence": confidence,
        "sector": sector or None,
        "industry": industry or None,
        "recommended_methods": framework["methods"],
        "drivers": framework["drivers"],
        "driver_template": template,
        "market_implied_questions": framework["market_implied_questions"],
        "principle": "AI extracts and explains assumptions; the model calculates; the user decides which assumptions to trust.",
    }
