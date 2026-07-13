"""
core/portfolio.py — 投资组合诊断
对用户的持仓做加权风险评估 + 行业 / 区域集中度分析

设计原则：
- 只诊断已有持仓的问题
- NEVER 推荐买卖 — 这是合规红线
- 输出客观的风险信号 + 集中度警告
"""

from typing import Optional
import yfinance as yf

from .data import detect_market, normalize_ticker
from .risk import assess_company_risk
from .utils import retry, safe_round


def diagnose_portfolio(holdings: list[dict]) -> dict:
    """
    holdings = [
        {"ticker": "AAPL", "weight": 0.30},
        {"ticker": "MSFT", "weight": 0.25},
        {"ticker": "600519", "weight": 0.25},
    ]
    
    返回：
    {
        "weighted_risk_score": 58,
        "weighted_risk_level": "medium",
        "summary": "...",
        "sector_concentration": [
            {"sector": "Technology", "weight": 0.75, "warning": "Over-concentrated"}
        ],
        "geo_distribution": [
            {"market": "US", "weight": 0.75},
            {"market": "CN", "weight": 0.25}
        ],
        "individual_signals": [
            {"ticker": "TSLA", "type": "warning", "message": "..."},
            {"ticker": "AAPL", "type": "ok", "message": "..."}
        ],
        "holdings_detail": [
            {
                "ticker": "AAPL", "name": "Apple Inc.", "weight": 0.30,
                "risk_score": 35, "risk_level": "low", "sector": "Technology"
            }, ...
        ]
    }
    """
    result = {
        "weighted_risk_score": None,
        "weighted_risk_level": None,
        "summary": "",
        "sector_concentration": [],
        "geo_distribution": [],
        "individual_signals": [],
        "holdings_detail": [],
        "errors": [],
    }

    if not holdings:
        result["summary"] = "No holdings provided"
        return result

    # 校验权重
    total_weight = sum(h.get("weight", 0) for h in holdings)
    if total_weight <= 0:
        result["summary"] = "Total weight must be > 0"
        return result

    # 归一化（万一权重不到 100%）
    holdings = [
        {"ticker": h["ticker"], "weight": h["weight"] / total_weight}
        for h in holdings
    ]

    # ── 拉每只股票的数据 ──
    enriched_holdings = []
    sector_weights: dict[str, float] = {}
    geo_weights: dict[str, float] = {"us": 0.0, "cn": 0.0}
    weighted_risk = 0.0
    valid_weight = 0.0

    for h in holdings:
        ticker = h["ticker"]
        weight = h["weight"]
        market = detect_market(ticker)
        norm_ticker = normalize_ticker(ticker, market)

        # 拿基础信息（行业 + 名称）
        info = _get_basic_info(norm_ticker, market)

        # 风险评估
        try:
            risk = assess_company_risk(norm_ticker, market, "2024")
            risk_score = risk.get("overall_score")
            risk_level = risk.get("risk_level")
        except Exception as e:
            result["errors"].append(f"{ticker}: {e}")
            risk_score = None
            risk_level = None
            risk = {"red_flags": [], "cash_quality": None}

        sector = info.get("sector") or "Unknown"

        enriched_holdings.append({
            "ticker": ticker,
            "name": info.get("name", ticker),
            "weight": safe_round(weight, 4),
            "weight_pct": safe_round(weight * 100, 2),
            "market": market,
            "sector": sector,
            "risk_score": risk_score,
            "risk_level": risk_level,
        })

        # 累计加权风险
        if risk_score is not None:
            weighted_risk += risk_score * weight
            valid_weight += weight

        # 累计行业 / 区域权重
        sector_weights[sector] = sector_weights.get(sector, 0.0) + weight
        geo_weights[market] = geo_weights.get(market, 0.0) + weight

        # ── 个股信号 ──
        # 用风险评估里的 high-severity flags 当个股警告
        for flag in risk.get("red_flags", []):
            if flag.get("severity") == "high":
                result["individual_signals"].append({
                    "ticker": ticker,
                    "type": "warning",
                    "title": flag.get("title", ""),
                    "message": flag.get("description", ""),
                    "category": flag.get("category", ""),
                })

        # 现金流优秀的股票给个 ok 信号
        cq = risk.get("cash_quality") or {}
        if cq.get("risk_level") == "low" and cq.get("ratio") and cq["ratio"] > 1.2:
            result["individual_signals"].append({
                "ticker": ticker,
                "type": "ok",
                "title": "Strong cash flow quality",
                "message": f"OCF/NI ratio = {cq['ratio']}x — earnings backed by cash",
                "category": "Earnings Quality",
            })

    result["holdings_detail"] = enriched_holdings

    # ── 加权风险评分 ──
    if valid_weight > 0:
        weighted_score = weighted_risk / valid_weight
        result["weighted_risk_score"] = int(weighted_score)
        result["weighted_risk_level"] = (
            "high" if weighted_score >= 81
            else "medium_high" if weighted_score >= 61
            else "medium" if weighted_score >= 41
            else "medium_low" if weighted_score >= 21
            else "low"
        )

    # ── 行业集中度 ──
    sector_list = [
        {"sector": s, "weight": safe_round(w, 4), "weight_pct": safe_round(w * 100, 1)}
        for s, w in sorted(sector_weights.items(), key=lambda x: -x[1])
    ]
    # 警告：单一行业 > 50%
    for s in sector_list:
        if s["weight"] > 0.5:
            s["warning"] = "Over-concentrated"
        elif s["weight"] > 0.4:
            s["warning"] = "High concentration"
    result["sector_concentration"] = sector_list

    # ── 区域分布 ──
    result["geo_distribution"] = [
        {"market": m.upper(), "weight": safe_round(w, 4), "weight_pct": safe_round(w * 100, 1)}
        for m, w in geo_weights.items() if w > 0
    ]

    # ── 总结 ──
    result["summary"] = _generate_portfolio_summary(result)

    return result


def _get_basic_info(ticker: str, market: str) -> dict:
    """拿公司名称 + 行业（轻量版，避免拖慢主流程）"""
    if market == "us":
        try:
            stock = yf.Ticker(ticker)
            info = retry(lambda: stock.info, retries=1) or {}
            return {
                "name": info.get("longName") or info.get("shortName") or ticker,
                "sector": info.get("sector") or "Unknown",
            }
        except Exception:
            return {"name": ticker, "sector": "Unknown"}
    else:
        # A 股暂用代码作为名称（避免每次都查询拖慢速度）
        try:
            import akshare as ak
            df = retry(lambda: ak.stock_info_a_code_name(), retries=1)
            if df is not None and not df.empty:
                matched = df[df["code"] == ticker]
                if not matched.empty:
                    return {
                        "name": matched.iloc[0]["name"],
                        "sector": "A-Share",  # A 股行业分类另算，这里简化
                    }
        except Exception:
            pass
        return {"name": ticker, "sector": "A-Share"}


def _generate_portfolio_summary(result: dict) -> str:
    """生成一句话总结（不构成投资建议）"""
    score = result.get("weighted_risk_score")
    level = result.get("weighted_risk_level")
    n_warnings = sum(1 for s in result["individual_signals"] if s["type"] == "warning")
    over_concentrated = any(
        s.get("warning") == "Over-concentrated" for s in result["sector_concentration"]
    )

    parts = []
    if score is not None:
        if level == "high":
            parts.append(f"⚠️ Portfolio risk is HIGH ({score}/100)")
        elif level == "medium_high":
            parts.append(f"⚠️ Portfolio risk is MEDIUM-HIGH ({score}/100)")
        elif level == "medium":
            parts.append(f"⚡ Portfolio risk is MEDIUM ({score}/100)")
        elif level == "medium_low":
            parts.append(f"✅ Portfolio risk is MEDIUM-LOW ({score}/100)")
        else:
            parts.append(f"✅ Portfolio risk is LOW ({score}/100)")

    if over_concentrated:
        parts.append("over-concentrated in one sector")

    if n_warnings > 0:
        parts.append(f"{n_warnings} individual stock warning(s)")

    parts.append("This is a diagnostic, not investment advice.")
    return ". ".join(parts) + "."
