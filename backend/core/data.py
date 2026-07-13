"""
core/data.py — 财务数据获取层
统一接口：get_company_info / get_financial_data
内部根据市场分流到 yfinance（美股）或 AkShare（A 股）
"""

import re

import yfinance as yf
import akshare as ak

from .utils import (
    retry,
    safe_round,
    to_billion,
    to_yi,
    detect_market,
    normalize_ticker,
    cached_fetch,
    persistent_cached_fetch,
)
from . import fmp


QUOTE_TTL = 30 * 60
STALE_TTL = 30 * 24 * 60 * 60


def _year_from_column(col) -> str | None:
    """Best-effort fiscal year extraction from source-specific statement columns."""
    if col is None:
        return None
    year = getattr(col, "year", None)
    if year:
        return str(year)
    match = re.search(r"\b(20\d{2}|19\d{2})\b", str(col))
    return match.group(1) if match else None


def _find_statement_column(columns, period: str):
    """
    Find the requested fiscal year first; if unavailable, fall back to the latest
    available column and return metadata so the UI can disclose the mismatch.
    """
    cols = [] if columns is None else list(columns)
    requested = str(period)
    for col in cols:
        if _year_from_column(col) == requested:
            return col, requested, True
    if cols:
        col = cols[0]
        return col, _year_from_column(col), False
    return None, None, False


def _resolve_actual_period(section_periods: dict) -> str | None:
    counts: dict[str, int] = {}
    for year in section_periods.values():
        if year:
            counts[str(year)] = counts.get(str(year), 0) + 1
    if not counts:
        return None
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)[0][0]


def _apply_period_metadata(result: dict, requested_period: str, section_periods: dict | None = None) -> dict:
    section_periods = section_periods or result.get("statement_periods") or {}
    actual_period = result.get("actual_period_used") or _resolve_actual_period(section_periods)
    result["requested_period"] = str(requested_period)
    result["actual_period_used"] = actual_period
    result["resolved_period"] = actual_period or str(requested_period)
    result["period_matched"] = bool(actual_period and str(actual_period) == str(requested_period))
    result["is_stale"] = bool(result.get("_stale"))
    if section_periods:
        result["statement_periods"] = section_periods
    result.setdefault("data_source", "unknown")
    return result


# ─────────────────────────────────────────
# 公司信息（统一入口）
# ─────────────────────────────────────────
def get_company_info(ticker: str) -> dict:
    """
    根据 ticker 拉取公司基本信息
    永远返回 dict，最差情况下也包含 ticker 和市场
    """
    market = detect_market(ticker)
    norm = normalize_ticker(ticker, market)
    if market == "us":
        return _us_company_info(norm)
    if market == "hk":
        return _hk_company_info(norm)
    return _cn_company_info(norm)


def _us_company_info(ticker: str) -> dict:
    """美股公司信息：信任 ticker，即使 yfinance 失败也返回最小信息"""
    try:
        info = retry(lambda: yf.Ticker(ticker).info, retries=2) or {}
        name = info.get("longName") or info.get("shortName") or ticker
        return {
            "ticker": ticker,
            "market": "us",
            "name": name,
            "industry": info.get("industry"),
            "sector": info.get("sector"),
            "summary": (info.get("longBusinessSummary") or "")[:300],
        }
    except Exception:
        return {"ticker": ticker, "market": "us", "name": ticker}


def _cn_company_info(ticker: str) -> dict:
    """A 股公司信息：通过 AkShare 验证"""
    def _fetch():
        df = ak.stock_info_a_code_name()
        matched = df[df["code"] == ticker]
        if matched.empty:
            return None
        return {
            "ticker": ticker,
            "market": "cn",
            "name": matched.iloc[0]["name"],
        }

    result = retry(_fetch, retries=1)
    return result or {"ticker": ticker, "market": "cn", "name": ticker}


# ─────────────────────────────────────────
# 财务数据（统一入口）
# ─────────────────────────────────────────
def get_financial_data(ticker: str, period: str) -> dict:
    """根据 ticker 自动判断市场，拉取对应财务数据
    
    数据源优先级：
    - 美股：SEC EDGAR (institutional-grade) → fallback 到 yfinance
    - A 股：AkShare（SEC 不覆盖中国公司）
    - 港股：AkShare (stock_financial_hk_report_em)
    """
    market = detect_market(ticker)
    norm = normalize_ticker(ticker, market)

    if market == "us":
        return _us_financial_data_with_fallback(norm, period)
    if market == "hk":
        result = persistent_cached_fetch(
            f"financial.hk.{norm}.{period}",
            lambda: _hk_financial_data_with_fallback(norm, period),
            ttl=QUOTE_TTL,
            stale_ttl=STALE_TTL,
        )
        return _apply_period_metadata(result, period) if result else _apply_period_metadata({
            "market": "hk",
            "ticker": norm,
            "period": period,
            "error": "No cached or live financial data available",
        }, period)
    result = persistent_cached_fetch(
        f"financial.cn.{norm}.{period}",
        lambda: _cn_financial_data_with_fallback(norm, period),
        ttl=QUOTE_TTL,
        stale_ttl=STALE_TTL,
    )
    return _apply_period_metadata(result, period) if result else _apply_period_metadata({
        "market": "cn",
        "ticker": norm,
        "period": period,
        "error": "No cached or live financial data available",
    }, period)


def _has_financial_sections(data: dict) -> bool:
    return any(data.get(section) for section in ("valuation", "income", "balance", "cashflow", "indicators"))


def _cn_financial_data_with_fallback(ticker: str, period: str) -> dict:
    result = _cn_financial_data(ticker, period)
    if _has_financial_sections(result):
        result.setdefault("data_source", "akshare_cn")
        return _apply_period_metadata(result, period)

    fmp_data = fmp.financial_data(fmp.cn_symbol(ticker), period, market="cn", ticker=ticker)
    if fmp_data:
        if result.get("valuation_error") or result.get("financial_error"):
            fmp_data["akshare_fallback_reason"] = result.get("financial_error") or result.get("valuation_error")
        return _apply_period_metadata(fmp_data, period)
    return _apply_period_metadata(result, period)


def _hk_financial_data_with_fallback(ticker: str, period: str) -> dict:
    result = _hk_financial_data(ticker, period)
    if _has_financial_sections(result):
        result.setdefault("data_source", "akshare_hk")
        return _apply_period_metadata(result, period)

    fmp_data = fmp.financial_data(fmp.hk_symbol(ticker), period, market="hk", ticker=ticker)
    if fmp_data:
        if result.get("valuation_error") or result.get("financial_error"):
            fmp_data["akshare_fallback_reason"] = result.get("financial_error") or result.get("valuation_error")
        return _apply_period_metadata(fmp_data, period)
    return _apply_period_metadata(result, period)


def _us_financial_data_with_fallback(ticker: str, period: str) -> dict:
    """
    美股数据：先尝试 SEC EDGAR，失败时回退到 yfinance
    
    SEC 数据更准确权威（来自原始 10-K/10-Q），但：
    1. 不提供市场指标（PE/PB/Beta/Market Cap）
    2. 字段提取可能因 GAAP 概念差异失败
    
    所以即使 SEC 成功，也用 yfinance 补充 valuation 部分。
    """
    sec_data = None
    sec_error = None

    # 先尝试 SEC EDGAR
    try:
        from .data_sec import get_us_financial_data_sec
        sec_data = get_us_financial_data_sec(ticker, period)
    except Exception as e:
        sec_error = str(e)
        sec_data = None

    # 如果 SEC 完全失败 → 用 yfinance 全量
    if sec_data is None:
        result = _us_financial_data(ticker, period)
        result["data_source"] = "yfinance"
        if sec_error:
            result["sec_fallback_reason"] = sec_error
        return _apply_period_metadata(result, period)

    # SEC 成功 → 用 yfinance 补充估值数据（PE / PB / Market Cap 等）
    try:
        yf_data = _us_financial_data(ticker, period)
        if "valuation" in yf_data:
            sec_data["valuation"] = yf_data["valuation"]
        # 如果 SEC 缺失某张表，用 yfinance 的补
        for section in ("income", "balance", "cashflow"):
            if section not in sec_data and section in yf_data:
                sec_data[section] = yf_data[section]
        # 同上 indicators
        if "indicators" in yf_data:
            sec_data.setdefault("indicators", {}).update(
                {k: v for k, v in yf_data["indicators"].items()
                 if k not in sec_data.get("indicators", {})}
            )
    except Exception:
        # 即使补充失败，SEC 主数据仍可用
        pass

    return _apply_period_metadata(sec_data, period)


def _us_financial_data(ticker: str, period: str) -> dict:
    """美股财务数据（yfinance）— 作为 SEC EDGAR 的 fallback + 估值数据补充"""
    result = {"market": "us", "ticker": ticker, "period": period}
    section_periods = {}

    try:
        stock = yf.Ticker(ticker)
        info = retry(lambda: stock.info, retries=2) or {}

        if info:
            result["valuation"] = {
                "PE (TTM)": safe_round(info.get("trailingPE")),
                "Forward PE": safe_round(info.get("forwardPE")),
                "PB": safe_round(info.get("priceToBook")),
                "PS (TTM)": safe_round(info.get("priceToSalesTrailing12Months")),
                "Market Cap (B)": safe_round((info.get("marketCap") or 0) / 1e9, 2),
                "Dividend Yield (%)": safe_round((info.get("dividendYield") or 0) * 100, 2),
                "52W High": safe_round(info.get("fiftyTwoWeekHigh")),
                "52W Low": safe_round(info.get("fiftyTwoWeekLow")),
                "Beta": safe_round(info.get("beta")),
            }

        income = retry(lambda: stock.income_stmt, retries=2)
        if income is not None and not income.empty:
            col, actual_year, _ = _find_statement_column(income.columns, period)
            if col is not None:
                section_periods["income"] = actual_year
                row = income[col]
                result["income"] = {
                    "Revenue (B)": to_billion(row.get("Total Revenue")),
                    "Gross Profit (B)": to_billion(row.get("Gross Profit")),
                    "Operating Income (B)": to_billion(row.get("Operating Income")),
                    "Net Income (B)": to_billion(row.get("Net Income")),
                    "EPS (Basic)": safe_round(row.get("Basic EPS")),
                }
                rev = row.get("Total Revenue")
                if rev and rev > 0:
                    gp = row.get("Gross Profit")
                    ni = row.get("Net Income")
                    if gp:
                        result["income"]["Gross Margin (%)"] = safe_round(gp / rev * 100, 2)
                    if ni:
                        result["income"]["Net Margin (%)"] = safe_round(ni / rev * 100, 2)

        balance = retry(lambda: stock.balance_sheet, retries=2)
        if balance is not None and not balance.empty:
            col, actual_year, _ = _find_statement_column(balance.columns, period)
            if col is not None:
                section_periods["balance"] = actual_year
                row = balance[col]
                ta = row.get("Total Assets")
                tl = row.get("Total Liabilities Net Minority Interest")
                result["balance"] = {
                    "Total Assets (B)": to_billion(ta),
                    "Total Liabilities (B)": to_billion(tl),
                    "Stockholders Equity (B)": to_billion(row.get("Stockholders Equity")),
                    "Cash & Equivalents (B)": to_billion(row.get("Cash And Cash Equivalents")),
                    "Total Debt (B)": to_billion(row.get("Total Debt")),
                }
                if ta and tl:
                    result["balance"]["Debt-to-Asset Ratio (%)"] = safe_round(tl / ta * 100, 2)

        cashflow = retry(lambda: stock.cashflow, retries=2)
        if cashflow is not None and not cashflow.empty:
            col, actual_year, _ = _find_statement_column(cashflow.columns, period)
            if col is not None:
                section_periods["cashflow"] = actual_year
                row = cashflow[col]
                result["cashflow"] = {
                    "Operating Cash Flow (B)": to_billion(row.get("Operating Cash Flow")),
                    "Capital Expenditure (B)": to_billion(row.get("Capital Expenditure")),
                    "Free Cash Flow (B)": to_billion(row.get("Free Cash Flow")),
                }

        # ROE
        if income is not None and balance is not None:
            try:
                income_col, _, _ = _find_statement_column(income.columns, period)
                balance_col, _, _ = _find_statement_column(balance.columns, period)
                ni = income[income_col].get("Net Income") if income_col is not None else None
                eq = balance[balance_col].get("Stockholders Equity") if balance_col is not None else None
                if ni and eq and eq > 0:
                    result.setdefault("indicators", {})["ROE (%)"] = safe_round(ni / eq * 100, 2)
            except Exception:
                pass

    except Exception as e:
        result["error"] = str(e)

    return _apply_period_metadata(result, period, section_periods)


def _cn_financial_data(ticker: str, period: str) -> dict:
    """A 股财务数据（AkShare）"""
    result = {"market": "cn", "ticker": ticker, "period": period}
    section_periods = {}

    # 实时行情（估值）
    try:
        spot = retry(lambda: ak.stock_zh_a_spot_em(), retries=1)
        if spot is not None:
            matched = spot[spot["代码"] == ticker]
            if not matched.empty:
                row = matched.iloc[0]
                result["valuation"] = {
                    "PE (TTM)": safe_round(row.get("市盈率-动态")),
                    "PB": safe_round(row.get("市净率")),
                    "总市值(亿元)": safe_round((row.get("总市值") or 0) / 1e8, 2),
                    "流通市值(亿元)": safe_round((row.get("流通市值") or 0) / 1e8, 2),
                    "最新价": safe_round(row.get("最新价")),
                    "52周最高": safe_round(row.get("52周最高")),
                    "52周最低": safe_round(row.get("52周最低")),
                }
    except Exception as e:
        result["valuation_error"] = str(e)

    # 财务摘要
    try:
        import pandas as pd
        abstract = retry(lambda: ak.stock_financial_abstract(symbol=ticker), retries=1)
        if abstract is not None and not abstract.empty:
            year_col = f"{period}1231"
            if year_col in abstract.columns:
                section_periods = {
                    "income": str(period),
                    "balance": str(period),
                    "cashflow": str(period),
                    "indicators": str(period),
                }
                indicators_row = {}
                for _, r in abstract.iterrows():
                    key = r.get("指标")
                    val = r.get(year_col)
                    if key and pd.notna(val):
                        indicators_row[key] = val

                result["income"] = {
                    "营业总收入(亿元)": to_yi(indicators_row.get("营业总收入")),
                    "归母净利润(亿元)": to_yi(indicators_row.get("归母净利润")),
                    "扣非净利润(亿元)": to_yi(indicators_row.get("扣非净利润")),
                    "营业总收入同比增长(%)": safe_round(indicators_row.get("营业总收入同比增长")),
                    "归母净利润同比增长(%)": safe_round(indicators_row.get("归母净利润同比增长")),
                }
                result["indicators"] = {
                    "ROE(%)": safe_round(indicators_row.get("净资产收益率")),
                    "毛利率(%)": safe_round(indicators_row.get("销售毛利率")),
                    "净利率(%)": safe_round(indicators_row.get("销售净利率")),
                    "EPS(元)": safe_round(indicators_row.get("基本每股收益")),
                    "每股净资产(元)": safe_round(indicators_row.get("每股净资产")),
                }
                result["balance"] = {
                    "总资产(亿元)": to_yi(indicators_row.get("资产总计")),
                    "总负债(亿元)": to_yi(indicators_row.get("负债合计")),
                    "股东权益(亿元)": to_yi(indicators_row.get("归属母公司股东权益合计")),
                    "资产负债率(%)": safe_round(indicators_row.get("资产负债率")),
                }
                result["cashflow"] = {
                    "经营现金流(亿元)": to_yi(indicators_row.get("经营活动产生的现金流量净额")),
                    "投资现金流(亿元)": to_yi(indicators_row.get("投资活动产生的现金流量净额")),
                    "筹资现金流(亿元)": to_yi(indicators_row.get("筹资活动产生的现金流量净额")),
                }
    except Exception as e:
        result["financial_error"] = str(e)

    return _apply_period_metadata(result, period, section_periods)


# ─────────────────────────────────────────
# 港股公司信息（AkShare）
# ─────────────────────────────────────────
def _hk_company_info(ticker: str) -> dict:
    """
    港股公司信息：通过 AkShare stock_hk_spot_em 验证 + 拿名称
    ticker: 5 位数字（如 00700, 00005）
    """
    def _fetch():
        # 缓存全市场港股快照（4000+ 只）
        df = cached_fetch(
            "ak.hk.spot",
            lambda: ak.stock_hk_spot_em(),
            ttl=600,  # 港股变化没那么快，10 分钟缓存
        )
        if df is None or df.empty:
            return None
        # AkShare 港股代码字段是 "代码"，名称字段 "名称"
        matched = df[df["代码"] == ticker]
        if matched.empty:
            return None
        row = matched.iloc[0]
        return {
            "ticker": ticker,
            "market": "hk",
            "name": str(row.get("名称") or ticker),
        }

    result = retry(_fetch, retries=1)
    return result or {"ticker": ticker, "market": "hk", "name": ticker}


# ─────────────────────────────────────────
# 港股财务数据（AkShare）
# ─────────────────────────────────────────
def _hk_financial_data(ticker: str, period: str) -> dict:
    """
    港股财务数据，使用 AkShare:
    - 估值/行情: stock_hk_spot_em
    - 财报: stock_financial_hk_report_em (按报告)
    """
    result = {
        "market": "hk",
        "ticker": ticker,
        "period": period,
        "data_source": "akshare_hk",
    }
    section_periods = {}

    # ── 行情/估值 ──
    try:
        df = cached_fetch(
            "ak.hk.spot",
            lambda: ak.stock_hk_spot_em(),
            ttl=600,
        )
        if df is not None and not df.empty:
            matched = df[df["代码"] == ticker]
            if not matched.empty:
                row = matched.iloc[0]
                # 港股字段：最新价、涨跌幅、市盈率、最高/最低
                result["valuation"] = {
                    "PE (TTM)": safe_round(row.get("市盈率") or row.get("市盈率-动态")),
                    "Latest Price (HKD)": safe_round(row.get("最新价")),
                    "Change %": safe_round(row.get("涨跌幅"), 2),
                    "52W High": safe_round(row.get("最高")),
                    "52W Low": safe_round(row.get("最低")),
                    "Volume": safe_round(row.get("成交量"), 0),
                }
    except Exception as e:
        result["valuation_error"] = str(e)

    # ── 财报数据 ──
    # AkShare 港股财报接口返回长表（每行一个指标）：
    # 字段: SECUCODE, SECURITY_CODE, REPORT_DATE, FISCAL_YEAR, STD_ITEM_NAME, AMOUNT, ...
    try:
        income_df = retry(
            lambda: ak.stock_financial_hk_report_em(
                stock=ticker, symbol="利润表", indicator="年度"
            ),
            retries=1,
        )
        if income_df is not None and not income_df.empty:
            period_df = _hk_filter_period(income_df, period)
            if period_df is not None and not period_df.empty:
                section_periods["income"] = _hk_period_from_df(period_df)
                result["income"] = _hk_extract_income(period_df)

        bal_df = retry(
            lambda: ak.stock_financial_hk_report_em(
                stock=ticker, symbol="资产负债表", indicator="年度"
            ),
            retries=1,
        )
        if bal_df is not None and not bal_df.empty:
            period_df = _hk_filter_period(bal_df, period)
            if period_df is not None and not period_df.empty:
                section_periods["balance"] = _hk_period_from_df(period_df)
                result["balance"] = _hk_extract_balance(period_df)

        cf_df = retry(
            lambda: ak.stock_financial_hk_report_em(
                stock=ticker, symbol="现金流量表", indicator="年度"
            ),
            retries=1,
        )
        if cf_df is not None and not cf_df.empty:
            period_df = _hk_filter_period(cf_df, period)
            if period_df is not None and not period_df.empty:
                section_periods["cashflow"] = _hk_period_from_df(period_df)
                result["cashflow"] = _hk_extract_cashflow(period_df)
    except Exception as e:
        result["financial_error"] = str(e)

    return _apply_period_metadata(result, period, section_periods)


def _hk_period_from_df(df) -> str | None:
    if df is None or df.empty:
        return None
    for col in ["REPORT_DATE", "FISCAL_YEAR", "报告期"]:
        if col not in df.columns:
            continue
        try:
            value = str(df[col].iloc[0])
            match = re.search(r"\b(20\d{2}|19\d{2})\b", value)
            if match:
                return match.group(1)
        except Exception:
            continue
    return None


def _hk_filter_period(df, period: str):
    """
    AkShare 港股财报是长表：每行一个指标 (STD_ITEM_NAME = '营业额'/'毛利'/etc, AMOUNT = 值)
    一个公司多个会计期间，按 REPORT_DATE 过滤到目标年份。

    返回该年份的所有指标行（一个 DataFrame，多行）。
    """
    if df is None or df.empty:
        return None

    date_col = None
    for col in ["REPORT_DATE", "FISCAL_YEAR", "报告期"]:
        if col in df.columns:
            date_col = col
            break

    if date_col is None:
        return df  # 没有日期列，返回全部

    period_str = str(period)
    try:
        # 先尝试精确匹配年份
        matched = df[df[date_col].astype(str).str.startswith(period_str)]
        if not matched.empty:
            return matched
        # 兜底：包含年份
        matched = df[df[date_col].astype(str).str.contains(period_str, na=False)]
        if not matched.empty:
            return matched
    except Exception:
        pass

    # 兜底：取最近一期（按日期倒序后取第一组）
    try:
        # 找到最近的日期
        sorted_df = df.sort_values(date_col, ascending=False)
        latest_date = sorted_df[date_col].iloc[0]
        return df[df[date_col] == latest_date]
    except Exception:
        return df


def _hk_pick_amount(period_df, item_candidates: list):
    """
    在长表 DataFrame 中按 STD_ITEM_NAME 候选字段名顺序查找 AMOUNT 值

    参数:
        period_df: 已经过滤到目标年份的子表
        item_candidates: STD_ITEM_NAME 候选列表（如 ["营业额", "营业收入", "总收益"]）

    返回:
        第一个匹配的 AMOUNT 数值（float），都找不到返回 None
    """
    import pandas as pd_local

    if period_df is None or period_df.empty:
        return None

    if "STD_ITEM_NAME" not in period_df.columns or "AMOUNT" not in period_df.columns:
        return None

    for name in item_candidates:
        matched = period_df[period_df["STD_ITEM_NAME"] == name]
        if matched.empty:
            # 也尝试模糊匹配（包含关系）
            matched = period_df[
                period_df["STD_ITEM_NAME"].astype(str).str.contains(name, na=False)
            ]
        if not matched.empty:
            val = matched["AMOUNT"].iloc[0]
            if val is not None:
                try:
                    if pd_local.isna(val):
                        continue
                    return float(val)
                except (TypeError, ValueError):
                    continue
    return None


def _hk_extract_income(period_df) -> dict:
    """从港股利润表（长表）提取关键指标"""
    out = {}

    # 港股利润表常见科目（基于 AkShare STD_ITEM_NAME）
    revenue = _hk_pick_amount(period_df, ["营业额", "营业收入", "总收益", "收益"])
    cogs = _hk_pick_amount(period_df, ["销售成本", "经营成本", "营业成本"])
    operating = _hk_pick_amount(period_df, ["经营溢利", "经营利润", "营业利润"])
    pre_tax = _hk_pick_amount(period_df, ["除税前溢利", "税前利润"])
    net = _hk_pick_amount(period_df, [
        "本公司拥有人应占溢利",
        "股东应占溢利",
        "本公司股东应占溢利",
        "净利润",
        "纯利",
    ])
    eps = _hk_pick_amount(period_df, ["基本每股盈利", "每股盈利", "EPS"])

    # 毛利 = 营业额 - 销售成本（如果两个都有）
    gross = None
    if revenue is not None and cogs is not None:
        gross = revenue - cogs

    if revenue is not None:
        out["营业收入(亿港元)"] = safe_round(revenue / 1e8, 2)
    if gross is not None:
        out["毛利(亿港元)"] = safe_round(gross / 1e8, 2)
    if operating is not None:
        out["经营利润(亿港元)"] = safe_round(operating / 1e8, 2)
    if pre_tax is not None:
        out["税前利润(亿港元)"] = safe_round(pre_tax / 1e8, 2)
    if net is not None:
        out["净利润(亿港元)"] = safe_round(net / 1e8, 2)
    if eps is not None:
        out["EPS(港元)"] = safe_round(eps, 2)

    if revenue and revenue > 0:
        if gross is not None:
            out["毛利率(%)"] = safe_round(gross / revenue * 100, 2)
        if net is not None:
            out["净利率(%)"] = safe_round(net / revenue * 100, 2)

    return out


def _hk_extract_balance(period_df) -> dict:
    """从港股资产负债表（长表）提取关键指标"""
    out = {}

    total_assets = _hk_pick_amount(period_df, ["资产总计", "资产总额", "总资产"])
    total_liab = _hk_pick_amount(period_df, ["负债总计", "负债总额", "总负债"])
    equity = _hk_pick_amount(period_df, [
        "本公司拥有人应占权益",
        "股东权益",
        "权益总额",
        "权益合计",
    ])
    cash = _hk_pick_amount(period_df, [
        "现金及现金等价物",
        "现金及银行结余",
        "现金及等同现金项目",
        "现金",
    ])

    if total_assets is not None:
        out["总资产(亿港元)"] = safe_round(total_assets / 1e8, 2)
    if total_liab is not None:
        out["总负债(亿港元)"] = safe_round(total_liab / 1e8, 2)
    if equity is not None:
        out["股东权益(亿港元)"] = safe_round(equity / 1e8, 2)
    if cash is not None:
        out["现金及等价物(亿港元)"] = safe_round(cash / 1e8, 2)

    if total_assets and total_liab:
        out["资产负债率(%)"] = safe_round(total_liab / total_assets * 100, 2)

    return out


def _hk_extract_cashflow(period_df) -> dict:
    """从港股现金流量表（长表）提取关键指标"""
    out = {}

    operating = _hk_pick_amount(period_df, [
        "经营活动产生的现金流量净额",
        "经营活动所得现金流量净额",
        "经营业务所得现金净额",
        "经营活动现金流",
    ])
    investing = _hk_pick_amount(period_df, [
        "投资活动产生的现金流量净额",
        "投资活动所得现金流量净额",
        "投资活动现金流",
    ])
    financing = _hk_pick_amount(period_df, [
        "筹资活动产生的现金流量净额",
        "融资活动所得现金流量净额",
        "融资活动现金流",
    ])

    if operating is not None:
        out["经营现金流(亿港元)"] = safe_round(operating / 1e8, 2)
    if investing is not None:
        out["投资现金流(亿港元)"] = safe_round(investing / 1e8, 2)
    if financing is not None:
        out["筹资现金流(亿港元)"] = safe_round(financing / 1e8, 2)

    return out
