"""
routers/analysis.py — AI 分析 + 多公司对比
"""

import re
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.data import get_company_info, get_financial_data
from core.agent import extract_company_and_intent, generate_analysis, generate_sector_analysis
from core.risk import assess_company_risk


router = APIRouter(prefix="/api", tags=["analysis"])


# ─────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    user_input: str
    llm_api_key: str
    provider: str = "Claude (Anthropic)"
    lang: str = "en"
    analysis_mode: str = "company"


class CompareRequest(BaseModel):
    tickers: list[str]
    period: str = "2024"
    lang: str = "en"


def _is_english(lang: str | None) -> bool:
    return (lang or "en").lower().startswith("en")


def _translate_risk_text(text: str, risk: dict | None = None) -> str:
    if not text:
        return text

    score = (risk or {}).get("overall_score")
    flag_count = len((risk or {}).get("red_flags", []))
    level = (risk or {}).get("risk_level")

    if text.startswith("⚠️ 高风险"):
        if flag_count:
            return f"High risk ({score}/100): {flag_count} abnormal signal(s) detected; review the filings in depth before drawing conclusions."
        return f"High risk ({score}/100): several financial indicators look weak, suggesting poor overall financial health."
    if text.startswith("⚠️ 中高风险"):
        if flag_count:
            return f"Medium-high risk ({score}/100): {flag_count} watch item(s) detected; risk pressure is already visible."
        return f"Medium-high risk ({score}/100): no extreme alert, but several indicators show pressure."
    if text.startswith("⚡ 中等风险"):
        if flag_count:
            return f"Medium risk ({score}/100): {flag_count} metric(s) need attention."
        return f"Medium risk ({score}/100): overall performance is mixed, with no standout strength or severe defect."
    if text.startswith("✅ 中低风险"):
        if flag_count:
            return f"Medium-low risk ({score}/100): generally stable, with {flag_count} item(s) to monitor."
        return f"Medium-low risk ({score}/100): financial health is relatively solid with no obvious pressure."
    if text.startswith("✅ 低风险"):
        return f"Low risk ({score}/100): financial indicators are generally healthy."
    scenario_match = re.match(r"触发 (\d+) 项高风险证据，需优先核查财报附注。", text)
    if scenario_match:
        return f"{scenario_match.group(1)} high-risk evidence item(s) triggered; prioritize reviewing the filing footnotes."
    scenario_match = re.match(r"发现 (\d+) 项中等风险信号，建议结合披露章节复核。", text)
    if scenario_match:
        return f"{scenario_match.group(1)} medium-risk signal(s) detected; cross-check the relevant disclosure sections."
    confidence_match = re.match(r"存在 (\d+) 项缺失数据，部分风险场景无法完整自动判断。", text)
    if confidence_match:
        return f"{confidence_match.group(1)} missing data item(s) prevent some risk scenarios from being fully automated."

    exact = {
        "低风险": "Low risk",
        "中低风险": "Medium-low risk",
        "中等风险": "Medium risk",
        "中高风险": "Medium-high risk",
        "高风险": "High risk",
        "行业分类信息不足，部分模型按通用框架估计。": "Industry classification is limited, so parts of the model use the generic framework.",
        "行业分类置信度偏低，行业模型选择可能存在误差。": "Industry-classification confidence is low, so model selection may be less reliable.",
        "行业分类有一定依据，但仍需结合业务结构复核。": "Industry classification has some support, but business structure should still be reviewed.",
        "行业分类信号较充分，模型选择可信度较高。": "Industry-classification signals are reasonably strong, supporting the selected model.",
        "多个关键场景缺少结构化字段，部分判断依赖间接估计。": "Several key scenarios lack structured fields, so some judgments rely on indirect estimates.",
        "主要结构化三表字段覆盖较完整。": "The main structured income-statement, balance-sheet, and cash-flow fields are mostly covered.",
        "Altman 类模型不可用或不适用，偿债风险更多依赖行业/场景规则。": "Altman-family models are unavailable or unsuitable, so solvency risk relies more on sector/scenario rules.",
        "现金流质量指标缺失，盈利质量判断置信度下降。": "Cash-flow quality metrics are missing, reducing confidence in earnings-quality assessment.",
        "现金流质量较好": "Cash-flow quality is solid",
        "应收账款未显示异常扩张": "Receivables do not show abnormal expansion",
        "收入下降 10%": "Revenue down 10%",
        "毛利率下降 5 个百分点": "Gross margin down 5 percentage points",
        "融资成本上升 200bp": "Financing cost up 200bp",
        "存货减值 10%": "Inventory write-down 10%",
        "应收回款延长 30 天": "Receivable collection delayed 30 days",
        "模拟需求走弱或销量下滑对利润与现金流的压力。": "Models the pressure on profit and cash flow from weaker demand or lower volume.",
        "模拟价格竞争、成本上升或促销压力导致的盈利压缩。": "Models earnings compression from price competition, cost inflation, or promotion pressure.",
        "模拟再融资或浮动利率债务在高利率环境下的偿债压力。": "Models debt-service pressure from refinancing or floating-rate debt in a higher-rate environment.",
        "模拟库存滞销或价格下跌导致的资产减值与毛利冲击。": "Models asset write-down and gross-margin pressure from slow inventory or price declines.",
        "模拟客户付款变慢对短期流动性和现金转换周期的压力。": "Models short-term liquidity and cash-conversion pressure from slower customer payment.",
        "财务数据不足，无法完成风险评估": "Insufficient financial data to complete the risk assessment.",
        "财务稳健，破产风险低": "Financial position appears solid; bankruptcy risk is low.",
        "灰色区，需要关注": "Gray zone; needs monitoring.",
        "危险区，破产风险较高": "Distress zone; bankruptcy risk is elevated.",
        "存在盈余操纵嫌疑，建议深入审查": "Potential earnings manipulation signal; review in depth.",
        "略有异常信号": "Some abnormal signals detected.",
        "未检测到明显的造假信号": "No obvious manipulation signal detected.",
        "公司亏损中，需关注现金消耗速度": "The company is loss-making; monitor cash burn.",
        "经营现金流为负，账面有利润但现金在流出，强烈造假/经营恶化信号": "Operating cash flow is negative while accounting profit is positive, a strong earnings-quality or business-deterioration warning.",
        "经营现金流远低于净利润，利润质量差，可能存在虚增收入": "Operating cash flow is far below net income, suggesting weak earnings quality and possible aggressive revenue recognition.",
        "经营现金流偏低，需关注应收账款是否过快增长": "Operating cash flow is low; check whether receivables are growing too quickly.",
        "现金流和利润匹配良好，盈利质量健康": "Cash flow and profit are well matched; earnings quality looks healthy.",
        "现金流充沛，盈利质量优秀": "Cash flow is strong; earnings quality looks excellent.",
        "应收账款增速远超营收增速，可能存在虚增收入": "Receivables are growing much faster than revenue, which may indicate aggressive revenue recognition.",
        "应收账款增长偏快，需要关注收入质量": "Receivables are growing quickly; revenue quality needs attention.",
        "应收账款增长在合理范围": "Receivables growth appears reasonable.",
        "Z'' 非制造业模型显示破产风险较低": "The Z'' non-manufacturing model indicates low bankruptcy risk.",
        "Z'' 非制造业模型处于灰色区，需要结合现金流和负债覆盖继续判断": "The Z'' non-manufacturing model is in the gray zone; cash flow and debt coverage need further review.",
        "Z'' 非制造业模型处于危险区，偿债安全边际偏弱": "The Z'' non-manufacturing model is in the distress zone, suggesting a weak solvency margin.",
        "结构化财报数据未显示明显异常，但仍需以附注披露确认。": "Structured financial data does not show obvious abnormalities, but footnote disclosures should still be checked.",
        "结构化数据不足，无法完成该场景的自动判断。": "Structured data is insufficient for an automated judgment in this scenario.",
        "净利率或 ROE 处于较低水平，公司赚钱能力一般。": "Net margin or ROE is low, suggesting modest profitability.",
        "资产负债率偏高，杠杆压力较大，需关注利率敏感度。": "The debt ratio is elevated, creating leverage pressure and interest-rate sensitivity.",
        "经营现金流低于净利润，盈利质量有提升空间。": "Operating cash flow is below net income, leaving room for earnings-quality improvement.",
        "营收增速不高，需关注业务成长性。": "Revenue growth is not strong; business growth quality needs attention.",
        "估值倍数偏高，安全边际有限。": "Valuation multiples are elevated, leaving a limited margin of safety.",
    }
    if text in exact:
        return exact[text]

    if text.startswith("评估过程出错："):
        return text.replace("评估过程出错：", "Risk assessment failed: ", 1)
    if text.startswith("未找到 ") and text.endswith(" 年财报数据"):
        return text.replace("未找到 ", "Could not find FY ", 1).replace(" 年财报数据", " financial statements")
    if text.startswith("未找到 ") and text.endswith(" 年报"):
        return text.replace("未找到 ", "Could not find FY ", 1).replace(" 年报", " annual report")
    z_match = re.match(r"Z 分 ([^ ]+) < 1\.81，历史上落入此区间的公司，2 年内破产概率较高。", text)
    if z_match:
        return f"Z-Score {z_match.group(1)} is below 1.81; historically, companies in this zone have elevated bankruptcy risk within two years."
    altman_match = re.match(r"(.+) 分数 ([^ ]+) < ([^，]+)，落入该模型的危险区，需要结合现金流、负债覆盖和披露附注复核。", text)
    if altman_match:
        return f"{altman_match.group(1)} score {altman_match.group(2)} is below {altman_match.group(3)}, placing it in that model's distress zone. Review cash flow, debt coverage, and filing footnotes."
    m_match = re.match(r"M 分 ([^ ]+) > -1\.78，(.+)", text)
    if m_match:
        return f"M-Score {m_match.group(1)} is above -1.78. {_translate_risk_text(m_match.group(2))}"
    ar_match = re.match(r"应收增长 ([^%]+)% vs 营收增长 ([^%]+)%，超出 ([^ ]+) 个百分点。(.+)", text)
    if ar_match:
        return (
            f"Receivables growth was {ar_match.group(1)}% vs. revenue growth of "
            f"{ar_match.group(2)}%, a gap of {ar_match.group(3)} percentage points. "
            f"{_translate_risk_text(ar_match.group(4))}"
        )
    if level:
        return text
    return text


_RISK_LABELS_EN = {
    "破产风险": "Bankruptcy Risk",
    "盈利质量": "Earnings Quality",
    "营收真实性": "Revenue Quality",
    "盈余操纵嫌疑": "Earnings Manipulation Risk",
    "盈利能力": "Profitability",
    "偿债能力": "Solvency",
    "现金流": "Cash Flow",
    "营收质量": "Revenue Quality",
    "估值": "Valuation",
    "Altman Z-Score 处于危险区": "Altman Z-Score is in the distress zone",
    "经营现金流远低于净利润": "Operating cash flow is far below net income",
    "现金流和利润存在背离": "Cash flow and profit diverge",
    "应收账款增速远超营收": "Receivables growth far exceeds revenue growth",
    "应收账款增长偏快": "Receivables are growing quickly",
    "Beneish M-Score 触发警报": "Beneish M-Score triggered an alert",
    "盈利能力偏弱": "Profitability is weak",
    "负债水平偏高": "Leverage is elevated",
    "现金流和利润不够匹配": "Cash flow and profit are not well matched",
    "营收增长动力不足": "Revenue growth momentum is weak",
    "估值水平偏高": "Valuation appears elevated",
    "维度偏弱": "Weak dimension",
    "折旧率": "Depreciation rate",
    "收入虚增与提前确认": "Inflated or Premature Revenue Recognition",
    "纸面利润与现金流背离": "Accounting Profit and Cash Flow Divergence",
    "表外负债与隐性债务": "Off-Balance-Sheet and Hidden Debt",
    "毛利率与成本结构异常": "Gross Margin and Cost Structure Abnormalities",
    "短期偿债能力恶化": "Deteriorating Short-Term Solvency",
}

_SCENARIO_TITLES_EN = {
    "fixed_assets": "Overstated Fixed Assets",
    "inventory": "Inventory Overstatement and Write-Down Risk",
    "revenue_recognition": "Revenue Recognition Risk",
    "profit_cash_gap": "Profit-to-Cash-Flow Gap",
    "hidden_debt": "Hidden Debt Pressure",
    "margin_cost": "Margin and Cost Pressure",
    "goodwill_intangibles": "Goodwill and Intangible-Asset Impairment Risk",
    "short_term_liquidity": "Short-Term Liquidity Risk",
}

_PHRASE_TRANSLATIONS_EN = {
    "固定资产净额增加 vs 资本开支": "Net fixed-asset increase vs. capex",
    "固定资产增加额明显高于购建资产现金流时，需要在附注中解释非现金取得、租赁转入、并购或评估增值。": "When fixed assets rise much more than capex cash flow, footnotes should explain non-cash additions, lease transfers, acquisitions, or revaluation gains.",
    "固定资产期初/期末余额或资本开支现金流": "Opening/ending fixed-asset balance or capex cash flow",
    "固定资产增速 vs 营收增速": "Fixed-asset growth vs. revenue growth",
    "固定资产附注": "Fixed-asset footnote",
    "核查本期增加、处置、折旧、减值、抵押受限资产明细": "Check additions, disposals, depreciation, impairment, and pledged or restricted assets.",
    "资产扩张后折旧率应基本稳定；折旧率下降可能来自折旧年限变更、资产闲置或折旧计提不足。": "Depreciation rates should stay broadly stable after asset expansion; a lower rate may reflect useful-life changes, idle assets, or under-depreciation.",
    "折旧费用或固定资产平均余额": "Depreciation expense or average fixed-asset balance",
    "产能扩张通常需要在后续收入中体现；资产增长长期脱离收入增长时，需核查产能利用率与项目状态。": "Capacity expansion should eventually show up in revenue; if asset growth stays disconnected from revenue growth, check utilization and project status.",
    "在建工程附注": "Construction-in-progress footnote",
    "核查长期未转固项目、预算、进度、利息资本化和减值迹象": "Check long-unconverted projects, budgets, progress, capitalized interest, and impairment signs.",
    "会计政策附注": "Accounting-policy footnote",
    "核查折旧年限、残值率、资本化政策是否变更": "Check changes in useful lives, residual values, and capitalization policy.",
    "存货周转天数": "Inventory days",
    "周转天数越长，滞销、跌价或账面水分风险越高；需结合行业和季节性判断。": "Longer inventory days increase the risk of slow-moving goods, write-downs, or inflated book value; interpret this with industry and seasonality in mind.",
    "存货余额或营业成本": "Inventory balance or cost of revenue",
    "存货增速 vs 营收增速": "Inventory growth vs. revenue growth",
    "存货增长显著快于收入时，需核查备货依据、订单覆盖和跌价准备。": "When inventory grows materially faster than revenue, check stocking rationale, order coverage, and write-down reserves.",
    "现金流质量与存货变化": "Cash-flow quality and inventory change",
    "利润为正但现金流偏弱，同时存货上升，常见于库存积压或成本结转不足。": "Positive profit with weak cash flow and rising inventory is often seen with inventory buildup or insufficient cost recognition.",
    "存货附注": "Inventory footnote",
    "核查原材料、在产品、产成品结构及库龄": "Check raw materials, work in progress, finished goods, and inventory aging.",
    "存货跌价准备附注": "Inventory write-down reserve footnote",
    "核查计提比例、转回原因、可变现净值假设": "Check reserve ratio, reversal reasons, and net realizable value assumptions.",
    "收入与订单披露": "Revenue and order disclosures",
    "核查大额备货是否有订单、合同或交付计划支撑": "Check whether large inventory buildup is supported by orders, contracts, or delivery plans.",
    "应收账款增速 vs 营收增速": "Receivables growth vs. revenue growth",
    "应收增速长期高于收入增速，可能说明信用政策放宽、回款恶化或收入确认偏激进。": "Receivables growing faster than revenue may indicate looser credit terms, weaker collections, or aggressive revenue recognition.",
    "应收账款期初/期末余额或收入": "Opening/ending receivables balance or revenue",
    "应收账款 / 营收": "Receivables / revenue",
    "收入确认后应最终转化为现金；应收占收入过高时需核查账龄、大客户和坏账准备。": "Revenue should eventually turn into cash; high receivables-to-revenue requires checking aging, major customers, and bad-debt reserves.",
    "应收账款附注": "Receivables footnote",
    "核查账龄、前五大欠款方、坏账准备和逾期情况": "Check aging, top five debtors, bad-debt reserves, and overdue balances.",
    "合同负债变化 vs 营收增长": "Contract liabilities change vs. revenue growth",
    "收入大增但合同负债下降，可能是透支前期预收或履约进度确认发生变化。": "Rapid revenue growth with falling contract liabilities may mean prior advances were consumed or performance-obligation timing changed.",
    "合同负债/递延收入": "Contract liabilities / deferred revenue",
    "收入确认政策": "Revenue recognition policy",
    "核查履约义务、时点/时段确认、可变对价和退货条款": "Check performance obligations, point-in-time vs. over-time recognition, variable consideration, and return terms.",
    "合同负债附注": "Contract-liability footnote",
    "核查预收款、递延收入、本期结转收入": "Check advances, deferred revenue, and revenue recognized from opening balances.",
    "税费披露": "Tax disclosures",
    "核查增值税/销售税相关披露与收入规模是否匹配": "Check whether VAT/sales-tax disclosures align with revenue scale.",
    "经营现金流 / 净利润": "Operating cash flow / net income",
    "这是利润质量的总报警器；利润不能转化为经营现金流时，需要向应收、存货、预付和其他营运资本溯因。": "This is the main earnings-quality alarm; when profit does not convert into operating cash flow, trace the gap through receivables, inventory, prepayments, and other working-capital items.",
    "经营现金流或净利润": "Operating cash flow or net income",
    "经营现金流率": "Operating cash flow margin",
    "收入增长如果不能带来经营现金流，说明回款、库存或成本付款端存在压力。": "Revenue growth without operating cash flow suggests pressure in collections, inventory, or cost payments.",
    "现金流量表补充资料": "Cash-flow statement supplement",
    "核查净利润调节为经营现金流的具体项目": "Check the specific reconciliation items from net income to operating cash flow.",
    "营运资本附注": "Working-capital footnote",
    "核查应收、存货、预付、应付变化是否解释现金流缺口": "Check whether receivables, inventory, prepayments, and payables explain the cash-flow gap.",
    "非经常性损益披露": "Non-recurring gains/losses disclosure",
    "核查利润是否由一次性收益、补贴或公允价值变动支撑": "Check whether profit is supported by one-off gains, subsidies, or fair-value changes.",
    "债务融资大进大出": "Large debt issuance and repayment turnover",
    "借新还旧规模较大时，说明流动性依赖再融资，需要核查债务期限结构。": "Large refinancing turnover indicates liquidity depends on refinancing; check the debt maturity structure.",
    "隐含融资成本": "Implied financing cost",
    "利息支出相对有息负债偏高，可能反映高成本融资、票据贴现或未完整呈现的债务压力。": "High interest expense relative to interest-bearing debt may reflect expensive financing, bill discounting, or debt pressure not fully visible in headline balances.",
    "利息支出或有息负债": "Interest expense or interest-bearing debt",
    "应付账款增速 vs 营收增速": "Payables growth vs. revenue growth",
    "应付增长过快可能是供应商信用被动拉长，需核查账龄和逾期款项。": "Fast payables growth may mean supplier credit is being stretched; check aging and overdue balances.",
    "应付账款期初/期末余额": "Opening/ending payables balance",
    "有息负债附注": "Interest-bearing debt footnote",
    "核查短债、长债、租赁负债、利率、期限和抵押担保": "Check short-term debt, long-term debt, lease liabilities, interest rates, maturities, and collateral.",
    "承诺及或有事项": "Commitments and contingencies",
    "核查对外担保、未决诉讼、回购义务、最低付款承诺": "Check external guarantees, pending litigation, repurchase obligations, and minimum payment commitments.",
    "关联方交易披露": "Related-party transaction disclosures",
    "核查其他应付款、资金拆借和交叉担保": "Check other payables, fund lending/borrowing, and cross-guarantees.",
    "应付账款附注": "Payables footnote",
    "核查账龄、逾期供应商款项和票据到期压力": "Check aging, overdue supplier balances, and bill maturity pressure.",
    "毛利率变化": "Gross margin change",
    "毛利率逆势大幅提升时，需要验证产品结构、售价、原材料价格和成本结转。": "When gross margin rises sharply against the trend, validate product mix, pricing, raw-material prices, and cost recognition.",
    "毛利或收入": "Gross profit or revenue",
    "销售管理费用率变化": "SG&A expense ratio change",
    "费用率和毛利率同时改善需要核查是否存在费用资本化或成本递延。": "Simultaneous improvement in expense ratio and gross margin requires checking for expense capitalization or cost deferral.",
    "销售管理费用": "SG&A expenses",
    "营业成本附注": "Cost-of-revenue footnote",
    "核查原材料、人工、制造费用和产品结构变化": "Check raw materials, labor, manufacturing overhead, and product-mix changes.",
    "分部信息": "Segment information",
    "核查不同业务/地区毛利率是否异常分化": "Check whether gross margins diverge unusually across businesses or regions.",
    "研发与资本化政策": "R&D and capitalization policy",
    "核查费用化支出是否被资本化": "Check whether expensed costs were capitalized.",
    "员工薪酬披露": "Employee compensation disclosures",
    "核查员工数量、人均薪酬和职工薪酬现金流": "Check headcount, average compensation, and employee-compensation cash flow.",
    "商誉 / 股东权益": "Goodwill / shareholders' equity",
    "商誉占净资产过高时，一旦减值会直接冲击权益和利润。": "When goodwill is large relative to equity, impairment can directly hit both equity and profit.",
    "商誉或股东权益": "Goodwill or shareholders' equity",
    "商誉及无形资产 / 总资产": "Goodwill and intangible assets / total assets",
    "无形资产占比高的公司，需要核查减值测试假设和未来现金流预测。": "For companies with high intangible-asset intensity, check impairment-test assumptions and future cash-flow forecasts.",
    "商誉变化": "Goodwill change",
    "商誉大幅上升通常来自并购，需要核查收购价格、业绩承诺和估值假设。": "A sharp goodwill increase usually comes from acquisitions; review purchase price, earn-out commitments, and valuation assumptions.",
    "商誉附注": "Goodwill footnote",
    "核查被收购主体、形成原因、减值测试和现金产生单元": "Check acquired entities, formation reasons, impairment tests, and cash-generating units.",
    "并购披露": "M&A disclosures",
    "核查收购溢价、业绩承诺、对赌补偿和关联交易": "Check acquisition premium, earn-out commitments, compensation clauses, and related-party transactions.",
    "无形资产附注": "Intangible-asset footnote",
    "核查摊销年限、减值迹象和可收回金额假设": "Check amortization periods, impairment indicators, and recoverable-amount assumptions.",
    "流动比率": "Current ratio",
    "流动资产不足以覆盖流动负债时，短期偿债压力上升。": "When current assets cannot cover current liabilities, short-term solvency pressure rises.",
    "流动资产或流动负债": "Current assets or current liabilities",
    "现金 / 流动负债": "Cash / current liabilities",
    "现金缓冲越薄，越依赖经营回款和外部融资续接。": "The thinner the cash buffer, the more the company depends on collections and external refinancing.",
    "短债 / 现金": "Short-term debt / cash",
    "短债明显高于现金时，需核查授信额度、债务到期表和再融资安排。": "When short-term debt is clearly above cash, check credit lines, maturity schedules, and refinancing plans.",
    "短期有息债务或现金": "Short-term interest-bearing debt or cash",
    "经营现金流 / 流动负债": "Operating cash flow / current liabilities",
    "经营现金流覆盖短期负债能力偏弱时，流动性风险更容易被放大。": "Weak operating-cash-flow coverage of current liabilities can amplify liquidity risk.",
    "债务到期结构披露": "Debt maturity disclosures",
    "核查一年内到期债务、授信额度、融资续作计划": "Check debt due within one year, credit lines, and refinancing plans.",
    "受限资金附注": "Restricted cash footnote",
    "核查现金是否因保证金、监管或抵押受限": "Check whether cash is restricted by deposits, regulation, or collateral arrangements.",
    "流动资产质量": "Current-asset quality",
    "核查应收账款可回收性、存货可变现性和预付款项": "Check receivables collectability, inventory realizability, and prepayments.",
}


def _translate_phrase(text: str) -> str:
    if not text:
        return text
    if text.endswith(" 处于危险区") and text.startswith("Altman"):
        return text.replace(" 处于危险区", " is in the distress zone")
    return _RISK_LABELS_EN.get(text) or _PHRASE_TRANSLATIONS_EN.get(text) or _translate_risk_text(text)


def _localize_risk_assessment(risk: dict, lang: str) -> dict:
    if not _is_english(lang):
        return risk

    risk["summary"] = _translate_risk_text(risk.get("summary", ""), risk)

    for key in ("altman_z", "beneish_m", "cash_quality", "receivables"):
        block = risk.get(key)
        if isinstance(block, dict) and "interpretation" in block:
            block["interpretation"] = _translate_risk_text(block.get("interpretation", ""))

    for flag in risk.get("red_flags", []) or []:
        flag["category"] = _translate_phrase(flag.get("category", ""))
        flag["title"] = _translate_phrase(flag.get("title", ""))
        flag["description"] = _translate_phrase(flag.get("description", ""))

    for scenario in risk.get("risk_scenarios", []) or []:
        scenario_id = scenario.get("id")
        scenario["title"] = _SCENARIO_TITLES_EN.get(scenario_id, _translate_phrase(scenario.get("title", "")))
        scenario["summary"] = _translate_risk_text(scenario.get("summary", ""))
        scenario["missing_data"] = [_translate_phrase(item) for item in scenario.get("missing_data", [])]
        scenario["next_steps"] = [_translate_phrase(item) for item in scenario.get("next_steps", [])]
        for item in scenario.get("evidence", []) or []:
            item["label"] = _translate_phrase(item.get("label", ""))
            item["interpretation"] = _translate_phrase(item.get("interpretation", ""))
        for check in scenario.get("disclosure_checks", []) or []:
            check["section"] = _translate_phrase(check.get("section", ""))
            check["focus"] = _translate_phrase(check.get("focus", ""))

    for check in risk.get("disclosure_checks", []) or []:
        check["scenario_title"] = _SCENARIO_TITLES_EN.get(
            check.get("scenario_id"),
            _translate_phrase(check.get("scenario_title", "")),
        )
        check["section"] = _translate_phrase(check.get("section", ""))
        check["focus"] = _translate_phrase(check.get("focus", ""))

    confidence = risk.get("model_confidence")
    if isinstance(confidence, dict):
        confidence["reasons"] = [_translate_risk_text(reason) for reason in confidence.get("reasons", [])]

    for item in risk.get("risk_drivers", []) or []:
        item["title"] = _translate_phrase(item.get("title", ""))
        item["description"] = _translate_risk_text(_translate_phrase(item.get("description", "")))

    for item in risk.get("mitigating_factors", []) or []:
        item["title"] = _translate_phrase(item.get("title", ""))
        item["description"] = _translate_risk_text(_translate_phrase(item.get("description", "")))

    for item in risk.get("stress_tests", []) or []:
        item["title"] = _translate_phrase(item.get("title", ""))
        item["summary"] = _translate_risk_text(_translate_phrase(item.get("summary", "")))

    return risk


# ─────────────────────────────────────────
# AI 公司分析（单公司，含风险评估）
# ─────────────────────────────────────────
@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    """
    完整的 AI 分析流程：
    1. 抽取意图（公司名 → ticker）
    2. 拉财务数据
    3. 风险评估（Altman Z, Beneish M, 现金流匹配等）
    4. LLM 生成可读的分析报告
    """
    if req.analysis_mode == "sector":
        analysis = generate_sector_analysis(
            user_input=req.user_input,
            llm_api_key=req.llm_api_key,
            provider=req.provider,
            lang=req.lang,
        )
        return {
            "status": "ok",
            "analysis": analysis,
        }

    # 第一步：意图识别
    intent = extract_company_and_intent(
        req.user_input,
        llm_api_key=req.llm_api_key,
        provider=req.provider,
        lang=req.lang,
    )

    ticker = intent.get("ticker")
    company_name = intent.get("company_name")

    if not ticker:
        if company_name:
            msg_zh = f"识别到公司「{company_name}」，但暂时找不到对应的股票代码。请尝试直接输入股票代码（如美股 'AAPL' 或 A 股 6 位数字）。"
            msg_en = f"Identified company '{company_name}' but couldn't find its ticker. Try entering the ticker directly (e.g. 'AAPL' for US or 6-digit code for China A-shares)."
        else:
            msg_zh = "没有识别到具体公司。请尝试更明确的查询，例如「分析苹果 2024 财务」或「分析 600519 财务」。"
            msg_en = "No company identified. Try a clearer query like 'Analyze Apple 2024 financials'."
        return {
            "status": "no_company",
            "message": msg_zh if req.lang == "zh" else msg_en,
        }

    # 第二步：拉数据
    company_info = get_company_info(ticker)
    if not company_info or not company_info.get("name"):
        company_info = {
            "ticker": ticker,
            "market": intent.get("market", "us"),
            "name": company_name or ticker,
        }

    # 修正未来年份：当前年份还没出年报，回退到上一年
    requested_period = str(intent.get("period", "2024"))
    period = requested_period
    try:
        current_year = datetime.now().year
        if int(period) >= current_year:
            period = str(current_year - 1)
    except (ValueError, TypeError):
        period = "2024"

    financial_data = get_financial_data(ticker, period)
    actual_period_used = financial_data.get("actual_period_used")
    resolved_period = financial_data.get("resolved_period") or actual_period_used or period
    period_matched = bool(actual_period_used and str(actual_period_used) == requested_period)
    data_source = financial_data.get("data_source")
    is_stale = bool(financial_data.get("is_stale") or financial_data.get("_stale"))
    intent["period"] = resolved_period

    # 第三步：风险评估（失败时不影响主流程）
    analysis_period = resolved_period or period
    try:
        risk_assessment = assess_company_risk(
            ticker, company_info["market"], analysis_period
        )
    except Exception as e:
        risk_assessment = {
            "overall_score": None,
            "risk_level": None,
            "summary": f"风险评估暂不可用: {e}" if req.lang == "zh" else f"Risk assessment unavailable: {e}",
            "dimension_scores": {},
            "red_flags": [],
        }
    risk_assessment = _localize_risk_assessment(risk_assessment, req.lang)

    # 第四步：生成分析。LLM key 失效不应该让已取得的财务/风险数据一起丢失。
    analysis_error = None
    try:
        analysis = generate_analysis(
            company_name=company_info["name"],
            ticker=ticker,
            market=company_info["market"],
            financial_data=financial_data,
            analysis_types=intent.get("analysis_types", ["financial", "valuation", "risk"]),
            period=analysis_period,
            llm_api_key=req.llm_api_key,
            provider=req.provider,
            lang=req.lang,
        )
    except Exception as e:
        analysis_error = str(e)
        if req.lang == "zh":
            analysis = (
                "## AI 报告生成失败\n\n"
                "公司和财务数据已经识别成功，但调用 AI 模型生成文字报告时失败。"
                "请检查当前设置里的 LLM API key、provider 是否正确，或稍后重试。"
            )
        else:
            analysis = (
                "## AI report generation failed\n\n"
                "The company and financial data were identified successfully, but the LLM call failed while generating the narrative report. "
                "Please check the LLM API key/provider in settings and try again."
            )

    return {
        "status": "ok",
        "intent": intent,
        "company": company_info,
        "requested_period": requested_period,
        "resolved_period": resolved_period,
        "actual_period_used": actual_period_used,
        "period_matched": period_matched,
        "data_source": data_source,
        "is_stale": is_stale,
        "financial_data": financial_data,
        "risk": risk_assessment,
        "analysis": analysis,
        "analysis_error": analysis_error,
    }


# ─────────────────────────────────────────
# 多公司对比（Apple-style）
# ─────────────────────────────────────────
@router.post("/compare")
def compare(req: CompareRequest):
    """
    批量拉多家公司的财务数据 + 风险评估
    用于多公司对比页面
    """
    if not req.tickers or len(req.tickers) < 2:
        detail = "Need at least 2 tickers" if _is_english(req.lang) else "至少需要 2 个股票代码"
        raise HTTPException(status_code=400, detail=detail)
    if len(req.tickers) > 4:
        detail = "Max 4 tickers for comparison" if _is_english(req.lang) else "最多只能对比 4 个股票代码"
        raise HTTPException(status_code=400, detail=detail)

    companies = []
    for ticker in req.tickers:
        company_info = get_company_info(ticker) or {
            "ticker": ticker,
            "market": "us",
            "name": ticker,
        }
        financial = get_financial_data(ticker, req.period)

        try:
            risk = assess_company_risk(ticker, company_info["market"], req.period)
        except Exception as e:
            risk = {
                "overall_score": None,
                "risk_level": None,
                "summary": f"Risk assessment unavailable: {e}" if _is_english(req.lang) else f"风险评估暂不可用: {e}",
                "dimension_scores": {},
                "red_flags": [],
            }
        risk = _localize_risk_assessment(risk, req.lang)

        companies.append({
            "company": company_info,
            "financial": financial,
            "risk": risk,
        })

    return {"period": req.period, "companies": companies}
