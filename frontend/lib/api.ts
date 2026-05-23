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
export type MarketKey = "us" | "cn" | "hk";

const marketOverviewCache = new Map<MarketKey, Promise<MarketIndex[]>>();
const sectorCache = new Map<string, Promise<Sector[]>>();
const attentionCache = new Map<string, Promise<AttentionSector[]>>();

function memoize<K, T>(cache: Map<K, Promise<T>>, key: K, loader: () => Promise<T>) {
  const existing = cache.get(key);
  if (existing) return existing;

  const request = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}

// API Methods
// ─────────────────────────────────────────
export const apiClient = {
  // 大盘指数
  getMarkets: async (market: MarketKey): Promise<MarketIndex[]> => {
    return memoize(marketOverviewCache, market, async () => {
      const { data } = await api.get(`/api/markets/${market}`);
      return data.data;
    });
  },

  // 板块涨跌列表
  getSectors: async (market: MarketKey, category: string): Promise<Sector[]> => {
    return memoize(sectorCache, `${market}:${category}`, async () => {
      const { data } = await api.get(`/api/sectors/${market}/${category}`);
      return data.data;
    });
  },

  // 板块关注度评分（用于象限图）
  getAttention: async (
    market: MarketKey,
    category: string = "industry"
  ): Promise<AttentionSector[]> => {
    return memoize(attentionCache, `${market}:${category}`, async () => {
      const { data } = await api.get(
        `/api/attention/${market}?category=${category}`
      );
      return data.data;
    });
  },

  // 首屏进入后预热「第一层」市场数据。
  // CN: 大盘 + 行业 + 热度；HK: 大盘（港股当前无行业热度图）
  preloadPrimaryMarketData: async (market: MarketKey): Promise<void> => {
    if (market === "cn") {
      await Promise.allSettled([
        apiClient.getMarkets("cn"),
        apiClient.getSectors("cn", "industry"),
        apiClient.getAttention("cn", "industry"),
      ]);
      return;
    }

    if (market === "hk") {
      await Promise.allSettled([apiClient.getMarkets("hk")]);
    }
  },

  // 板块历史价格
  getSectorHistory: async (
    market: MarketKey,
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

  // 大盘指数历史价格
  getMarketHistory: async (
    market: MarketKey,
    identifier: string,
    days: number = 90
  ): Promise<[string, number][]> => {
    const { data } = await api.get(
      `/api/market/history?market=${market}&identifier=${encodeURIComponent(
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
    analysis_mode?: "company" | "sector";
  }): Promise<AnalyzeResponse> => {
    const { data } = await api.post("/api/analyze", params);
    return data;
  },

  // 多公司对比
  compare: async (params: {
    tickers: string[];
    period?: string;
  }): Promise<CompareResponse> => {
    const { data } = await api.post("/api/compare", params);
    return data;
  },

  // DCF 估值
  dcf: async (params: DCFRequest): Promise<DCFResult> => {
    const { data } = await api.post("/api/dcf", params);
    return data;
  },

  // DCF 建议假设
  dcfAssumptions: async (ticker: string): Promise<DCFAssumptions> => {
    const { data } = await api.post("/api/dcf/assumptions", { ticker });
    return data;
  },

  // 敏感性分析
  dcfSensitivity: async (params: DCFRequest): Promise<SensitivityResult> => {
    const { data } = await api.post("/api/dcf/sensitivity", params);
    return data;
  },

  // 投资组合诊断
  diagnosePortfolio: async (
    holdings: { ticker: string; weight: number }[]
  ): Promise<PortfolioDiagnosis> => {
    const { data } = await api.post("/api/portfolio/diagnose", { holdings });
    return data;
  },
};

// ─────────────────────────────────────────
// Portfolio types
// ─────────────────────────────────────────
export interface PortfolioHolding {
  ticker: string;
  weight: number; // 0-1
  // 用户输入的可选字段（前端用，不传后端）
  name?: string;
  amount?: number; // 仓位金额（仅前端展示用）
}

export interface PortfolioDiagnosis {
  weighted_risk_score: number | null;
  weighted_risk_level: "low" | "medium" | "high" | null;
  summary: string;
  sector_concentration: {
    sector: string;
    weight: number;
    weight_pct: number;
    warning?: string;
  }[];
  geo_distribution: {
    market: string;
    weight: number;
    weight_pct: number;
  }[];
  individual_signals: {
    ticker: string;
    type: "warning" | "ok";
    title: string;
    message: string;
    category: string;
  }[];
  holdings_detail: {
    ticker: string;
    name: string;
    weight: number;
    weight_pct: number;
    market: string;
    sector: string;
    risk_score: number | null;
    risk_level: "low" | "medium" | "high" | null;
  }[];
  errors: string[];
}

// ─────────────────────────────────────────
// Compare types
// ─────────────────────────────────────────
export interface CompanySnapshot {
  company: { ticker: string; name: string; market: string };
  financial: Record<string, unknown>;
  risk: RiskAssessment;
}

export interface CompareResponse {
  period: string;
  companies: CompanySnapshot[];
}

// ─────────────────────────────────────────
// DCF types
// ─────────────────────────────────────────
export interface DCFRequest {
  ticker: string;
  discount_rate: number;
  growth_rate: number;
  terminal_growth?: number;
  forecast_years?: number;
}

export interface DCFResult {
  ticker: string;
  current_fcf: number | null;
  fcf_history: { year: string; fcf: number; ocf: number | null; capex: number | null }[];
  current_price: number | null;
  shares_outstanding: number | null;
  intrinsic_value_per_share: number | null;
  upside_pct: number | null;
  projection: { year: number; stage: number; growth_rate: number; fcf: number; pv: number }[];
  terminal_value: number | null;
  terminal_value_pv: number | null;
  enterprise_value: number | null;
  equity_value: number | null;
  cash: number | null;
  debt: number | null;
  net_debt: number | null;
  terminal_value_pct: number | null;
  implied_growth_rate: number | null;
  valuation_context: ValuationContext | null;
  wacc_breakdown: WaccBreakdown | null;
  warning: string | null;
  assumptions: {
    discount_rate: number;
    growth_rate: number;
    terminal_growth: number;
    forecast_years: number;
    stage1_years: number;
  };
  error: string | null;
}

export interface ValuationContext {
  forward_pe: number | null;
  peg_ratio: number | null;
  ev_to_sales: number | null;
  ev_to_revenue_growth: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  margin_trend: {
    gross_margin: { year: string; value: number | null }[];
    operating_margin: { year: string; value: number | null }[];
  };
  implied_growth_rate: number | null;
  analyst_target?: {
    mean_price: number | null;
    median_price: number | null;
    low_price: number | null;
    high_price: number | null;
    recommendation: string | null;
    opinion_count: number | null;
    entries: {
      date: string | null;
      firm: string | null;
      to_grade: string | null;
      from_grade: string | null;
      action: string | null;
    }[];
  };
  is_high_growth: boolean;
  dcf_stability: "unstable" | "moderate";
}

export interface WaccBreakdown {
  discount_rate: number;
  raw_wacc: number;
  risk_free_rate: number;
  risk_free_source: string;
  raw_beta?: number;
  beta: number;
  beta_adjustment?: string;
  equity_risk_premium: number;
  cost_of_equity: number;
  debt_spread: number;
  pre_tax_cost_of_debt: number;
  tax_rate: number;
  after_tax_cost_of_debt: number;
  equity_weight: number;
  debt_weight: number;
  sector?: string;
  industry?: string;
}

export interface DCFAssumptions {
  ticker: string;
  supported: boolean;
  market: "us" | "cn" | "hk";
  discount_rate: number;
  growth_rate: number;
  terminal_growth: number;
  wacc_breakdown: WaccBreakdown | null;
  warning: string | null;
  error: string | null;
}

export interface SensitivityResult {
  ticker: string;
  scenarios: {
    [key: string]: {
      label: string;
      discount_rate: number;
      growth_rate: number;
      intrinsic_value: number | null;
      upside_pct: number | null;
      current_price: number | null;
      error: string | null;
    };
  };
}
