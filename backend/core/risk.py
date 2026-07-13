"""
core/risk.py — 财务风险与舞弊识别引擎
基于学术成熟模型，所有计算只用 yfinance / AkShare 现有数据

核心方法：
- Altman Z-Score: 破产风险预测（半个世纪验证有效）
- Beneish M-Score: 财务造假识别（安然案例预警过）
- 现金流匹配度: 利润含金量（最强造假信号）
- 应收账款异常增长: 虚增收入预警
- 综合风险评分: 0-100，越高越危险
"""

from typing import Optional
import yfinance as yf
import pandas as pd

from .utils import retry, find_year_column, safe_round


# ─────────────────────────────────────────
# 主入口：综合风险评估
# ─────────────────────────────────────────
def assess_company_risk(ticker: str, market: str = "us", period: str = "2024") -> dict:
    """
    对公司做综合风险评估
    返回：
    {
        "overall_score": 65,              # 综合风险分（0-100，越高越危险）
        "risk_level": "medium",           # low / medium / high
        "summary": "...",                  # 一句话总结
        "altman_z": {...},                # Altman Z-Score
        "beneish_m": {...},               # Beneish M-Score
        "cash_quality": {...},            # 现金流匹配度
        "receivables": {...},             # 应收账款分析
        "dimension_scores": {             # 五维度评分（0-100）
            "profitability": 70,
            "solvency": 60,
            "cash_flow": 80,
            "revenue_quality": 65,
            "valuation": 55,
        },
        "red_flags": [...]                # 异常指标列表（最关键的信息）
    }
    """
    if market == "us":
        return _assess_us_risk(ticker, period)
    else:
        return _assess_cn_risk(ticker, period)


# ─────────────────────────────────────────
# 美股风险评估（yfinance）
# ─────────────────────────────────────────
US_INDUSTRY_OVERRIDES = {
    "JPM": "bank_or_financial",
    "BAC": "bank_or_financial",
    "WFC": "bank_or_financial",
    "C": "bank_or_financial",
    "GS": "bank_or_financial",
    "MS": "bank_or_financial",
    "BRK-B": "insurance",
    "BRK.B": "insurance",
    "AIG": "insurance",
    "MET": "insurance",
    "PRU": "insurance",
    "O": "reit",
    "PLD": "reit",
    "AMT": "reit",
    "SPG": "reit",
    "WMT": "retail",
    "COST": "retail",
    "TGT": "retail",
    "HD": "retail",
    "LOW": "retail",
    "XOM": "energy_or_capital_intensive",
    "CVX": "energy_or_capital_intensive",
    "COP": "energy_or_capital_intensive",
}


def _classify_us_industry_profile(ticker: str, info: dict, facts: dict) -> dict:
    ticker_key = (ticker or "").upper().replace("-", ".")
    sector = str(info.get("sector") or "")
    industry = str(info.get("industry") or "")
    quote_type = str(info.get("quoteType") or "")
    text = f"{sector} {industry} {quote_type}".lower()
    signals = []
    confidence = 0.35

    if sector:
        signals.append(f"sector={sector}")
        confidence += 0.15
    if industry:
        signals.append(f"industry={industry}")
        confidence += 0.15

    override = US_INDUSTRY_OVERRIDES.get(ticker_key) or US_INDUSTRY_OVERRIDES.get((ticker or "").upper())
    profile_type = override
    if override:
        signals.append(f"ticker override={override}")
        confidence = max(confidence, 0.85)

    if profile_type is None:
        if any(k in text for k in ["bank", "capital markets", "credit services", "asset management", "mortgage finance", "financial services"]):
            profile_type = "bank_or_financial"
        elif any(k in text for k in ["insurance", "reinsurance"]):
            profile_type = "insurance"
        elif "reit" in text or ("real estate" in text and "investment trust" in text):
            profile_type = "reit"
        elif any(k in text for k in ["software", "internet", "semiconductor", "technology", "communication services", "interactive media"]):
            profile_type = "tech_light_asset"
        elif any(k in text for k in ["retail", "discount stores", "grocery", "department stores", "home improvement"]):
            profile_type = "retail"
        elif any(k in text for k in ["energy", "oil", "gas", "utilities", "telecom", "metals", "mining"]):
            profile_type = "energy_or_capital_intensive"
        elif any(k in text for k in ["industrial", "machinery", "auto", "aerospace", "manufacturing", "chemicals", "building products"]):
            profile_type = "manufacturing"
        else:
            profile_type = "generic_non_manufacturing"

    total_assets = facts.get("total_assets") or 0
    revenue = facts.get("revenue") or 0
    gross_profit = facts.get("gross_profit")
    ppe = facts.get("ppe")
    inventory = facts.get("inventory")
    total_debt = facts.get("total_debt")
    cash = facts.get("cash")

    if total_assets > 0:
        asset_turnover = revenue / total_assets if revenue else None
        ppe_assets = ppe / total_assets if ppe is not None else None
        inventory_assets = inventory / total_assets if inventory is not None else None
        if asset_turnover is not None:
            signals.append(f"asset_turnover={safe_round(asset_turnover, 2)}")
        if ppe_assets is not None:
            signals.append(f"ppe/assets={safe_round(ppe_assets, 2)}")
        if inventory_assets is not None:
            signals.append(f"inventory/assets={safe_round(inventory_assets, 2)}")

        if ppe_assets is not None and ppe_assets > 0.35 and profile_type in {"generic_non_manufacturing", "energy_or_capital_intensive"}:
            profile_type = "energy_or_capital_intensive"
            confidence += 0.10
        if inventory_assets is not None and inventory_assets > 0.12 and profile_type == "generic_non_manufacturing":
            profile_type = "retail"
            confidence += 0.08

    if revenue and gross_profit is not None:
        gross_margin = gross_profit / revenue
        signals.append(f"gross_margin={safe_round(gross_margin * 100, 1)}%")
        if gross_margin > 0.45 and profile_type == "generic_non_manufacturing":
            profile_type = "tech_light_asset"
            confidence += 0.08

    if total_debt is not None and cash is not None and total_debt > 0:
        signals.append(f"cash/debt={safe_round(cash / total_debt, 2)}")

    model_by_type = {
        "bank_or_financial": ("financial_institution_framework", False, None),
        "insurance": ("insurance_framework", False, None),
        "reit": ("reit_framework", False, None),
        "manufacturing": ("altman_original_plus_quality_checks", True, "original"),
        "tech_light_asset": ("z_double_prime_plus_cash_quality", True, "z_double_prime"),
        "retail": ("z_double_prime_plus_inventory_cash_conversion", True, "z_double_prime"),
        "energy_or_capital_intensive": ("z_double_prime_plus_debt_capex_coverage", True, "z_double_prime"),
        "generic_non_manufacturing": ("z_double_prime_plus_quality_checks", True, "z_double_prime"),
    }
    recommended_model, altman_applicable, altman_variant = model_by_type.get(
        profile_type,
        ("z_double_prime_plus_quality_checks", True, "z_double_prime"),
    )

    if not altman_applicable:
        note = "Altman Z-Score is not suitable for this business model; use sector-specific capital, liquidity, and asset-quality checks."
    elif altman_variant == "original":
        note = "Original Altman Z-Score is used because this profile is closer to manufacturing / asset-turnover businesses."
    else:
        note = "Altman Z'' is used because it removes Sales / Total Assets, reducing asset-turnover bias for non-manufacturing companies."

    return {
        "type": profile_type,
        "confidence": safe_round(min(confidence, 0.95), 2),
        "sector": sector or None,
        "industry": industry or None,
        "signals": signals[:8],
        "recommended_model": recommended_model,
        "altman_applicable": altman_applicable,
        "altman_variant": altman_variant,
        "note": note,
    }


def _assess_us_risk(ticker: str, period: str) -> dict:
    result = {
        "ticker": ticker,
        "market": "us",
        "period": period,
        "overall_score": None,
        "risk_level": None,
        "summary": "",
        "altman_z": None,
        "beneish_m": None,
        "cash_quality": None,
        "receivables": None,
        "industry_profile": None,
        "dimension_scores": {},
        "red_flags": [],
        "risk_scenarios": [],
        "disclosure_checks": [],
        "model_confidence": None,
        "risk_drivers": [],
        "mitigating_factors": [],
        "stress_tests": [],
    }

    try:
        stock = yf.Ticker(ticker)
        info = retry(lambda: stock.info, retries=2) or {}
        income = retry(lambda: stock.income_stmt, retries=2)
        balance = retry(lambda: stock.balance_sheet, retries=2)
        cashflow = retry(lambda: stock.cashflow, retries=2)

        if income is None or balance is None:
            result["summary"] = "财务数据不足，无法完成风险评估"
            return result

        col = find_year_column(income.columns, period)
        if col is None:
            result["summary"] = f"未找到 {period} 年财报数据"
            return result

        prev_col = None
        if len(income.columns) > 1:
            cols_sorted = sorted(income.columns, reverse=True)
            for c in cols_sorted:
                if c != col:
                    prev_col = c
                    break

        # 提取关键字段（处理可能的字段名差异）
        def get_val(df, c, *keys):
            if df is None or c is None:
                return None
            for key in keys:
                try:
                    val = df[c].get(key)
                    if val is not None and not pd.isna(val):
                        return float(val)
                except Exception:
                    continue
            return None

        # 利润表
        revenue = get_val(income, col, "Total Revenue", "Revenue")
        gross_profit = get_val(income, col, "Gross Profit")
        operating_income = get_val(income, col, "Operating Income", "EBIT")
        net_income = get_val(income, col, "Net Income")
        sga = get_val(income, col, "Selling General And Administration", "SG&A")
        depreciation = get_val(income, col, "Reconciled Depreciation", "Depreciation And Amortization")
        interest_expense = get_val(income, col, "Interest Expense", "Interest Expense Non Operating")

        # 上一年数据（计算变化用）
        prev_revenue = get_val(income, prev_col, "Total Revenue", "Revenue")
        prev_gross = get_val(income, prev_col, "Gross Profit")
        prev_sga = get_val(income, prev_col, "Selling General And Administration", "SG&A")
        prev_depreciation = get_val(income, prev_col, "Reconciled Depreciation", "Depreciation And Amortization")
        prev_interest_expense = get_val(income, prev_col, "Interest Expense", "Interest Expense Non Operating")

        # 资产负债表
        total_assets = get_val(balance, col, "Total Assets")
        current_assets = get_val(balance, col, "Current Assets")
        current_liab = get_val(balance, col, "Current Liabilities")
        total_liab = get_val(balance, col, "Total Liabilities Net Minority Interest")
        retained_earnings = get_val(balance, col, "Retained Earnings")
        receivables = get_val(balance, col, "Accounts Receivable")
        ppe = get_val(balance, col, "Net PPE", "Properties Plants Equipment")
        inventory = get_val(balance, col, "Inventory")
        cash = get_val(balance, col, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")
        total_debt = get_val(balance, col, "Total Debt")
        short_debt = get_val(balance, col, "Current Debt", "Current Debt And Capital Lease Obligation")
        payables = get_val(balance, col, "Accounts Payable")
        goodwill = get_val(balance, col, "Goodwill")
        intangible_assets = get_val(balance, col, "Other Intangible Assets", "Goodwill And Other Intangible Assets")
        contract_liab = get_val(balance, col, "Current Deferred Revenue", "Contract Liabilities", "Deferred Revenue")
        equity = get_val(balance, col, "Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest")

        prev_total_assets = get_val(balance, prev_col, "Total Assets")
        prev_current_assets = get_val(balance, prev_col, "Current Assets")
        prev_current_liab = get_val(balance, prev_col, "Current Liabilities")
        prev_total_liab = get_val(balance, prev_col, "Total Liabilities Net Minority Interest")
        prev_receivables = get_val(balance, prev_col, "Accounts Receivable")
        prev_ppe = get_val(balance, prev_col, "Net PPE", "Properties Plants Equipment")
        prev_inventory = get_val(balance, prev_col, "Inventory")
        prev_cash = get_val(balance, prev_col, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")
        prev_total_debt = get_val(balance, prev_col, "Total Debt")
        prev_short_debt = get_val(balance, prev_col, "Current Debt", "Current Debt And Capital Lease Obligation")
        prev_payables = get_val(balance, prev_col, "Accounts Payable")
        prev_goodwill = get_val(balance, prev_col, "Goodwill")
        prev_contract_liab = get_val(balance, prev_col, "Current Deferred Revenue", "Contract Liabilities", "Deferred Revenue")

        # 现金流
        operating_cf = None
        capex = None
        debt_issued = None
        debt_repaid = None
        depreciation_cf = None
        if cashflow is not None:
            cf_col = find_year_column(cashflow.columns, period)
            if cf_col is not None:
                operating_cf = get_val(cashflow, cf_col, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
                capex = get_val(cashflow, cf_col, "Capital Expenditure", "Purchase Of PPE", "Investments In Property Plant And Equipment")
                debt_issued = get_val(cashflow, cf_col, "Issuance Of Debt", "Net Issuance Payments Of Debt")
                debt_repaid = get_val(cashflow, cf_col, "Repayment Of Debt")
                depreciation_cf = get_val(cashflow, cf_col, "Depreciation And Amortization", "Depreciation")

        # 市值
        market_cap = info.get("marketCap")

        industry_profile = _classify_us_industry_profile(
            ticker=ticker,
            info=info,
            facts={
                "revenue": revenue,
                "gross_profit": gross_profit,
                "total_assets": total_assets,
                "ppe": ppe,
                "inventory": inventory,
                "cash": cash,
                "total_debt": total_debt,
                "total_liab": total_liab,
                "equity": equity,
                "capex": capex,
            },
        )
        result["industry_profile"] = industry_profile

        # ── 1. Altman family model, routed by industry applicability ──
        if industry_profile.get("altman_applicable") is False:
            result["altman_z"] = None
        elif industry_profile.get("altman_variant") == "original":
            result["altman_z"] = _calc_altman_z(
                current_assets, current_liab, total_assets, retained_earnings,
                operating_income, market_cap, total_liab, revenue,
            )
        else:
            result["altman_z"] = _calc_altman_z_double_prime(
                current_assets, current_liab, total_assets, retained_earnings,
                operating_income, total_liab, equity,
            )

        # ── 2. 现金流匹配度（最强的造假信号）──
        result["cash_quality"] = _calc_cash_quality(net_income, operating_cf)

        # ── 3. 应收账款异常增长 ──
        result["receivables"] = _calc_receivables_anomaly(
            revenue, receivables, prev_revenue, prev_receivables
        )

        # ── 4. Beneish M-Score（简化版）──
        result["beneish_m"] = _calc_beneish_m(
            revenue, prev_revenue,
            receivables, prev_receivables,
            gross_profit, prev_gross,
            current_assets, ppe, total_assets,
            prev_current_assets, prev_ppe, prev_total_assets,
            depreciation, prev_depreciation,
            sga, prev_sga,
            total_liab, prev_total_liab,
            net_income, operating_cf,
        )

        # ── 5. 五维度评分 ──
        result["dimension_scores"] = _calc_dimension_scores(
            net_income, revenue, total_assets,
            current_assets, current_liab, total_liab,
            operating_cf, gross_profit,
            prev_revenue, info,
        )

        # ── 6. 红旗预警清单 ──
        result["red_flags"] = _collect_red_flags(result, {
            "revenue": revenue,
            "net_income": net_income,
            "operating_cf": operating_cf,
            "receivables": receivables,
            "prev_receivables": prev_receivables,
            "current_assets": current_assets,
            "current_liab": current_liab,
        })

        facts = {
            "revenue": revenue,
            "prev_revenue": prev_revenue,
            "gross_profit": gross_profit,
            "prev_gross": prev_gross,
            "operating_income": operating_income,
            "net_income": net_income,
            "sga": sga,
            "prev_sga": prev_sga,
            "depreciation": depreciation or depreciation_cf,
            "prev_depreciation": prev_depreciation,
            "interest_expense": interest_expense or prev_interest_expense,
            "total_assets": total_assets,
            "prev_total_assets": prev_total_assets,
            "current_assets": current_assets,
            "current_liab": current_liab,
            "prev_current_liab": prev_current_liab,
            "total_liab": total_liab,
            "receivables": receivables,
            "prev_receivables": prev_receivables,
            "ppe": ppe,
            "prev_ppe": prev_ppe,
            "inventory": inventory,
            "prev_inventory": prev_inventory,
            "cash": cash,
            "prev_cash": prev_cash,
            "total_debt": total_debt,
            "prev_total_debt": prev_total_debt,
            "short_debt": short_debt,
            "prev_short_debt": prev_short_debt,
            "payables": payables,
            "prev_payables": prev_payables,
            "goodwill": goodwill,
            "prev_goodwill": prev_goodwill,
            "intangible_assets": intangible_assets,
            "contract_liab": contract_liab,
            "prev_contract_liab": prev_contract_liab,
            "equity": equity,
            "operating_cf": operating_cf,
            "capex": capex,
            "debt_issued": debt_issued,
            "debt_repaid": debt_repaid,
            "market": "us",
        }
        result["risk_scenarios"] = _build_eight_risk_scenarios(facts)
        result["disclosure_checks"] = _collect_disclosure_checks(result["risk_scenarios"])

        # ── 7. 综合评分 ──
        result["overall_score"] = _calc_overall_score(result)
        result["risk_level"] = _score_to_level(result["overall_score"])
        result["model_confidence"] = _calc_model_confidence(result)
        result["risk_drivers"] = _extract_risk_drivers(result)
        result["mitigating_factors"] = _extract_mitigating_factors(result)
        result["stress_tests"] = _build_generic_stress_tests(result["overall_score"], facts)
        result["summary"] = _generate_summary(result)

    except Exception as e:
        result["error"] = str(e)
        result["summary"] = f"评估过程出错：{e}"

    return result


# ─────────────────────────────────────────
# A 股风险评估（AkShare）
# ─────────────────────────────────────────
def _assess_cn_risk(ticker: str, period: str) -> dict:
    """
    A 股版本：用 stock_financial_abstract 拿到的指标做评估
    AkShare 的报表字段不如 yfinance 完整，所以做简化版
    """
    import akshare as ak

    result = {
        "ticker": ticker,
        "market": "cn",
        "period": period,
        "overall_score": None,
        "risk_level": None,
        "summary": "",
        "altman_z": None,
        "beneish_m": None,
        "cash_quality": None,
        "receivables": None,
        "dimension_scores": {},
        "red_flags": [],
        "risk_scenarios": [],
        "disclosure_checks": [],
        "model_confidence": None,
        "risk_drivers": [],
        "mitigating_factors": [],
        "stress_tests": [],
    }

    try:
        abstract = retry(lambda: ak.stock_financial_abstract(symbol=ticker), retries=1)
        if abstract is None or abstract.empty:
            result["summary"] = "未能获取 A 股财务数据"
            return result

        year_col = f"{period}1231"
        prev_year_col = f"{int(period) - 1}1231"

        if year_col not in abstract.columns:
            result["summary"] = f"未找到 {period} 年报"
            return result

        # 提取指标
        ind = {}
        for _, r in abstract.iterrows():
            key = r.get("指标")
            val = r.get(year_col)
            if key and pd.notna(val):
                try:
                    ind[key] = float(val)
                except (TypeError, ValueError):
                    pass

        prev_ind = {}
        if prev_year_col in abstract.columns:
            for _, r in abstract.iterrows():
                key = r.get("指标")
                val = r.get(prev_year_col)
                if key and pd.notna(val):
                    try:
                        prev_ind[key] = float(val)
                    except (TypeError, ValueError):
                        pass

        revenue = ind.get("营业总收入")
        net_income = ind.get("归母净利润")
        operating_cf = ind.get("经营活动产生的现金流量净额")
        total_assets = ind.get("资产总计")
        total_liab = ind.get("负债合计")
        roe = ind.get("净资产收益率")
        gross_margin = ind.get("销售毛利率")
        net_margin = ind.get("销售净利率")
        debt_ratio = ind.get("资产负债率")
        prev_revenue = prev_ind.get("营业总收入")
        facts = _facts_from_cn_abstract(ind, prev_ind)

        # 现金流匹配度
        result["cash_quality"] = _calc_cash_quality(net_income, operating_cf)

        # 营收增长
        if revenue and prev_revenue and prev_revenue > 0:
            rev_growth = (revenue - prev_revenue) / prev_revenue * 100
        else:
            rev_growth = ind.get("营业总收入同比增长")

        # 简化 Altman（只用资产负债率 + ROE 近似）
        if total_assets and total_liab is not None:
            equity_ratio = (total_assets - total_liab) / total_assets * 100
            result["altman_z"] = {
                "score": safe_round((roe or 0) * 0.5 + equity_ratio * 0.3, 2),
                "interpretation": "A股简化估算（基于资产负债率和ROE）",
                "risk_level": "low" if (debt_ratio or 0) < 50 else ("medium" if (debt_ratio or 0) < 70 else "high"),
            }

        # A 股五维度评分
        result["dimension_scores"] = {
            "profitability": _safe_score(roe, [5, 10, 20], reverse=False),
            "solvency": _safe_score(debt_ratio, [70, 50, 30], reverse=True),
            "cash_flow": _safe_score(
                (operating_cf / net_income * 100) if (net_income and net_income > 0 and operating_cf) else None,
                [50, 80, 100], reverse=False,
            ),
            "revenue_quality": _safe_score(net_margin, [5, 10, 20], reverse=False),
            "valuation": 60,  # A 股估值数据另外算
        }

        # 红旗
        result["red_flags"] = _collect_red_flags(result, {
            "revenue": revenue,
            "net_income": net_income,
            "operating_cf": operating_cf,
        })
        result["risk_scenarios"] = _build_eight_risk_scenarios(facts)
        result["disclosure_checks"] = _collect_disclosure_checks(result["risk_scenarios"])

        # 综合
        result["overall_score"] = _calc_overall_score(result)
        result["risk_level"] = _score_to_level(result["overall_score"])
        result["model_confidence"] = _calc_model_confidence(result)
        result["risk_drivers"] = _extract_risk_drivers(result)
        result["mitigating_factors"] = _extract_mitigating_factors(result)
        result["stress_tests"] = _build_generic_stress_tests(result["overall_score"], facts)
        result["summary"] = _generate_summary(result)

    except Exception as e:
        result["error"] = str(e)
        result["summary"] = f"评估过程出错：{e}"

    return result


# ─────────────────────────────────────────
# Altman Z-Score 计算
# ─────────────────────────────────────────
def _calc_altman_z(
    current_assets, current_liab, total_assets,
    retained_earnings, ebit, market_cap, total_liab, revenue,
) -> Optional[dict]:
    """
    Altman Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
    A = 营运资金 / 总资产
    B = 留存收益 / 总资产
    C = EBIT / 总资产
    D = 股票市值 / 总负债
    E = 营收 / 总资产

    解读：
    Z > 2.99: 安全区（破产风险低）
    1.81 < Z < 2.99: 灰色区
    Z < 1.81: 危险区（破产风险高）
    """
    try:
        if not all(x is not None for x in [total_assets, total_liab, ebit, revenue]):
            return None
        if total_assets <= 0 or total_liab <= 0:
            return None

        wc = (current_assets or 0) - (current_liab or 0)
        a = wc / total_assets
        b = (retained_earnings or 0) / total_assets
        c = ebit / total_assets
        d = (market_cap or 0) / total_liab
        e = revenue / total_assets

        z = 1.2 * a + 1.4 * b + 3.3 * c + 0.6 * d + 1.0 * e

        if z > 2.99:
            risk_level = "low"
            interpretation = "财务稳健，破产风险低"
        elif z > 1.81:
            risk_level = "medium"
            interpretation = "灰色区，需要关注"
        else:
            risk_level = "high"
            interpretation = "危险区，破产风险较高"

        return {
            "score": safe_round(z, 2),
            "model": "original",
            "model_name": "Altman Z-Score",
            "applicability": "manufacturing",
            "distress_threshold": 1.81,
            "safe_threshold": 2.99,
            "components": {
                "working_capital_to_assets": safe_round(a, 3),
                "retained_earnings_to_assets": safe_round(b, 3),
                "ebit_to_assets": safe_round(c, 3),
                "market_cap_to_debt": safe_round(d, 3),
                "asset_turnover": safe_round(e, 3),
            },
            "risk_level": risk_level,
            "interpretation": interpretation,
        }
    except Exception:
        return None


def _calc_altman_z_double_prime(
    current_assets,
    current_liab,
    total_assets,
    retained_earnings,
    ebit,
    total_liab,
    book_equity,
) -> Optional[dict]:
    """
    Altman Z''-Score for non-manufacturing / emerging-market contexts.
    It removes Sales / Total Assets, avoiding systematic bias from asset turnover.

    Common cutoffs:
    Z'' > 2.60: safer zone
    1.10 < Z'' < 2.60: gray zone
    Z'' < 1.10: distress zone
    """
    try:
        if not all(x is not None for x in [total_assets, total_liab, ebit]):
            return None
        if total_assets <= 0 or total_liab <= 0:
            return None

        wc = (current_assets or 0) - (current_liab or 0)
        a = wc / total_assets
        b = (retained_earnings or 0) / total_assets
        c = ebit / total_assets
        d = (book_equity or 0) / total_liab

        z = 6.56 * a + 3.26 * b + 6.72 * c + 1.05 * d

        if z > 2.60:
            risk_level = "low"
            interpretation = "Z'' 非制造业模型显示破产风险较低"
        elif z > 1.10:
            risk_level = "medium"
            interpretation = "Z'' 非制造业模型处于灰色区，需要结合现金流和负债覆盖继续判断"
        else:
            risk_level = "high"
            interpretation = "Z'' 非制造业模型处于危险区，偿债安全边际偏弱"

        return {
            "score": safe_round(z, 2),
            "model": "z_double_prime",
            "model_name": "Altman Z''-Score",
            "applicability": "non_manufacturing",
            "distress_threshold": 1.10,
            "safe_threshold": 2.60,
            "components": {
                "working_capital_to_assets": safe_round(a, 3),
                "retained_earnings_to_assets": safe_round(b, 3),
                "ebit_to_assets": safe_round(c, 3),
                "book_equity_to_liabilities": safe_round(d, 3),
            },
            "risk_level": risk_level,
            "interpretation": interpretation,
        }
    except Exception:
        return None


# ─────────────────────────────────────────
# Beneish M-Score（简化）
# ─────────────────────────────────────────
def _calc_beneish_m(
    revenue, prev_revenue,
    receivables, prev_receivables,
    gross_profit, prev_gross,
    current_assets, ppe, total_assets,
    prev_current_assets, prev_ppe, prev_total_assets,
    depreciation, prev_depreciation,
    sga, prev_sga,
    total_liab, prev_total_liab,
    net_income, operating_cf,
) -> Optional[dict]:
    """
    Beneish M-Score 简化版
    M > -1.78 提示可能存在盈余操纵
    """
    try:
        if not all(x is not None and x != 0 for x in [revenue, prev_revenue, total_assets, prev_total_assets]):
            return None

        # DSRI: 应收账款 / 营收 比例的变化
        dsri = 1.0
        if receivables and prev_receivables and revenue > 0 and prev_revenue > 0:
            dsri = (receivables / revenue) / (prev_receivables / prev_revenue) if prev_receivables > 0 else 1.0

        # GMI: 毛利率恶化
        gmi = 1.0
        if gross_profit and prev_gross and revenue > 0 and prev_revenue > 0:
            curr_gm = gross_profit / revenue
            prev_gm = prev_gross / prev_revenue
            gmi = prev_gm / curr_gm if curr_gm > 0 else 1.0

        # AQI: 资产质量指数
        aqi = 1.0
        try:
            curr_other = 1 - ((current_assets or 0) + (ppe or 0)) / total_assets
            prev_other = 1 - ((prev_current_assets or 0) + (prev_ppe or 0)) / prev_total_assets
            aqi = curr_other / prev_other if prev_other > 0 else 1.0
        except Exception:
            pass

        # SGI: 销售增长指数
        sgi = revenue / prev_revenue if prev_revenue > 0 else 1.0

        # 简化的 M-Score（用主要因子）
        # 完整公式有 8 个因子，这里用 4 个主要的
        m = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi

        if m > -1.78:
            risk_level = "high"
            interpretation = "存在盈余操纵嫌疑，建议深入审查"
        elif m > -2.22:
            risk_level = "medium"
            interpretation = "略有异常信号"
        else:
            risk_level = "low"
            interpretation = "未检测到明显的造假信号"

        return {
            "score": safe_round(m, 3),
            "components": {
                "DSRI": safe_round(dsri, 3),
                "GMI": safe_round(gmi, 3),
                "AQI": safe_round(aqi, 3),
                "SGI": safe_round(sgi, 3),
            },
            "risk_level": risk_level,
            "interpretation": interpretation,
        }
    except Exception:
        return None


# ─────────────────────────────────────────
# 现金流匹配度
# ─────────────────────────────────────────
def _calc_cash_quality(net_income, operating_cf) -> Optional[dict]:
    """
    经营现金流 / 净利润 应该 > 1 才健康
    < 0.5 是严重异常信号（赚的钱没收回来，纸面利润）
    """
    if net_income is None or operating_cf is None:
        return None

    if net_income == 0:
        return None

    if net_income < 0:
        # 公司亏损本来就不奇怪，单独处理
        return {
            "ratio": None,
            "risk_level": "medium",
            "interpretation": "公司亏损中，需关注现金消耗速度",
            "ocf": safe_round(operating_cf / 1e9, 2),
            "net_income": safe_round(net_income / 1e9, 2),
        }

    ratio = operating_cf / net_income

    if ratio < 0:
        risk_level = "high"
        interpretation = "经营现金流为负，账面有利润但现金在流出，强烈造假/经营恶化信号"
    elif ratio < 0.5:
        risk_level = "high"
        interpretation = "经营现金流远低于净利润，利润质量差，可能存在虚增收入"
    elif ratio < 0.8:
        risk_level = "medium"
        interpretation = "经营现金流偏低，需关注应收账款是否过快增长"
    elif ratio <= 1.5:
        risk_level = "low"
        interpretation = "现金流和利润匹配良好，盈利质量健康"
    else:
        risk_level = "low"
        interpretation = "现金流充沛，盈利质量优秀"

    return {
        "ratio": safe_round(ratio, 2),
        "ocf": safe_round(operating_cf / 1e9, 2),
        "net_income": safe_round(net_income / 1e9, 2),
        "risk_level": risk_level,
        "interpretation": interpretation,
    }


# ─────────────────────────────────────────
# 应收账款异常增长
# ─────────────────────────────────────────
def _calc_receivables_anomaly(revenue, receivables, prev_revenue, prev_receivables) -> Optional[dict]:
    """
    应收账款增长应该 ≤ 营收增长，否则可能虚增收入
    """
    if not all(x is not None and x > 0 for x in [revenue, prev_revenue]):
        return None
    if receivables is None or prev_receivables is None or prev_receivables == 0:
        return None

    rev_growth = (revenue - prev_revenue) / prev_revenue * 100
    ar_growth = (receivables - prev_receivables) / prev_receivables * 100
    diff = ar_growth - rev_growth

    if diff > 30:
        risk_level = "high"
        interpretation = "应收账款增速远超营收增速，可能存在虚增收入"
    elif diff > 15:
        risk_level = "medium"
        interpretation = "应收账款增长偏快，需要关注收入质量"
    else:
        risk_level = "low"
        interpretation = "应收账款增长在合理范围"

    return {
        "revenue_growth": safe_round(rev_growth, 2),
        "ar_growth": safe_round(ar_growth, 2),
        "diff": safe_round(diff, 2),
        "risk_level": risk_level,
        "interpretation": interpretation,
    }


# ─────────────────────────────────────────
# 八大财报交叉验证场景
# ─────────────────────────────────────────
def _build_eight_risk_scenarios(facts: dict) -> list[dict]:
    scenarios = [
        _scenario_fixed_assets(facts),
        _scenario_inventory(facts),
        _scenario_revenue_recognition(facts),
        _scenario_profit_cash_gap(facts),
        _scenario_hidden_debt(facts),
        _scenario_margin_cost(facts),
        _scenario_goodwill_intangibles(facts),
        _scenario_short_term_liquidity(facts),
    ]
    return scenarios


def _scenario_fixed_assets(f: dict) -> dict:
    evidence = []
    missing = []
    ppe_delta = _delta(f.get("ppe"), f.get("prev_ppe"))
    capex_abs = abs(f.get("capex") or 0) if f.get("capex") is not None else None
    revenue_growth = _pct_change(f.get("revenue"), f.get("prev_revenue"))
    ppe_growth = _pct_change(f.get("ppe"), f.get("prev_ppe"))
    dep_rate = _ratio(f.get("depreciation"), _avg(f.get("ppe"), f.get("prev_ppe")))
    prev_dep_rate = _ratio(f.get("prev_depreciation"), f.get("prev_ppe"))

    if ppe_delta is not None and capex_abs is not None:
        diff = ppe_delta - capex_abs
        severity = "high" if ppe_delta > 0 and diff > max(capex_abs, 0) * 0.5 and diff > 0 else "low"
        evidence.append(_evidence(
            "固定资产净额增加 vs 资本开支",
            _money_pair(ppe_delta, capex_abs),
            "固定资产增加额明显高于购建资产现金流时，需要在附注中解释非现金取得、租赁转入、并购或评估增值。",
            severity,
        ))
    else:
        missing.append("固定资产期初/期末余额或资本开支现金流")

    if dep_rate is not None:
        severity = "medium" if prev_dep_rate and dep_rate < prev_dep_rate * 0.75 else "low"
        evidence.append(_evidence(
            "折旧率",
            _pct(dep_rate),
            "资产扩张后折旧率应基本稳定；折旧率下降可能来自折旧年限变更、资产闲置或折旧计提不足。",
            severity,
        ))
    else:
        missing.append("折旧费用或固定资产平均余额")

    if ppe_growth is not None and revenue_growth is not None:
        severity = "medium" if ppe_growth - revenue_growth > 25 else "low"
        evidence.append(_evidence(
            "固定资产增速 vs 营收增速",
            f"{safe_round(ppe_growth, 1)}% / {safe_round(revenue_growth, 1)}%",
            "产能扩张通常需要在后续收入中体现；资产增长长期脱离收入增长时，需核查产能利用率与项目状态。",
            severity,
        ))

    return _scenario(
        "fixed_assets",
        "固定资产虚高",
        evidence,
        [
            ("固定资产附注", "核查本期增加、处置、折旧、减值、抵押受限资产明细"),
            ("在建工程附注", "核查长期未转固项目、预算、进度、利息资本化和减值迹象"),
            ("会计政策附注", "核查折旧年限、残值率、资本化政策是否变更"),
        ],
        missing,
    )


def _scenario_inventory(f: dict) -> dict:
    evidence = []
    missing = []
    cogs = _cogs(f)
    inv_days = _ratio(f.get("inventory"), cogs, scale=365)
    inv_growth = _pct_change(f.get("inventory"), f.get("prev_inventory"))
    revenue_growth = _pct_change(f.get("revenue"), f.get("prev_revenue"))

    if inv_days is not None:
        severity = "high" if inv_days > 240 else ("medium" if inv_days > 120 else "low")
        evidence.append(_evidence(
            "存货周转天数",
            f"{safe_round(inv_days, 0)} 天",
            "周转天数越长，滞销、跌价或账面水分风险越高；需结合行业和季节性判断。",
            severity,
        ))
    else:
        missing.append("存货余额或营业成本")

    if inv_growth is not None and revenue_growth is not None:
        gap = inv_growth - revenue_growth
        severity = "high" if gap > 40 else ("medium" if gap > 20 else "low")
        evidence.append(_evidence(
            "存货增速 vs 营收增速",
            f"{safe_round(inv_growth, 1)}% / {safe_round(revenue_growth, 1)}%",
            "存货增长显著快于收入时，需核查备货依据、订单覆盖和跌价准备。",
            severity,
        ))

    cq = _ratio(f.get("operating_cf"), f.get("net_income"))
    if cq is not None and inv_growth is not None:
        severity = "medium" if cq < 0.8 and inv_growth > 15 else "low"
        evidence.append(_evidence(
            "现金流质量与存货变化",
            f"OCF/NI {safe_round(cq, 2)}x",
            "利润为正但现金流偏弱，同时存货上升，常见于库存积压或成本结转不足。",
            severity,
        ))

    return _scenario(
        "inventory",
        "存货虚高与跌价风险",
        evidence,
        [
            ("存货附注", "核查原材料、在产品、产成品结构及库龄"),
            ("存货跌价准备附注", "核查计提比例、转回原因、可变现净值假设"),
            ("收入与订单披露", "核查大额备货是否有订单、合同或交付计划支撑"),
        ],
        missing,
    )


def _scenario_revenue_recognition(f: dict) -> dict:
    evidence = []
    missing = []
    ar = _pct_change(f.get("receivables"), f.get("prev_receivables"))
    rev = _pct_change(f.get("revenue"), f.get("prev_revenue"))
    ar_ratio = _ratio(f.get("receivables"), f.get("revenue"))
    contract_growth = _pct_change(f.get("contract_liab"), f.get("prev_contract_liab"))

    if ar is not None and rev is not None:
        gap = ar - rev
        severity = "high" if gap > 30 else ("medium" if gap > 15 else "low")
        evidence.append(_evidence(
            "应收账款增速 vs 营收增速",
            f"{safe_round(ar, 1)}% / {safe_round(rev, 1)}%",
            "应收增速长期高于收入增速，可能说明信用政策放宽、回款恶化或收入确认偏激进。",
            severity,
        ))
    else:
        missing.append("应收账款期初/期末余额或收入")

    if ar_ratio is not None:
        severity = "medium" if ar_ratio > 0.25 else "low"
        evidence.append(_evidence(
            "应收账款 / 营收",
            _pct(ar_ratio),
            "收入确认后应最终转化为现金；应收占收入过高时需核查账龄、大客户和坏账准备。",
            severity,
        ))

    if contract_growth is not None and rev is not None:
        severity = "medium" if rev > 20 and contract_growth < -20 else "low"
        evidence.append(_evidence(
            "合同负债变化 vs 营收增长",
            f"{safe_round(contract_growth, 1)}% / {safe_round(rev, 1)}%",
            "收入大增但合同负债下降，可能是透支前期预收或履约进度确认发生变化。",
            severity,
        ))
    else:
        missing.append("合同负债/递延收入")

    return _scenario(
        "revenue_recognition",
        "收入虚增与提前确认",
        evidence,
        [
            ("收入确认政策", "核查履约义务、时点/时段确认、可变对价和退货条款"),
            ("应收账款附注", "核查账龄、前五大欠款方、坏账准备和逾期情况"),
            ("合同负债附注", "核查预收款、递延收入、本期结转收入"),
            ("税费披露", "核查增值税/销售税相关披露与收入规模是否匹配"),
        ],
        missing,
    )


def _scenario_profit_cash_gap(f: dict) -> dict:
    evidence = []
    missing = []
    ratio = _ratio(f.get("operating_cf"), f.get("net_income"))
    ocf_margin = _ratio(f.get("operating_cf"), f.get("revenue"))

    if ratio is not None:
        severity = "high" if ratio < 0.5 else ("medium" if ratio < 0.8 else "low")
        evidence.append(_evidence(
            "经营现金流 / 净利润",
            f"{safe_round(ratio, 2)}x",
            "这是利润质量的总报警器；利润不能转化为经营现金流时，需要向应收、存货、预付和其他营运资本溯因。",
            severity,
        ))
    else:
        missing.append("经营现金流或净利润")

    if ocf_margin is not None:
        severity = "medium" if ocf_margin < 0 and (f.get("net_income") or 0) > 0 else "low"
        evidence.append(_evidence(
            "经营现金流率",
            _pct(ocf_margin),
            "收入增长如果不能带来经营现金流，说明回款、库存或成本付款端存在压力。",
            severity,
        ))

    return _scenario(
        "profit_cash_gap",
        "纸面利润与现金流背离",
        evidence,
        [
            ("现金流量表补充资料", "核查净利润调节为经营现金流的具体项目"),
            ("营运资本附注", "核查应收、存货、预付、应付变化是否解释现金流缺口"),
            ("非经常性损益披露", "核查利润是否由一次性收益、补贴或公允价值变动支撑"),
        ],
        missing,
    )


def _scenario_hidden_debt(f: dict) -> dict:
    evidence = []
    missing = []
    avg_debt = _avg(f.get("total_debt"), f.get("prev_total_debt"))
    implied_rate = _ratio(abs(f.get("interest_expense") or 0), avg_debt)
    ap_growth = _pct_change(f.get("payables"), f.get("prev_payables"))
    rev_growth = _pct_change(f.get("revenue"), f.get("prev_revenue"))
    debt_roll = None
    if f.get("debt_issued") is not None and f.get("debt_repaid") is not None:
        debt_roll = abs(f.get("debt_issued") or 0) + abs(f.get("debt_repaid") or 0)
        debt_base = max(abs(avg_debt or 0), 1)
        severity = "medium" if debt_roll / debt_base > 0.8 else "low"
        evidence.append(_evidence(
            "债务融资大进大出",
            _money(debt_roll),
            "借新还旧规模较大时，说明流动性依赖再融资，需要核查债务期限结构。",
            severity,
        ))

    if implied_rate is not None:
        severity = "high" if implied_rate > 0.12 else ("medium" if implied_rate > 0.08 else "low")
        evidence.append(_evidence(
            "隐含融资成本",
            _pct(implied_rate),
            "利息支出相对有息负债偏高，可能反映高成本融资、票据贴现或未完整呈现的债务压力。",
            severity,
        ))
    else:
        missing.append("利息支出或有息负债")

    if ap_growth is not None and rev_growth is not None:
        severity = "medium" if ap_growth - rev_growth > 30 else "low"
        evidence.append(_evidence(
            "应付账款增速 vs 营收增速",
            f"{safe_round(ap_growth, 1)}% / {safe_round(rev_growth, 1)}%",
            "应付增长过快可能是供应商信用被动拉长，需核查账龄和逾期款项。",
            severity,
        ))
    else:
        missing.append("应付账款期初/期末余额")

    return _scenario(
        "hidden_debt",
        "表外负债与隐性债务",
        evidence,
        [
            ("有息负债附注", "核查短债、长债、租赁负债、利率、期限和抵押担保"),
            ("承诺及或有事项", "核查对外担保、未决诉讼、回购义务、最低付款承诺"),
            ("关联方交易披露", "核查其他应付款、资金拆借和交叉担保"),
            ("应付账款附注", "核查账龄、逾期供应商款项和票据到期压力"),
        ],
        missing,
    )


def _scenario_margin_cost(f: dict) -> dict:
    evidence = []
    missing = []
    gm = _ratio(f.get("gross_profit"), f.get("revenue"))
    prev_gm = _ratio(f.get("prev_gross"), f.get("prev_revenue"))
    sga_ratio = _ratio(f.get("sga"), f.get("revenue"))
    prev_sga_ratio = _ratio(f.get("prev_sga"), f.get("prev_revenue"))
    rev_growth = _pct_change(f.get("revenue"), f.get("prev_revenue"))

    if gm is not None and prev_gm is not None:
        gm_change = (gm - prev_gm) * 100
        severity = "medium" if gm_change > 5 and (rev_growth or 0) < 5 else "low"
        evidence.append(_evidence(
            "毛利率变化",
            f"{safe_round(prev_gm * 100, 1)}% -> {safe_round(gm * 100, 1)}%",
            "毛利率逆势大幅提升时，需要验证产品结构、售价、原材料价格和成本结转。",
            severity,
        ))
    else:
        missing.append("毛利或收入")

    if sga_ratio is not None and prev_sga_ratio is not None:
        drop = (prev_sga_ratio - sga_ratio) * 100
        severity = "medium" if drop > 5 and (gm or 0) > (prev_gm or 0) else "low"
        evidence.append(_evidence(
            "销售管理费用率变化",
            f"{safe_round(prev_sga_ratio * 100, 1)}% -> {safe_round(sga_ratio * 100, 1)}%",
            "费用率和毛利率同时改善需要核查是否存在费用资本化或成本递延。",
            severity,
        ))
    else:
        missing.append("销售管理费用")

    return _scenario(
        "margin_cost",
        "毛利率与成本结构异常",
        evidence,
        [
            ("营业成本附注", "核查原材料、人工、制造费用和产品结构变化"),
            ("分部信息", "核查不同业务/地区毛利率是否异常分化"),
            ("研发与资本化政策", "核查费用化支出是否被资本化"),
            ("员工薪酬披露", "核查员工数量、人均薪酬和职工薪酬现金流"),
        ],
        missing,
    )


def _scenario_goodwill_intangibles(f: dict) -> dict:
    evidence = []
    missing = []
    gw_equity = _ratio(f.get("goodwill"), f.get("equity"))
    intangible_assets = f.get("intangible_assets")
    goodwill = f.get("goodwill")
    intangible_assets = intangible_assets if intangible_assets is not None else goodwill
    intangible_asset_ratio = _ratio(intangible_assets, f.get("total_assets"))

    if gw_equity is not None:
        severity = "high" if gw_equity > 0.5 else ("medium" if gw_equity > 0.3 else "low")
        evidence.append(_evidence(
            "商誉 / 股东权益",
            _pct(gw_equity),
            "商誉占净资产过高时，一旦减值会直接冲击权益和利润。",
            severity,
        ))
    else:
        missing.append("商誉或股东权益")

    if intangible_asset_ratio is not None:
        severity = "medium" if intangible_asset_ratio > 0.35 else "low"
        evidence.append(_evidence(
            "商誉及无形资产 / 总资产",
            _pct(intangible_asset_ratio),
            "无形资产占比高的公司，需要核查减值测试假设和未来现金流预测。",
            severity,
        ))

    if f.get("goodwill") is not None and f.get("prev_goodwill") is not None:
        gw_growth = _pct_change(f.get("goodwill"), f.get("prev_goodwill"))
        severity = "medium" if gw_growth is not None and gw_growth > 30 else "low"
        evidence.append(_evidence(
            "商誉变化",
            f"{safe_round(gw_growth, 1) if gw_growth is not None else 'N/A'}%",
            "商誉大幅上升通常来自并购，需要核查收购价格、业绩承诺和估值假设。",
            severity,
        ))

    return _scenario(
        "goodwill_intangibles",
        "商誉与无形资产减值风险",
        evidence,
        [
            ("商誉附注", "核查被收购主体、形成原因、减值测试和现金产生单元"),
            ("并购披露", "核查收购溢价、业绩承诺、对赌补偿和关联交易"),
            ("无形资产附注", "核查摊销年限、减值迹象和可收回金额假设"),
        ],
        missing,
    )


def _scenario_short_term_liquidity(f: dict) -> dict:
    evidence = []
    missing = []
    current_ratio = _ratio(f.get("current_assets"), f.get("current_liab"))
    cash_ratio = _ratio(f.get("cash"), f.get("current_liab"))
    short_debt_cash = _ratio(f.get("short_debt"), f.get("cash"))
    ocf_liab = _ratio(f.get("operating_cf"), f.get("current_liab"))

    if current_ratio is not None:
        severity = "high" if current_ratio < 1 else ("medium" if current_ratio < 1.5 else "low")
        evidence.append(_evidence(
            "流动比率",
            f"{safe_round(current_ratio, 2)}x",
            "流动资产不足以覆盖流动负债时，短期偿债压力上升。",
            severity,
        ))
    else:
        missing.append("流动资产或流动负债")

    if cash_ratio is not None:
        severity = "high" if cash_ratio < 0.15 else ("medium" if cash_ratio < 0.3 else "low")
        evidence.append(_evidence(
            "现金 / 流动负债",
            _pct(cash_ratio),
            "现金缓冲越薄，越依赖经营回款和外部融资续接。",
            severity,
        ))

    if short_debt_cash is not None:
        severity = "high" if short_debt_cash > 1.5 else ("medium" if short_debt_cash > 0.8 else "low")
        evidence.append(_evidence(
            "短债 / 现金",
            f"{safe_round(short_debt_cash, 2)}x",
            "短债明显高于现金时，需核查授信额度、债务到期表和再融资安排。",
            severity,
        ))
    else:
        missing.append("短期有息债务或现金")

    if ocf_liab is not None:
        severity = "medium" if ocf_liab < 0.1 else "low"
        evidence.append(_evidence(
            "经营现金流 / 流动负债",
            _pct(ocf_liab),
            "经营现金流覆盖短期负债能力偏弱时，流动性风险更容易被放大。",
            severity,
        ))

    return _scenario(
        "short_term_liquidity",
        "短期偿债能力恶化",
        evidence,
        [
            ("债务到期结构披露", "核查一年内到期债务、授信额度、融资续作计划"),
            ("受限资金附注", "核查现金是否因保证金、监管或抵押受限"),
            ("流动资产质量", "核查应收账款可回收性、存货可变现性和预付款项"),
        ],
        missing,
    )


def _scenario(id_: str, title: str, evidence: list, disclosure_checks: list[tuple[str, str]], missing_data: list[str]) -> dict:
    score = _scenario_score(evidence, missing_data)
    level = _score_to_scenario_level(score)
    high_count = sum(1 for item in evidence if item.get("severity") == "high")
    medium_count = sum(1 for item in evidence if item.get("severity") == "medium")
    if high_count:
        summary = f"触发 {high_count} 项高风险证据，需优先核查财报附注。"
    elif medium_count:
        summary = f"发现 {medium_count} 项中等风险信号，建议结合披露章节复核。"
    elif evidence:
        summary = "结构化财报数据未显示明显异常，但仍需以附注披露确认。"
    else:
        summary = "结构化数据不足，无法完成该场景的自动判断。"

    return {
        "id": id_,
        "title": title,
        "risk_level": level,
        "score": score,
        "summary": summary,
        "evidence": evidence,
        "disclosure_checks": [
            {
                "section": section,
                "focus": focus,
                "status": "needs_filing_review",
            }
            for section, focus in disclosure_checks
        ],
        "missing_data": missing_data,
        "next_steps": [focus for _, focus in disclosure_checks[:3]],
    }


def _scenario_score(evidence: list, missing_data: list[str]) -> int:
    if not evidence:
        return 40 if missing_data else 10

    score = 10
    for item in evidence:
        if item.get("severity") == "high":
            score += 30
        elif item.get("severity") == "medium":
            score += 15
        elif item.get("severity") == "low":
            score += 2
    score += min(len(missing_data), 3) * 3
    return max(0, min(100, score))


def _score_to_scenario_level(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _evidence(label: str, value, interpretation: str, severity: str) -> dict:
    return {
        "label": label,
        "value": value,
        "interpretation": interpretation,
        "severity": severity,
    }


def _collect_disclosure_checks(scenarios: list[dict]) -> list[dict]:
    seen = set()
    checks = []
    for scenario in scenarios:
        for check in scenario.get("disclosure_checks", []):
            key = (check.get("section"), check.get("focus"))
            if key in seen:
                continue
            seen.add(key)
            checks.append({
                **check,
                "scenario_id": scenario.get("id"),
                "scenario_title": scenario.get("title"),
            })
    return checks


def _facts_from_cn_abstract(ind: dict, prev_ind: dict) -> dict:
    def pick(source: dict, names: list[str]):
        for name in names:
            if source.get(name) is not None:
                return source.get(name)
        return None

    return {
        "market": "cn",
        "revenue": pick(ind, ["营业总收入", "营业收入"]),
        "prev_revenue": pick(prev_ind, ["营业总收入", "营业收入"]),
        "gross_profit": None,
        "prev_gross": None,
        "operating_income": pick(ind, ["营业利润"]),
        "net_income": pick(ind, ["归母净利润", "净利润"]),
        "sga": pick(ind, ["销售费用", "管理费用"]),
        "prev_sga": pick(prev_ind, ["销售费用", "管理费用"]),
        "depreciation": None,
        "prev_depreciation": None,
        "interest_expense": pick(ind, ["财务费用", "利息支出"]),
        "total_assets": pick(ind, ["资产总计"]),
        "prev_total_assets": pick(prev_ind, ["资产总计"]),
        "current_assets": pick(ind, ["流动资产合计"]),
        "current_liab": pick(ind, ["流动负债合计"]),
        "prev_current_liab": pick(prev_ind, ["流动负债合计"]),
        "total_liab": pick(ind, ["负债合计"]),
        "receivables": pick(ind, ["应收账款", "应收账款及票据"]),
        "prev_receivables": pick(prev_ind, ["应收账款", "应收账款及票据"]),
        "ppe": pick(ind, ["固定资产", "固定资产合计"]),
        "prev_ppe": pick(prev_ind, ["固定资产", "固定资产合计"]),
        "inventory": pick(ind, ["存货"]),
        "prev_inventory": pick(prev_ind, ["存货"]),
        "cash": pick(ind, ["货币资金"]),
        "prev_cash": pick(prev_ind, ["货币资金"]),
        "total_debt": pick(ind, ["有息负债", "短期借款", "长期借款"]),
        "prev_total_debt": pick(prev_ind, ["有息负债", "短期借款", "长期借款"]),
        "short_debt": pick(ind, ["短期借款", "一年内到期的非流动负债"]),
        "prev_short_debt": pick(prev_ind, ["短期借款", "一年内到期的非流动负债"]),
        "payables": pick(ind, ["应付账款", "应付票据及应付账款"]),
        "prev_payables": pick(prev_ind, ["应付账款", "应付票据及应付账款"]),
        "goodwill": pick(ind, ["商誉"]),
        "prev_goodwill": pick(prev_ind, ["商誉"]),
        "intangible_assets": pick(ind, ["无形资产", "商誉"]),
        "contract_liab": pick(ind, ["合同负债", "预收款项"]),
        "prev_contract_liab": pick(prev_ind, ["合同负债", "预收款项"]),
        "equity": pick(ind, ["归属母公司股东权益合计", "所有者权益合计"]),
        "operating_cf": pick(ind, ["经营活动产生的现金流量净额"]),
        "capex": pick(ind, ["购建固定资产、无形资产和其他长期资产支付的现金"]),
        "debt_issued": pick(ind, ["取得借款收到的现金"]),
        "debt_repaid": pick(ind, ["偿还债务支付的现金"]),
    }


def _delta(curr, prev):
    if curr is None or prev is None:
        return None
    return curr - prev


def _pct_change(curr, prev):
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / abs(prev) * 100


def _ratio(num, den, scale=1):
    if num is None or den is None or den == 0:
        return None
    return num / den * scale


def _avg(a, b):
    vals = [v for v in (a, b) if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _cogs(f: dict):
    if f.get("revenue") is None or f.get("gross_profit") is None:
        return None
    return f["revenue"] - f["gross_profit"]


def _money(value):
    if value is None:
        return "N/A"
    return f"{safe_round(value / 1e9, 2)}B"


def _money_pair(a, b):
    return f"{_money(a)} / {_money(b)}"


def _pct(value):
    if value is None:
        return "N/A"
    return f"{safe_round(value * 100, 1)}%"


# ─────────────────────────────────────────
# 五维度评分
# ─────────────────────────────────────────
def _calc_dimension_scores(
    net_income, revenue, total_assets,
    current_assets, current_liab, total_liab,
    operating_cf, gross_profit, prev_revenue, info,
) -> dict:
    scores = {
        "profitability": 50,
        "solvency": 50,
        "cash_flow": 50,
        "revenue_quality": 50,
        "valuation": 50,
    }

    try:
        # 盈利能力：基于净利率
        if revenue and revenue > 0 and net_income is not None:
            net_margin = net_income / revenue * 100
            scores["profitability"] = _safe_score(net_margin, [0, 10, 20], reverse=False)

        # 偿债能力：基于资产负债率
        if total_assets and total_liab is not None and total_assets > 0:
            debt_ratio = total_liab / total_assets * 100
            scores["solvency"] = _safe_score(debt_ratio, [70, 50, 30], reverse=True)

        # 现金流：基于 OCF/Net Income
        if net_income and net_income > 0 and operating_cf is not None:
            ratio = operating_cf / net_income
            scores["cash_flow"] = _safe_score(ratio * 100, [50, 80, 120], reverse=False)

        # 营收质量：营收增长 + 毛利率
        if revenue and prev_revenue and prev_revenue > 0:
            rev_growth = (revenue - prev_revenue) / prev_revenue * 100
            scores["revenue_quality"] = _safe_score(rev_growth, [-5, 5, 15], reverse=False)

        # 估值：基于 PE
        pe = info.get("trailingPE")
        if pe and pe > 0:
            # PE 适中得分高（10-25 是合理区间）
            if 10 <= pe <= 25:
                scores["valuation"] = 80
            elif pe < 10:
                scores["valuation"] = 70  # 低估但可能有问题
            elif pe <= 40:
                scores["valuation"] = 50
            else:
                scores["valuation"] = 25
    except Exception:
        pass

    return {k: int(v) for k, v in scores.items()}


def _safe_score(value, thresholds, reverse=False):
    """根据阈值评分（0-100）"""
    if value is None:
        return 50
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 50

    t1, t2, t3 = thresholds
    if not reverse:
        # 越大越好
        if v < t1:
            return 25
        if v < t2:
            return 50
        if v < t3:
            return 75
        return 90
    else:
        # 越小越好
        if v > t1:
            return 25
        if v > t2:
            return 50
        if v > t3:
            return 75
        return 90


# ─────────────────────────────────────────
# 红旗清单（最重要的输出）
# ─────────────────────────────────────────
def _collect_red_flags(result: dict, raw: dict) -> list:
    flags = []

    # Altman Z 警告
    if result.get("altman_z") and result["altman_z"].get("risk_level") == "high":
        altman = result["altman_z"]
        model_name = altman.get("model_name", "Altman Z-Score")
        distress_threshold = altman.get("distress_threshold", 1.81)
        flags.append({
            "category": "破产风险",
            "severity": "high",
            "title": f"{model_name} 处于危险区",
            "description": f"{model_name} 分数 {altman['score']} < {distress_threshold}，落入该模型的危险区，需要结合现金流、负债覆盖和披露附注复核。",
            "metric": altman['score'],
        })

    # 现金流匹配 - 最关键
    cq = result.get("cash_quality")
    if cq and cq.get("risk_level") == "high":
        flags.append({
            "category": "盈利质量",
            "severity": "high",
            "title": "经营现金流远低于净利润",
            "description": cq["interpretation"],
            "metric": f"OCF/NI = {cq.get('ratio', 'N/A')}",
        })
    elif cq and cq.get("risk_level") == "medium":
        flags.append({
            "category": "盈利质量",
            "severity": "medium",
            "title": "现金流和利润存在背离",
            "description": cq["interpretation"],
            "metric": f"OCF/NI = {cq.get('ratio', 'N/A')}",
        })

    # 应收账款异常
    ar = result.get("receivables")
    if ar and ar.get("risk_level") == "high":
        flags.append({
            "category": "营收真实性",
            "severity": "high",
            "title": "应收账款增速远超营收",
            "description": f"应收增长 {ar['ar_growth']}% vs 营收增长 {ar['revenue_growth']}%，超出 {ar['diff']} 个百分点。{ar['interpretation']}",
            "metric": f"+{ar['diff']}%",
        })
    elif ar and ar.get("risk_level") == "medium":
        flags.append({
            "category": "营收真实性",
            "severity": "medium",
            "title": "应收账款增长偏快",
            "description": ar.get("interpretation", ""),
            "metric": f"+{ar['diff']}%",
        })

    # Beneish 警告
    bm = result.get("beneish_m")
    if bm and bm.get("risk_level") == "high":
        flags.append({
            "category": "盈余操纵嫌疑",
            "severity": "high",
            "title": "Beneish M-Score 触发警报",
            "description": f"M 分 {bm['score']} > -1.78，{bm['interpretation']}",
            "metric": bm['score'],
        })

    # ── 没有严重警告时，把偏弱的维度也作为「关注信号」展示 ──
    # 这样用户能理解为什么得分不是满分
    if not flags or len(flags) < 2:
        dim = result.get("dimension_scores", {})
        dim_meta = {
            "profitability": ("盈利能力", "盈利能力偏弱", "净利率或 ROE 处于较低水平，公司赚钱能力一般。"),
            "solvency": ("偿债能力", "负债水平偏高", "资产负债率偏高，杠杆压力较大，需关注利率敏感度。"),
            "cash_flow": ("现金流", "现金流和利润不够匹配", "经营现金流低于净利润，盈利质量有提升空间。"),
            "revenue_quality": ("营收质量", "营收增长动力不足", "营收增速不高，需关注业务成长性。"),
            "valuation": ("估值", "估值水平偏高", "估值倍数偏高，安全边际有限。"),
        }
        for key, score in dim.items():
            if score is None or score >= 50:
                continue
            cat, title, desc = dim_meta.get(key, (key, "维度偏弱", ""))
            # 避免和已有的 high/medium 红旗重复
            if any(f["category"] in (cat, "盈利质量", "营收真实性") and f["severity"] in ("high", "medium") for f in flags):
                if cat in ("盈利质量", "营收真实性"):
                    continue
            flags.append({
                "category": cat,
                "severity": "low",
                "title": title,
                "description": desc,
                "metric": f"{score}/100",
            })

    return flags


# ─────────────────────────────────────────
# 综合分（0-100，越高越危险）
# ─────────────────────────────────────────
def _calc_overall_score(result: dict) -> int:
    """
    把五维度评分反向（评分高=健康，所以风险=100-评分）
    再加上红旗加成
    """
    dim = result.get("dimension_scores", {})
    if not dim:
        return 50

    # 维度健康度平均（越高越健康）
    avg_health = sum(dim.values()) / len(dim)

    # 风险分 = 100 - 健康度
    risk_score = 100 - avg_health

    # 高严重度红旗加分
    high_flags = sum(1 for f in result.get("red_flags", []) if f.get("severity") == "high")
    medium_flags = sum(1 for f in result.get("red_flags", []) if f.get("severity") == "medium")

    risk_score += high_flags * 10 + medium_flags * 5

    scenario_scores = [
        s.get("score") for s in result.get("risk_scenarios", [])
        if isinstance(s.get("score"), (int, float))
    ]
    if scenario_scores:
        scenario_avg = sum(scenario_scores) / len(scenario_scores)
        scenario_peak = max(scenario_scores)
        # 场景引擎是“证据链”层，权重略高于单一模型，但保留旧模型稳定性。
        risk_score = risk_score * 0.65 + scenario_avg * 0.25 + scenario_peak * 0.10

    risk_score = max(0, min(100, risk_score))

    return int(risk_score)


def _score_to_level(score: int) -> str:
    if score >= 81:
        return "high"
    if score >= 61:
        return "medium_high"
    if score >= 41:
        return "medium"
    if score >= 21:
        return "medium_low"
    return "low"


def _risk_level_label(level: str) -> str:
    return {
        "low": "低风险",
        "medium_low": "中低风险",
        "medium": "中等风险",
        "medium_high": "中高风险",
        "high": "高风险",
    }.get(level, "中等风险")


def _calc_model_confidence(result: dict) -> dict:
    profile_confidence = result.get("industry_profile", {}).get("confidence")
    score = 70
    reasons = []

    if profile_confidence is None:
        score -= 10
        reasons.append("行业分类信息不足，部分模型按通用框架估计。")
    elif profile_confidence < 0.55:
        score -= 20
        reasons.append("行业分类置信度偏低，行业模型选择可能存在误差。")
    elif profile_confidence < 0.75:
        score -= 8
        reasons.append("行业分类有一定依据，但仍需结合业务结构复核。")
    else:
        reasons.append("行业分类信号较充分，模型选择可信度较高。")

    scenarios = result.get("risk_scenarios", []) or []
    missing_items = []
    for scenario in scenarios:
        missing_items.extend(scenario.get("missing_data", []) or [])
    if len(missing_items) >= 6:
        score -= 25
        reasons.append("多个关键场景缺少结构化字段，部分判断依赖间接估计。")
    elif missing_items:
        score -= min(15, len(missing_items) * 3)
        reasons.append(f"存在 {len(missing_items)} 项缺失数据，部分风险场景无法完整自动判断。")
    else:
        score += 10
        reasons.append("主要结构化三表字段覆盖较完整。")

    if result.get("altman_z") is None:
        score -= 6
        reasons.append("Altman 类模型不可用或不适用，偿债风险更多依赖行业/场景规则。")
    if result.get("cash_quality") is None:
        score -= 8
        reasons.append("现金流质量指标缺失，盈利质量判断置信度下降。")

    score = max(0, min(100, score))
    if score >= 75:
        level = "high"
    elif score >= 50:
        level = "medium"
    else:
        level = "low"

    return {
        "level": level,
        "score": int(score),
        "reasons": reasons[:4],
    }


def _extract_risk_drivers(result: dict) -> list[dict]:
    drivers = []
    for flag in result.get("red_flags", []) or []:
        drivers.append({
            "title": flag.get("title"),
            "description": flag.get("description"),
            "severity": flag.get("severity", "medium"),
            "metric": flag.get("metric"),
        })

    for scenario in sorted(result.get("risk_scenarios", []) or [], key=lambda s: s.get("score", 0), reverse=True):
        if scenario.get("score", 0) < 40:
            continue
        top_evidence = next(
            (item for item in scenario.get("evidence", []) if item.get("severity") in {"high", "medium"}),
            None,
        )
        drivers.append({
            "title": scenario.get("title"),
            "description": top_evidence.get("interpretation") if top_evidence else scenario.get("summary"),
            "severity": scenario.get("risk_level", "medium"),
            "metric": top_evidence.get("value") if top_evidence else f"{scenario.get('score')}/100",
        })

    deduped = []
    seen = set()
    for item in drivers:
        key = (item.get("title"), item.get("description"))
        if not item.get("title") or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped[:5]


def _extract_mitigating_factors(result: dict) -> list[dict]:
    factors = []
    altman = result.get("altman_z")
    if altman and altman.get("risk_level") == "low":
        factors.append({
            "title": altman.get("model_name", "Altman Z-Score"),
            "description": altman.get("interpretation"),
            "metric": altman.get("score"),
        })

    cash_quality = result.get("cash_quality")
    if cash_quality and cash_quality.get("risk_level") == "low":
        factors.append({
            "title": "现金流质量较好",
            "description": cash_quality.get("interpretation"),
            "metric": f"{cash_quality.get('ratio')}x" if cash_quality.get("ratio") is not None else None,
        })

    receivables = result.get("receivables")
    if receivables and receivables.get("risk_level") == "low":
        factors.append({
            "title": "应收账款未显示异常扩张",
            "description": receivables.get("interpretation"),
            "metric": f"{receivables.get('diff')}pp",
        })

    low_scenarios = [
        s for s in result.get("risk_scenarios", []) or []
        if s.get("risk_level") == "low" and s.get("evidence")
    ]
    for scenario in low_scenarios[:2]:
        factors.append({
            "title": scenario.get("title"),
            "description": scenario.get("summary"),
            "metric": f"{scenario.get('score')}/100",
        })

    return factors[:5]


def _build_generic_stress_tests(base_score: int, facts: dict) -> list[dict]:
    tests = []
    revenue = facts.get("revenue")
    gross_profit = facts.get("gross_profit")
    inventory = facts.get("inventory")
    total_debt = facts.get("total_debt")
    operating_income = facts.get("operating_income")
    interest_expense = facts.get("interest_expense")

    if revenue:
        tests.append(_stress_test(
            "revenue_down_10",
            "收入下降 10%",
            base_score,
            8 + (6 if _ratio(facts.get("operating_cf"), revenue) is not None and _ratio(facts.get("operating_cf"), revenue) < 0.1 else 0),
            "模拟需求走弱或销量下滑对利润与现金流的压力。",
        ))

    if revenue and gross_profit is not None:
        gross_margin = gross_profit / revenue
        tests.append(_stress_test(
            "gross_margin_down_5pp",
            "毛利率下降 5 个百分点",
            base_score,
            10 + (5 if gross_margin < 0.25 else 0),
            "模拟价格竞争、成本上升或促销压力导致的盈利压缩。",
        ))

    if total_debt:
        coverage = _ratio(operating_income, abs(interest_expense or 0))
        tests.append(_stress_test(
            "interest_rate_up_200bp",
            "融资成本上升 200bp",
            base_score,
            7 + (8 if coverage is not None and coverage < 3 else 0),
            "模拟再融资或浮动利率债务在高利率环境下的偿债压力。",
        ))

    if inventory:
        inv_assets = _ratio(inventory, facts.get("total_assets"))
        tests.append(_stress_test(
            "inventory_write_down_10",
            "存货减值 10%",
            base_score,
            6 + (8 if inv_assets is not None and inv_assets > 0.15 else 0),
            "模拟库存滞销或价格下跌导致的资产减值与毛利冲击。",
        ))

    if facts.get("receivables"):
        tests.append(_stress_test(
            "receivable_delay_30d",
            "应收回款延长 30 天",
            base_score,
            6 + (8 if _ratio(facts.get("cash"), facts.get("current_liab")) is not None and _ratio(facts.get("cash"), facts.get("current_liab")) < 0.3 else 0),
            "模拟客户付款变慢对短期流动性和现金转换周期的压力。",
        ))

    return tests[:5]


def _stress_test(id_: str, title: str, base_score: int, delta: int, summary: str) -> dict:
    stressed_score = max(0, min(100, int(base_score + delta)))
    return {
        "id": id_,
        "title": title,
        "base_score": int(base_score),
        "stressed_score": stressed_score,
        "risk_level": _score_to_level(stressed_score),
        "delta": stressed_score - int(base_score),
        "summary": summary,
    }


def _generate_summary(result: dict) -> str:
    level = result.get("risk_level")
    score = result.get("overall_score")
    n_flags = len(result.get("red_flags", []))
    dim = result.get("dimension_scores", {})
    weak_dims = [k for k, v in dim.items() if v is not None and v < 50]
    level_label = _risk_level_label(level)

    if level == "high":
        if n_flags > 0:
            return f"⚠️ {level_label}（{score}/100）：发现 {n_flags} 项异常信号，建议深入审查后再决定。"
        return f"⚠️ {level_label}（{score}/100）：多项财务指标偏弱，整体健康度较差。"

    if level == "medium_high":
        if n_flags > 0:
            return f"⚠️ {level_label}（{score}/100）：检测到 {n_flags} 项关注信号，风险压力已经较明显。"
        return f"⚠️ {level_label}（{score}/100）：未触发极端警报，但多项指标显示压力。"

    if level == "medium":
        if n_flags > 0:
            return f"⚡ {level_label}（{score}/100）：检测到 {n_flags} 项需要关注的指标。"
        if weak_dims:
            dim_names = {
                "profitability": "盈利能力",
                "solvency": "偿债能力",
                "cash_flow": "现金流",
                "revenue_quality": "营收质量",
                "valuation": "估值",
            }
            weak_labels = [dim_names.get(d, d) for d in weak_dims]
            return f"⚡ {level_label}（{score}/100）：未触发严重警报，但 {'、'.join(weak_labels)} 表现偏弱。"
        return f"⚡ {level_label}（{score}/100）：整体表现一般，无突出优势或缺陷。"

    if level == "medium_low":
        if n_flags > 0:
            return f"✅ {level_label}（{score}/100）：整体较稳，但仍有 {n_flags} 项指标值得跟踪。"
        return f"✅ {level_label}（{score}/100）：财务健康度较好，暂未显示明显压力。"

    if n_flags == 0 and not weak_dims:
        return f"✅ {level_label}（{score}/100）：所有维度表现良好，财务健康。"
    return f"✅ {level_label}（{score}/100）：财务指标整体健康。"
