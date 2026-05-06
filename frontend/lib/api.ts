/**
 * API Client
 * 封装所有对 FastAPI 后端的调用
 */

import axios from "axios";

// 后端地址：本地开发用 localhost:8000，部署后改成你的 Render URL
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // 90 秒：AI 分析 + A 股数据拉取可能较慢
});

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
export interface MarketIndex {
  label: string;
  ticker: string;
  price: number | null;
  change_pct: number | null;
}

export interface Sector {
  label: string;
  ticker?: string;
  code?: string;
  price: number | null;
  change_pct: number | null;
  main_inflow_yi?: number | null;
}

export interface AttentionSector {
  label: string;
  ticker?: string;
  code?: string;
  price: number | null;
  change_pct: number | null;
  attention_score: number | null;
  volatility_score: number | null;
  quadrant: "hot" | "volatile" | "popular" | "quiet" | null;
  main_inflow_yi?: number | null;
}

export interface Holding {
  ticker: string;
  name: string;
  weight: number;
  price: number | null;
  change_pct: number | null;
}

export interface RiskAssessment {
  overall_score: number | null;
  risk_level: "low" | "medium" | "high" | null;
  summary: string;
  altman_z?: { score: number; interpretation: string; risk_level: string } | null;
  beneish_m?: { score: number; interpretation: string; risk_level: string } | null;
  cash_quality?: {
    ratio: number | null;
    interpretation: string;
    risk_level: string;
  } | null;
  receivables?: {
    revenue_growth: number;
    ar_growth: number;
    diff: number;
    interpretation: string;
    risk_level: string;
  } | null;
  dimension_scores: {
    profitability?: number;
    solvency?: number;
    cash_flow?: number;
    revenue_quality?: number;
    valuation?: number;
  };
  red_flags: Array<{
    category: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    metric?: string | number;
  }>;
}

export interface AnalyzeResponse {
  status: "ok" | "no_company";
  message?: string;
  intent?: {
    company_name: string;
    ticker: string;
    market: string;
    analysis_types: string[];
    period: string;
  };
  company?: { ticker: string; name: string; market: string };
  financial_data?: Record<string, unknown>;
  risk?: RiskAssessment;
  analysis?: string;
}

// ─────────────────────────────────────────
// API Methods
// ─────────────────────────────────────────
export const apiClient = {
  // 大盘指数
  getMarkets: async (market: "us" | "cn"): Promise<MarketIndex[]> => {
    const { data } = await api.get(`/api/markets/${market}`);
    return data.data;
  },

  // 板块涨跌列表
  getSectors: async (market: "us" | "cn", category: string): Promise<Sector[]> => {
    const { data } = await api.get(`/api/sectors/${market}/${category}`);
    return data.data;
  },

  // 板块关注度评分（用于象限图）
  getAttention: async (
    market: "us" | "cn",
    category: string = "industry"
  ): Promise<AttentionSector[]> => {
    const { data } = await api.get(
      `/api/attention/${market}?category=${category}`
    );
    return data.data;
  },

  // 板块历史价格
  getSectorHistory: async (
    market: "us" | "cn",
    identifier: string,
    days: number = 90
  ): Promise<[string, number][]> => {
    const { data } = await api.get(
      `/api/sector/history?market=${market}&identifier=${encodeURIComponent(
        identifier
      )}&days=${days}`
    );
    return data.data;
  },

  // ETF 前 N 大持仓
  getHoldings: async (etfTicker: string, topN: number = 5): Promise<Holding[]> => {
    const { data } = await api.get(
      `/api/sector/holdings?etf_ticker=${etfTicker}&top_n=${topN}`
    );
    return data.data;
  },

  // AI 分析
  analyze: async (params: {
    user_input: string;
    llm_api_key: string;
    provider: string;
    lang: string;
  }): Promise<AnalyzeResponse> => {
    const { data } = await api.post("/api/analyze", params);
    return data;
  },
};
