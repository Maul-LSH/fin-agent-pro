"""
core/holdings.py — ETF 前 N 大持仓查询
点击板块 → 显示该 ETF 的前 5 大成分股，用户可以从中选感兴趣的公司
"""

import yfinance as yf
from .utils import retry, safe_round


# ─────────────────────────────────────────
# 美股 ETF 前 N 大持仓（点击板块时调用）
# ─────────────────────────────────────────
def get_etf_top_holdings(etf_ticker: str, top_n: int = 5) -> list:
    """
    获取 ETF 前 N 大成分股
    返回：[{"ticker": "AAPL", "name": "Apple Inc.", "weight": 8.5, "price": 220.5, "change_pct": 1.2}, ...]
    """
    holdings = []

    try:
        etf = yf.Ticker(etf_ticker)
        # yfinance 提供 funds_data.top_holdings
        funds_data = retry(lambda: etf.funds_data, retries=2)
        if funds_data is None:
            return holdings

        top_df = retry(lambda: funds_data.top_holdings, retries=2)
        if top_df is None or top_df.empty:
            return holdings

        # 取前 N
        top_df = top_df.head(top_n)

        for ticker, row in top_df.iterrows():
            name = row.get("Name", ticker) if hasattr(row, "get") else ticker
            weight = row.get("Holding Percent") if hasattr(row, "get") else None

            # 拿这个成分股的实时价格
            price = None
            change_pct = None
            try:
                stock = yf.Ticker(ticker)
                hist = retry(lambda: stock.history(period="2d"), retries=1)
                if hist is not None and not hist.empty and len(hist) >= 2:
                    latest = hist["Close"].iloc[-1]
                    prev = hist["Close"].iloc[-2]
                    price = safe_round(latest)
                    change_pct = safe_round((latest - prev) / prev * 100, 2)
                elif hist is not None and not hist.empty:
                    price = safe_round(hist["Close"].iloc[-1])
            except Exception:
                pass

            holdings.append({
                "ticker": ticker,
                "name": str(name),
                "weight": safe_round(float(weight) * 100 if weight else 0, 2),
                "price": price,
                "change_pct": change_pct,
            })
    except Exception:
        pass

    return holdings
