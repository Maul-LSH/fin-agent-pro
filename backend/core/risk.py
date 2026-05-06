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
        "dimension_scores": {},
        "red_flags": [],
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

        # 上一年数据（计算变化用）
        prev_revenue = get_val(income, prev_col, "Total Revenue", "Revenue")
        prev_gross = get_val(income, prev_col, "Gross Profit")
        prev_sga = get_val(income, prev_col, "Selling General And Administration", "SG&A")
        prev_depreciation = get_val(income, prev_col, "Reconciled Depreciation", "Depreciation And Amortization")

        # 资产负债表
        total_assets = get_val(balance, col, "Total Assets")
        current_assets = get_val(balance, col, "Current Assets")
        current_liab = get_val(balance, col, "Current Liabilities")
        total_liab = get_val(balance, col, "Total Liabilities Net Minority Interest")
        retained_earnings = get_val(balance, col, "Retained Earnings")
        receivables = get_val(balance, col, "Accounts Receivable")
        ppe = get_val(balance, col, "Net PPE", "Properties Plants Equipment")

        prev_total_assets = get_val(balance, prev_col, "Total Assets")
        prev_current_assets = get_val(balance, prev_col, "Current Assets")
        prev_current_liab = get_val(balance, prev_col, "Current Liabilities")
        prev_total_liab = get_val(balance, prev_col, "Total Liabilities Net Minority Interest")
        prev_receivables = get_val(balance, prev_col, "Accounts Receivable")
        prev_ppe = get_val(balance, prev_col, "Net PPE", "Properties Plants Equipment")

        # 现金流
        operating_cf = None
        if cashflow is not None:
            cf_col = find_year_column(cashflow.columns, period)
            if cf_col is not None:
                operating_cf = get_val(cashflow, cf_col, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")

        # 市值
        market_cap = info.get("marketCap")

        # ── 1. Altman Z-Score ──
        result["altman_z"] = _calc_altman_z(
            current_assets, current_liab, total_assets, retained_earnings,
            operating_income, market_cap, total_liab, revenue,
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

        # ── 7. 综合评分 ──
        result["overall_score"] = _calc_overall_score(result)
        result["risk_level"] = _score_to_level(result["overall_score"])
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

        # 综合
        result["overall_score"] = _calc_overall_score(result)
        result["risk_level"] = _score_to_level(result["overall_score"])
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
        flags.append({
            "category": "破产风险",
            "severity": "high",
            "title": "Altman Z-Score 处于危险区",
            "description": f"Z 分 {result['altman_z']['score']} < 1.81，历史上落入此区间的公司，2 年内破产概率较高。",
            "metric": result['altman_z']['score'],
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
    risk_score = max(0, min(100, risk_score))

    return int(risk_score)


def _score_to_level(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _generate_summary(result: dict) -> str:
    level = result.get("risk_level")
    score = result.get("overall_score")
    n_flags = len(result.get("red_flags", []))
    dim = result.get("dimension_scores", {})
    weak_dims = [k for k, v in dim.items() if v is not None and v < 50]

    if level == "high":
        if n_flags > 0:
            return f"⚠️ 高风险（{score}/100）：发现 {n_flags} 项异常信号，建议深入审查后再决定。"
        return f"⚠️ 高风险（{score}/100）：多项财务指标偏弱，整体健康度较差。"

    if level == "medium":
        if n_flags > 0:
            return f"⚡ 中等风险（{score}/100）：检测到 {n_flags} 项需要关注的指标。"
        if weak_dims:
            dim_names = {
                "profitability": "盈利能力",
                "solvency": "偿债能力",
                "cash_flow": "现金流",
                "revenue_quality": "营收质量",
                "valuation": "估值",
            }
            weak_labels = [dim_names.get(d, d) for d in weak_dims]
            return f"⚡ 中等风险（{score}/100）：未触发严重警报，但 {'、'.join(weak_labels)} 表现偏弱。"
        return f"⚡ 中等风险（{score}/100）：整体表现一般，无突出优势或缺陷。"

    if n_flags == 0 and not weak_dims:
        return f"✅ 低风险（{score}/100）：所有维度表现良好，财务健康。"
    return f"✅ 低风险（{score}/100）：财务指标整体健康。"
