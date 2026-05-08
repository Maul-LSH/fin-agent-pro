"""
core/data_sec.py — SEC EDGAR 数据源（仅美股）

设计原则：
1. 输出 schema 必须与 _us_financial_data (yfinance 版) 完全一致
2. SEC EDGAR 只覆盖美股 — A 股请用 AkShare
3. 任何异常都向上抛出，由 data.py 的 fallback 机制接住

依赖：edgartools >= 5.0
合规：必须先调用 set_identity()

——————————————————————————————————————————————————
edgartools 5.x 真实数据结构（基于实测 AAPL 数据）：
- fin.income_statement().to_dataframe() → DataFrame
- 列：concept, label, standard_concept, '2025-09-27 (FY)', '2024-09-28 (FY)', ...
- 行：每行一个 metric，但有大量重复（按地区/产品拆分）
- 关键过滤：在 standard_concept 列里精确匹配，取第一个非空值
——————————————————————————————————————————————————
"""

import os
import re
from typing import Optional

import pandas as pd

from .utils import safe_round, to_billion


# ─────────────────────────────────────────
# SEC identity 初始化
# ─────────────────────────────────────────
_IDENTITY_INITIALIZED = False


def _ensure_identity():
    global _IDENTITY_INITIALIZED
    if _IDENTITY_INITIALIZED:
        return

    identity = os.getenv("SEC_EDGAR_IDENTITY")
    if not identity:
        identity = "fin-agent-pro user@example.com"

    try:
        from edgar import set_identity
        set_identity(identity)
        _IDENTITY_INITIALIZED = True
    except ImportError as e:
        raise RuntimeError(
            "edgartools is not installed. Run: pip install edgartools"
        ) from e


# ─────────────────────────────────────────
# 主入口
# ─────────────────────────────────────────
def get_us_financial_data_sec(ticker: str, period: str) -> dict:
    """
    用 edgartools 从 SEC EDGAR 拉取财务数据
    返回 schema 与 yfinance 版本兼容
    """
    _ensure_identity()

    from edgar import Company

    result = {
        "market": "us",
        "ticker": ticker,
        "period": period,
        "data_source": "sec_edgar",
    }

    company = Company(ticker)
    if not company:
        raise ValueError(f"Company {ticker} not found in SEC EDGAR")

    financials = company.get_financials()
    if financials is None:
        raise ValueError(f"No financials available for {ticker}")

    # ── 利润表 ──
    try:
        inc_stmt = financials.income_statement()
        income_df = inc_stmt.to_dataframe() if inc_stmt else None
        if income_df is not None and not income_df.empty:
            year_col = _find_year_column(income_df.columns, period)
            if year_col:
                metrics = _extract_income(income_df, year_col)
                if metrics:
                    result["income"] = metrics
    except Exception:
        pass

    # ── 资产负债表 ──
    try:
        bal_stmt = financials.balance_sheet()
        balance_df = bal_stmt.to_dataframe() if bal_stmt else None
        if balance_df is not None and not balance_df.empty:
            year_col = _find_year_column(balance_df.columns, period)
            if year_col:
                metrics = _extract_balance(balance_df, year_col)
                if metrics:
                    result["balance"] = metrics
    except Exception:
        pass

    # ── 现金流量表（方法名因版本而异）──
    try:
        cf_stmt = _get_cashflow_statement(financials)
        cashflow_df = cf_stmt.to_dataframe() if cf_stmt else None
        if cashflow_df is not None and not cashflow_df.empty:
            year_col = _find_year_column(cashflow_df.columns, period)
            if year_col:
                metrics = _extract_cashflow(cashflow_df, year_col)
                if metrics:
                    result["cashflow"] = metrics
    except Exception:
        pass

    # ── ROE 计算（用利润表 + 资产负债表）──
    ni = result.get("income", {}).pop("_raw_net_income", None)
    eq = result.get("balance", {}).pop("_raw_equity", None)
    if ni and eq and eq > 0:
        result.setdefault("indicators", {})["ROE (%)"] = safe_round(ni / eq * 100, 2)

    # 至少要有一张表才算成功
    if not any(k in result for k in ("income", "balance", "cashflow")):
        raise ValueError(f"No financial data extracted for {ticker} period={period}")

    return result


def _get_cashflow_statement(financials):
    """edgartools 不同版本现金流量表的方法名不一样，按优先级试"""
    for name in ("cashflow_statement", "cash_flow_statement", "cashflow", "cash_flow"):
        if hasattr(financials, name):
            attr = getattr(financials, name)
            try:
                return attr() if callable(attr) else attr
            except Exception:
                continue
    return None


# ─────────────────────────────────────────
# 列匹配
# ─────────────────────────────────────────
def _find_year_column(columns, period: str) -> Optional[str]:
    """
    columns 长这样:
    ['concept', 'label', 'standard_concept',
     '2025-09-27 (FY)', '2024-09-28 (FY)', ...]
    
    要找包含 period 年份的列
    """
    period_str = str(period)
    cols_list = list(columns)

    # 优先精确匹配年份开头的列
    for col in cols_list:
        col_str = str(col)
        if col_str.startswith(period_str + "-"):
            return col

    # 包含 period_str
    for col in cols_list:
        col_str = str(col)
        if f"{period_str}-" in col_str:
            return col

    # 兜底：找第一个看起来是日期的列
    for col in cols_list:
        col_str = str(col)
        if re.match(r"^20\d{2}-\d{2}-\d{2}", col_str):
            return col

    return None


# ─────────────────────────────────────────
# 标准化 concept 候选名（按 edgartools 实际返回的 standard_concept 命名）
# ─────────────────────────────────────────

# 利润表
_REVENUE_CONCEPTS = ["Revenue", "Revenues", "TotalRevenues", "SalesRevenueNet"]
_GROSS_PROFIT_CONCEPTS = ["GrossProfit"]
_OPERATING_INCOME_CONCEPTS = ["OperatingIncomeLoss", "OperatingIncome"]
_NET_INCOME_CONCEPTS = ["NetIncomeLoss", "NetIncome", "ProfitLoss"]
_EPS_CONCEPTS = ["EarningsPerShareBasic", "BasicEPS", "EarningsPerShareBasicAndDiluted"]

# 资产负债表
_TOTAL_ASSETS_CONCEPTS = ["Assets", "TotalAssets"]
_TOTAL_LIAB_CONCEPTS = ["Liabilities", "TotalLiabilities"]
_EQUITY_CONCEPTS = ["StockholdersEquity", "TotalStockholdersEquity", "TotalEquity"]
_CASH_CONCEPTS = ["CashAndCashEquivalents", "CashAndMarketableSecurities", "Cash"]
_DEBT_CONCEPTS = ["LongTermDebt", "TotalDebt", "LongTermDebtNoncurrent"]

# 现金流量表
_OCF_CONCEPTS = [
    "NetCashProvidedByUsedInOperatingActivities",
    "CashFlowFromOperations",
    "OperatingCashFlow",
]
_CAPEX_CONCEPTS = [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "CapitalExpenditures",
]
_FCF_CONCEPTS = ["FreeCashFlow"]


def _find_value(
    df: pd.DataFrame, concept_candidates: list[str], year_col: str
) -> Optional[float]:
    """
    在 DataFrame 中按候选 concept 查找数值
    
    优先级：
    1. standard_concept 精确匹配（最准）
    2. concept 列前缀匹配（含 "us-gaap_..."）
    
    只取第一个匹配的非空值（顶级聚合行）
    """
    if df is None or df.empty or year_col not in df.columns:
        return None

    # 第一轮：standard_concept 精确匹配
    if "standard_concept" in df.columns:
        for concept in concept_candidates:
            mask = df["standard_concept"] == concept
            if mask.any():
                for _, row in df[mask].iterrows():
                    val = row.get(year_col)
                    if pd.notna(val):
                        try:
                            return float(val)
                        except (TypeError, ValueError):
                            continue

    # 第二轮：concept 列模糊匹配
    if "concept" in df.columns:
        for concept in concept_candidates:
            pattern = rf"^us-gaap_{re.escape(concept)}"
            try:
                mask = df["concept"].astype(str).str.match(pattern, case=False, na=False)
            except Exception:
                continue
            if mask.any():
                for _, row in df[mask].iterrows():
                    val = row.get(year_col)
                    if pd.notna(val):
                        try:
                            return float(val)
                        except (TypeError, ValueError):
                            continue

    return None


# ─────────────────────────────────────────
# 各表的字段提取
# ─────────────────────────────────────────
def _extract_income(df: pd.DataFrame, year_col: str) -> dict:
    out = {}

    revenue = _find_value(df, _REVENUE_CONCEPTS, year_col)
    gross = _find_value(df, _GROSS_PROFIT_CONCEPTS, year_col)
    op_income = _find_value(df, _OPERATING_INCOME_CONCEPTS, year_col)
    net_income = _find_value(df, _NET_INCOME_CONCEPTS, year_col)
    eps = _find_value(df, _EPS_CONCEPTS, year_col)

    if revenue is not None:
        out["Revenue (B)"] = to_billion(revenue)
    if gross is not None:
        out["Gross Profit (B)"] = to_billion(gross)
    if op_income is not None:
        out["Operating Income (B)"] = to_billion(op_income)
    if net_income is not None:
        out["Net Income (B)"] = to_billion(net_income)
    if eps is not None:
        out["EPS (Basic)"] = safe_round(eps)

    if revenue and revenue > 0:
        if gross:
            out["Gross Margin (%)"] = safe_round(gross / revenue * 100, 2)
        if net_income:
            out["Net Margin (%)"] = safe_round(net_income / revenue * 100, 2)

    if net_income:
        out["_raw_net_income"] = net_income

    return out


def _extract_balance(df: pd.DataFrame, year_col: str) -> dict:
    out = {}

    total_assets = _find_value(df, _TOTAL_ASSETS_CONCEPTS, year_col)
    total_liab = _find_value(df, _TOTAL_LIAB_CONCEPTS, year_col)
    equity = _find_value(df, _EQUITY_CONCEPTS, year_col)
    cash = _find_value(df, _CASH_CONCEPTS, year_col)
    debt = _find_value(df, _DEBT_CONCEPTS, year_col)

    if total_assets is not None:
        out["Total Assets (B)"] = to_billion(total_assets)
    if total_liab is not None:
        out["Total Liabilities (B)"] = to_billion(total_liab)
    if equity is not None:
        out["Stockholders Equity (B)"] = to_billion(equity)
    if cash is not None:
        out["Cash & Equivalents (B)"] = to_billion(cash)
    if debt is not None:
        out["Total Debt (B)"] = to_billion(debt)

    if total_assets and total_liab:
        out["Debt-to-Asset Ratio (%)"] = safe_round(total_liab / total_assets * 100, 2)

    if equity:
        out["_raw_equity"] = equity

    return out


def _extract_cashflow(df: pd.DataFrame, year_col: str) -> dict:
    out = {}

    ocf = _find_value(df, _OCF_CONCEPTS, year_col)
    capex = _find_value(df, _CAPEX_CONCEPTS, year_col)
    fcf = _find_value(df, _FCF_CONCEPTS, year_col)

    if ocf is not None:
        out["Operating Cash Flow (B)"] = to_billion(ocf)
    if capex is not None:
        # CapEx 在 SEC 是正数（流出），保持流出为负
        out["Capital Expenditure (B)"] = to_billion(-abs(capex))

    # FCF 优先用 SEC 直接数据，否则 OCF - CapEx 计算
    if fcf is not None:
        out["Free Cash Flow (B)"] = to_billion(fcf)
    elif ocf is not None and capex is not None:
        out["Free Cash Flow (B)"] = to_billion(ocf - abs(capex))

    return out
