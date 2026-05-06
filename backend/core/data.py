"""
core/data.py — 财务数据获取层
统一接口：get_company_info / get_financial_data
内部根据市场分流到 yfinance（美股）或 AkShare（A 股）
"""

import yfinance as yf
import akshare as ak

from .utils import (
    retry,
    safe_round,
    to_billion,
    to_yi,
    find_year_column,
    detect_market,
    normalize_ticker,
)


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
    return _us_company_info(norm) if market == "us" else _cn_company_info(norm)


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
    """根据 ticker 自动判断市场，拉取对应财务数据"""
    market = detect_market(ticker)
    norm = normalize_ticker(ticker, market)
    return _us_financial_data(norm, period) if market == "us" else _cn_financial_data(norm, period)


def _us_financial_data(ticker: str, period: str) -> dict:
    """美股财务数据（yfinance）"""
    result = {"market": "us", "ticker": ticker, "period": period}

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
            col = find_year_column(income.columns, period)
            if col is not None:
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
            col = find_year_column(balance.columns, period)
            if col is not None:
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
            col = find_year_column(cashflow.columns, period)
            if col is not None:
                row = cashflow[col]
                result["cashflow"] = {
                    "Operating Cash Flow (B)": to_billion(row.get("Operating Cash Flow")),
                    "Capital Expenditure (B)": to_billion(row.get("Capital Expenditure")),
                    "Free Cash Flow (B)": to_billion(row.get("Free Cash Flow")),
                }

        # ROE
        if income is not None and balance is not None:
            try:
                col = find_year_column(income.columns, period)
                ni = income[col].get("Net Income") if col is not None else None
                eq = balance[col].get("Stockholders Equity") if col is not None else None
                if ni and eq and eq > 0:
                    result.setdefault("indicators", {})["ROE (%)"] = safe_round(ni / eq * 100, 2)
            except Exception:
                pass

    except Exception as e:
        result["error"] = str(e)

    return result


def _cn_financial_data(ticker: str, period: str) -> dict:
    """A 股财务数据（AkShare）"""
    result = {"market": "cn", "ticker": ticker, "period": period}

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

    return result
