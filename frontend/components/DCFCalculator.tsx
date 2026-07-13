/**
 * Model Builder - DCF 估值计算器 + 敏感性分析
 * 用户输入折现率、增长率、终值增长率，计算每股内在价值
 * 三档场景对比（保守 / 中性 / 激进）
 */

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Loader2,
  TrendingUp,
  TrendingDown,
  Search,
  Info,
  Sparkles,
  AlertTriangle,
  X,
  ArrowLeft,
  Workflow,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ReactNode } from "react";
import {
  apiClient,
  type DCFAssumptions,
  type DCFResult,
  type DriverAssumptions,
  type DriverValuationResult,
  type MarketImpliedAssumption,
  type SensitivityResult,
  type SymbolCandidate,
  type SymbolResolveResult,
  type ValuationFramework,
  type ValuationContext,
  type WaccBreakdown,
} from "@/lib/api";
import { useApp, useT } from "@/lib/AppContext";
import { ExportPDFButton } from "./ExportPDFButton";

const DCF_STORAGE_KEY = "fin-agent-dcf-state";
const DCF_CHANGE_EVENT = "fin-agent-dcf-state-change";
let cachedDcfRaw: string | null = null;
let cachedDcfValue: Partial<DCFStoredState> | null = null;

interface DCFStoredState {
  ticker: string;
  discountRate: number;
  growthRate: number;
  terminalGrowth: number;
  result: DCFResult | null;
  sensitivity: SensitivityResult | null;
}

function loadDCFStoredState(): Partial<DCFStoredState> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(DCF_STORAGE_KEY);
    if (saved === cachedDcfRaw) return cachedDcfValue;
    cachedDcfRaw = saved;
    cachedDcfValue = saved ? (JSON.parse(saved) as Partial<DCFStoredState>) : null;
    return cachedDcfValue;
  } catch {
    return null;
  }
}

function subscribeToDcfState(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DCF_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DCF_CHANGE_EVENT, onStoreChange);
  };
}

function translateDcfWarning(warning: string, t: ReturnType<typeof useT>) {
  if (warning.includes("Banks and financial companies")) return t("dcfBankWarning");
  if (warning.includes("REITs")) return t("dcfReitWarning");
  return warning;
}

const LOCAL_SYMBOL_ALIASES: Record<string, { symbol: string; name: string }> = {
  tesla: { symbol: "TSLA", name: "Tesla, Inc." },
  特斯拉: { symbol: "TSLA", name: "Tesla, Inc." },
  apple: { symbol: "AAPL", name: "Apple Inc." },
  苹果: { symbol: "AAPL", name: "Apple Inc." },
  microsoft: { symbol: "MSFT", name: "Microsoft Corporation" },
  微软: { symbol: "MSFT", name: "Microsoft Corporation" },
  nvidia: { symbol: "NVDA", name: "NVIDIA Corporation" },
  英伟达: { symbol: "NVDA", name: "NVIDIA Corporation" },
  amazon: { symbol: "AMZN", name: "Amazon.com, Inc." },
  亚马逊: { symbol: "AMZN", name: "Amazon.com, Inc." },
  google: { symbol: "GOOGL", name: "Alphabet Inc." },
  alphabet: { symbol: "GOOGL", name: "Alphabet Inc." },
  谷歌: { symbol: "GOOGL", name: "Alphabet Inc." },
  meta: { symbol: "META", name: "Meta Platforms, Inc." },
  "摩根大通": { symbol: "JPM", name: "JPMorgan Chase & Co." },
  "摩根": { symbol: "JPM", name: "JPMorgan Chase & Co." },
  jpmorgan: { symbol: "JPM", name: "JPMorgan Chase & Co." },
  "jp morgan": { symbol: "JPM", name: "JPMorgan Chase & Co." },
  "jpmorgan chase": { symbol: "JPM", name: "JPMorgan Chase & Co." },
  morgan: { symbol: "MS", name: "Morgan Stanley" },
  "morgan stanley": { symbol: "MS", name: "Morgan Stanley" },
  "摩根士丹利": { symbol: "MS", name: "Morgan Stanley" },
};

function localSymbolCandidate(query: string): SymbolCandidate | null {
  const key = query.trim().toLowerCase().replace(/[.,]/g, "");
  const match = LOCAL_SYMBOL_ALIASES[key];
  if (!match) return null;
  return {
    symbol: match.symbol,
    name: match.name,
    exchange: null,
    market: "us",
    source: "local",
    confidence: 0.95,
  };
}

function isTickerLikeInput(query: string) {
  return /^[A-Za-z]{1,5}([.-][A-Za-z])?$/.test(query.trim());
}

const ZH_TEXT: Record<string, string> = {
  "Stable FCF compounder": "稳定现金流复利型公司",
  "Software / cloud platform": "软件 / 云平台公司",
  "AI semiconductor cycle": "AI 半导体周期型公司",
  "Growth optionality company": "高增长期权型公司",
  "Bank / financial institution": "银行 / 金融机构",
  "REIT / real asset company": "REIT / 实物资产公司",
  "Pharma / biotech pipeline": "制药 / 生物科技管线公司",
  "Energy / commodity producer": "能源 / 大宗商品公司",
  "Mature operating company where normalized free cash flow, reinvestment, and terminal assumptions carry most of the valuation.": "成熟经营型公司，常态化自由现金流、再投资和终值假设通常决定大部分估值。",
  "Platform company where segment growth, recurring revenue, software mix, and margin expansion matter more than one top-line growth slider.": "平台型公司，分部增长、经常性收入、软件收入占比和利润率扩张比单一收入增速更重要。",
  "Cyclical growth company where demand cycles, supply constraints, gross margin normalization, and customer concentration dominate valuation.": "周期成长型公司，需求周期、供给约束、毛利率回归和客户集中度会主导估值。",
  "Company where the current FCF base is only one layer; software, autonomy, energy, or platform options can dominate the market price.": "当前自由现金流只是基础层；软件、自动驾驶、能源或平台期权可能主导市场定价。",
  "Financial company where classic FCF DCF is usually inappropriate; book value growth, ROTCE, credit losses, and capital returns drive value.": "金融公司通常不适合经典 FCF DCF；账面价值增长、ROTCE、信用损失和资本回报才是核心。",
  "REIT where AFFO, occupancy, cap rates, leverage, and NAV are more useful than classic FCF DCF.": "REIT 更适合看 AFFO、出租率、资本化率、杠杆和 NAV，而不是经典 FCF DCF。",
  "Healthcare company where existing products, patent cliffs, and probability-weighted pipeline assets should be valued separately.": "医疗公司应拆分现有产品、专利悬崖和概率加权的新药管线资产。",
  "Commodity-sensitive business where price decks, production, reserves, reinvestment, and balance sheet discipline drive value.": "大宗商品敏感型业务，价格假设、产量、储量、再投资和资产负债表纪律驱动价值。",
  "DCF": "DCF",
  "Relative multiples": "相对估值倍数",
  "Market-implied assumptions": "市场隐含假设",
  "Driver-based DCF": "驱动因子 DCF",
  "SOTP by segment": "分部加总估值",
  "Revenue / earnings multiples": "收入 / 盈利倍数",
  "Cycle-aware DCF": "周期调整 DCF",
  "Forward multiples": "前瞻倍数",
  "Bull/base/bear cycle scenarios": "牛 / 中 / 熊周期情景",
  "SOTP": "分部加总估值",
  "Probability-weighted DCF": "概率加权 DCF",
  "Real option analysis": "实物期权分析",
  "Residual income": "剩余收益模型",
  "P/TBV vs ROTCE": "P/TBV 与 ROTCE",
  "Dividend / capital return model": "股息 / 资本回报模型",
  "AFFO model": "AFFO 模型",
  "NAV / cap-rate model": "NAV / 资本化率模型",
  "P/AFFO and implied cap rate": "P/AFFO 与隐含资本化率",
  "Existing portfolio DCF": "现有产品组合 DCF",
  "Pipeline probability-weighted NPV": "管线概率加权 NPV",
  "Peer multiples": "同业倍数",
  "Commodity scenario DCF": "大宗商品情景 DCF",
  "Reserve / asset NAV": "储量 / 资产 NAV",
  "EV/EBITDA and FCF yield": "EV/EBITDA 与 FCF 收益率",
  "Revenue growth": "收入增长",
  "Operating margin": "营业利润率",
  "Reinvestment": "再投资",
  "Shareholder return": "股东回报",
  "Cloud / subscription growth": "云 / 订阅增长",
  "AI product adoption": "AI 产品采用率",
  "Software margin expansion": "软件利润率扩张",
  "Capital intensity": "资本强度",
  "Accelerator demand": "加速卡需求",
  "Gross margin normalization": "毛利率正常化",
  "Inventory and working capital": "库存与营运资本",
  "Cycle duration": "周期持续时间",
  "Core product volume": "核心产品销量",
  "Core gross margin": "核心毛利率",
  "Software / subscription": "软件 / 订阅",
  "New market option": "新市场期权",
  "Scaling investment": "规模化投资",
  "ROTCE": "ROTCE",
  "Credit cycle": "信用周期",
  "Tangible book value": "有形账面价值",
  "Capital return": "资本回报",
  "NOI growth": "NOI 增长",
  "Cap rate": "资本化率",
  "Leverage": "杠杆",
  "Existing products": "现有产品",
  "Pipeline assets": "管线资产",
  "R&D and SG&A intensity": "研发与销售管理费用强度",
  "Capital allocation": "资本配置",
  "Commodity price deck": "大宗商品价格假设",
  "Production": "产量",
  "Shareholder returns": "股东回报",
  "Tesla optionality SOTP": "Tesla 期权型分部估值",
  "Microsoft cloud and AI SOTP": "Microsoft 云与 AI 分部估值",
  "JPMorgan bank valuation": "JPMorgan 银行估值框架",
  "Prologis REIT NAV and AFFO": "Prologis REIT NAV 与 AFFO",
  "Auto core": "汽车核心业务",
  "Energy": "能源业务",
  "FSD subscription": "FSD 订阅",
  "Robotaxi": "Robotaxi",
  "Productivity and business processes": "生产力与业务流程",
  "Azure and cloud": "Azure 与云",
  "Gaming and devices": "游戏与设备",
  "Core banking": "核心银行业务",
  "Operating portfolio": "运营物业组合",
  "Real estate NAV": "房地产 NAV",
  "Development pipeline": "开发管线",
  "AI extracts and explains assumptions; the model calculates; the user decides which assumptions to trust.": "AI 负责提取和解释假设；模型负责计算；用户决定相信哪些假设。",
  "SEC filings + consensus": "SEC 财报 + 市场一致预期",
  "SEC filings + peer margins": "SEC 财报 + 同业利润率",
  "cash-flow statement": "现金流量表",
  "segment disclosures + consensus": "分部披露 + 市场一致预期",
  "management guidance + product metrics": "管理层指引 + 产品指标",
  "SEC filings + peers": "SEC 财报 + 同业数据",
  "cash-flow statement + guidance": "现金流量表 + 管理层指引",
  "segment disclosures + industry data": "分部披露 + 行业数据",
  "balance sheet + cash-flow statement": "资产负债表 + 现金流量表",
  "industry data + scenarios": "行业数据 + 情景假设",
  "SEC filings + industry data": "SEC 财报 + 行业数据",
  "management guidance + user assumptions": "管理层指引 + 用户假设",
  "assumption database + user selection": "假设数据库 + 用户选择",
  "bank filings + consensus": "银行财报 + 市场一致预期",
  "bank filings + macro scenarios": "银行财报 + 宏观情景",
  "balance sheet": "资产负债表",
  "regulatory filings + guidance": "监管披露 + 管理层指引",
  "supplemental filings": "补充披露文件",
  "industry transactions": "行业交易数据",
  "balance sheet + debt schedule": "资产负债表 + 债务明细",
  "REIT filings": "REIT 财报",
  "SEC filings + product disclosures": "SEC 财报 + 产品披露",
  "clinical pipeline + assumptions": "临床管线 + 假设",
  "income statement": "利润表",
  "market data + scenarios": "市场数据 + 情景假设",
  "operating disclosures": "经营披露",
  "Driver DCF": "驱动因子 DCF",
  "Segment DCF": "分部 DCF",
  "Probability-weighted software DCF": "概率加权软件 DCF",
  "Probability-weighted software EBIT": "概率加权软件 EBIT",
  "Real option / probability DCF": "实物期权 / 概率 DCF",
  "Discounted probability option": "折现概率期权",
  "FCF multiple": "FCF 倍数",
  "EBIT multiple": "EBIT 倍数",
  "Relative / segment DCF": "相对估值 / 分部 DCF",
  "Scenario overlay": "情景叠加",
  "P/TBV cross-check": "P/TBV 交叉验证",
  "Probability-weighted NAV": "概率加权 NAV",
  "vehicle deliveries": "车辆交付量",
  "ASP": "平均售价 ASP",
  "auto gross margin": "汽车毛利率",
  "capex intensity": "资本开支强度",
  "storage deployments": "储能部署量",
  "revenue per GWh": "每 GWh 收入",
  "energy gross margin": "能源毛利率",
  "fleet size": "车队规模",
  "attach rate": "渗透率",
  "monthly ARPU": "月 ARPU",
  "software gross margin": "软件毛利率",
  "launch year": "推出年份",
  "TAM": "TAM 总市场空间",
  "market share": "市场份额",
  "take rate": "平台抽成率",
  "success probability": "成功概率",
  "seat growth": "席位增长",
  "ARPU": "ARPU",
  "Copilot attach rate": "Copilot 渗透率",
  "renewal rate": "续约率",
  "cloud revenue growth": "云收入增长",
  "AI workload mix": "AI 工作负载占比",
  "data-center capex": "数据中心资本开支",
  "cloud margin": "云业务利润率",
  "content growth": "内容增长",
  "subscription users": "订阅用户",
  "hardware cycle": "硬件周期",
  "tangible book value": "有形账面价值",
  "cost of equity": "股权成本",
  "retention ratio": "留存率",
  "charge-offs": "核销率",
  "provision rate": "拨备率",
  "reserve build": "准备金增加",
  "macro stress": "宏观压力",
  "CET1 ratio": "CET1 资本率",
  "buybacks": "回购",
  "dividends": "股息",
  "AOCI recovery": "AOCI 修复",
  "same-store NOI growth": "同店 NOI 增长",
  "occupancy": "出租率",
  "rent spreads": "租金价差",
  "AFFO payout": "AFFO 派息率",
  "NOI": "NOI",
  "market cap rate": "市场资本化率",
  "asset quality": "资产质量",
  "net debt": "净债务",
  "development yield": "开发收益率",
  "lease-up probability": "出租达成概率",
  "funding cost": "融资成本",
  "revenue": "收入",
  "EBIT": "EBIT",
  "FCF": "自由现金流",
  "ARR": "ARR 年经常性收入",
  "gross profit": "毛利",
  "option value": "期权价值",
  "probability-weighted value": "概率加权价值",
  "market-implied probability": "市场隐含概率",
  "operating income": "营业利润",
  "reinvestment": "再投资",
  "segment value": "分部价值",
  "margin contribution": "利润贡献",
  "residual income": "剩余收益",
  "equity value": "股权价值",
  "loss-adjusted earnings": "损失调整后盈利",
  "capital impact": "资本影响",
  "TBV growth": "有形账面价值增长",
  "shareholder yield": "股东收益率",
  "AFFO": "AFFO",
  "dividend capacity": "分红能力",
  "NAV": "NAV",
  "implied cap rate": "隐含资本化率",
  "incremental NAV": "增量 NAV",
  "AFFO contribution": "AFFO 贡献",
  "Let users choose FSD attach-rate and Robotaxi success-probability assumptions.": "让用户选择 FSD 渗透率和 Robotaxi 成功概率假设。",
  "Back-solve the Robotaxi probability or FSD attach rate required by the current market price.": "反推当前市场价所需要的 Robotaxi 概率或 FSD 渗透率。",
  "Separate AI ARPU uplift from baseline cloud growth.": "把 AI 带来的 ARPU 提升与基础云增长拆开。",
  "Back-solve the Copilot attach rate or Azure margin embedded in market price.": "反推市场价格中隐含的 Copilot 渗透率或 Azure 利润率。",
  "Use residual income as the primary model instead of FCF DCF.": "用剩余收益模型作为主模型，而不是 FCF DCF。",
  "Back-solve sustainable ROTCE required by the current P/TBV.": "反推当前 P/TBV 所需要的可持续 ROTCE。",
  "Use AFFO and NAV as primary methods rather than classic FCF DCF.": "以 AFFO 和 NAV 作为主方法，而不是经典 FCF DCF。",
  "Back-solve the implied cap rate embedded in the current share price.": "反推当前股价隐含的资本化率。",
  "What long-term growth rate is required to justify the current price?": "需要多高的长期增长率才能支撑当前价格？",
  "What steady-state operating margin is the market pricing in?": "市场正在定价怎样的稳定期营业利润率？",
  "How much AI ARPU uplift is needed to support today's multiple?": "需要多少 AI ARPU 提升才能支撑当前倍数？",
  "What cloud margin and growth path is the market assuming?": "市场假设了怎样的云业务利润率和增长路径？",
  "What peak revenue and duration are required to justify current value?": "需要多高的峰值收入和多长周期才能支撑当前价值？",
  "What normalized gross margin is embedded in today's price?": "当前价格隐含了怎样的常态化毛利率？",
  "What probability of the optionality case is required to justify the current price?": "需要多高的期权情景成功概率才能支撑当前价格？",
  "What subscription attach rate or market share is embedded in today's price?": "当前价格隐含了怎样的订阅渗透率或市场份额？",
  "Does the market price require a terminal growth rate that looks economically unrealistic?": "市场价格是否需要一个经济上不现实的终值增长率？",
  "What sustainable ROTCE is required to support the current P/TBV?": "需要多高的可持续 ROTCE 才能支撑当前 P/TBV？",
  "What credit-loss cycle is the market discounting?": "市场正在折现怎样的信用损失周期？",
  "What implied cap rate does the current price represent?": "当前价格对应怎样的隐含资本化率？",
  "What AFFO growth is required to justify the current multiple?": "需要多高的 AFFO 增长才能支撑当前倍数？",
  "What pipeline success probability is embedded in the current price?": "当前价格隐含了怎样的管线成功概率？",
  "How severe a patent-cliff decline is the market discounting?": "市场正在折现多严重的专利悬崖下滑？",
  "What long-term commodity price deck is implied by the current share price?": "当前股价隐含了怎样的长期大宗商品价格假设？",
  "What reinvestment and decline-rate assumptions are embedded?": "其中隐含了怎样的再投资和产量衰减假设？",
  "Required Stage 1 FCF growth": "所需第一阶段 FCF 增速",
  "Required terminal growth": "所需终值增长率",
  "Market premium vs this DCF": "市场相对本 DCF 的溢价",
  "Share-price gap": "股价差距",
  "Terminal value dependence": "终值依赖度",
  "Optionality premium to explain": "需要解释的期权溢价",
  "The annual FCF growth rate needed for this DCF structure to reach the current market price.": "在当前 DCF 结构下，为支撑市场价格所需要的年化 FCF 增速。",
  "The perpetual growth rate needed if near-term FCF growth stays at your current assumption.": "如果近期 FCF 增速维持当前假设，为支撑市场价格所需要的永续增长率。",
  "The extra equity value the market is assigning above this explicit DCF scenario.": "市场相对于这个明确 DCF 情景额外给予的股权价值。",
  "How far the current market price sits above or below the model's intrinsic value per share.": "当前市场价相对模型每股内在价值的偏离程度。",
  "The share of enterprise value coming from terminal value rather than explicit forecast years.": "企业价值中来自终值、而非明确预测期现金流的比例。",
  "For optionality companies, this is the value that must be justified by drivers such as subscription attach rate, TAM, market share, or success probability.": "对于期权型公司，这部分价值需要由订阅渗透率、TAM、市场份额或成功概率等 driver 来解释。",
};

function displayText(text: string, lang: "zh" | "en") {
  return lang === "zh" ? ZH_TEXT[text] ?? text : text;
}

async function resolveTickerInput(query: string): Promise<SymbolResolveResult> {
  const local = localSymbolCandidate(query);
  try {
    const resolved = await apiClient.resolveSymbol(query);
    if (resolved.resolved || resolved.candidates.length > 0 || !local) return resolved;
  } catch {
    // The resolver is an enhancement. If the running backend has not been
    // restarted yet, keep valuation usable with local aliases and raw tickers.
  }
  return {
    query,
    resolved: local,
    candidates: local ? [local] : [],
    error: null,
  };
}

export function DCFCalculator() {
  const t = useT();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const storedState = useSyncExternalStore(subscribeToDcfState, loadDCFStoredState, () => null);
  const [tickerOverride, setTickerOverride] = useState<string | undefined>();
  const [discountRateOverride, setDiscountRateOverride] = useState<number | undefined>();
  const [growthRateOverride, setGrowthRateOverride] = useState<number | undefined>();
  const [terminalGrowthOverride, setTerminalGrowthOverride] = useState<number | undefined>();
  const [resultOverride, setResultOverride] = useState<DCFResult | null | undefined>();
  const [sensitivityOverride, setSensitivityOverride] = useState<SensitivityResult | null | undefined>();

  const ticker = tickerOverride ?? storedState?.ticker ?? "AAPL";
  const discountRate = discountRateOverride ?? storedState?.discountRate ?? 10;
  const growthRate = growthRateOverride ?? storedState?.growthRate ?? 5;
  const terminalGrowth = terminalGrowthOverride ?? storedState?.terminalGrowth ?? 2.5;
  const result = resultOverride !== undefined ? resultOverride : storedState?.result ?? null;
  const sensitivity =
    sensitivityOverride !== undefined ? sensitivityOverride : storedState?.sensitivity ?? null;

  const [assumptions, setAssumptions] = useState<DCFAssumptions | null>(null);
  const [assumptionsLoading, setAssumptionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbolLookup, setSymbolLookup] = useState<SymbolResolveResult | null>(null);
  const [symbolLookupLoading, setSymbolLookupLoading] = useState(false);
  const [symbolNotice, setSymbolNotice] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [compactControls, setCompactControls] = useState(false);
  const skipNextAssumptionApplyRef = useRef(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const workspaceActive =
    inputFocused ||
    Boolean(result) ||
    loading ||
    Boolean(error) ||
    tickerOverride !== undefined ||
    discountRateOverride !== undefined ||
    growthRateOverride !== undefined ||
    terminalGrowthOverride !== undefined;

  useEffect(() => {
    if (!hydrated) return;
    const state: DCFStoredState = {
      ticker,
      discountRate,
      growthRate,
      terminalGrowth,
      result,
      sensitivity,
    };
    try {
      localStorage.setItem(DCF_STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new Event(DCF_CHANGE_EVENT));
    } catch {}
  }, [ticker, discountRate, growthRate, terminalGrowth, result, sensitivity, hydrated]);

  useEffect(() => {
    const rawTickerInput = ticker.trim();
    const localResolved = localSymbolCandidate(rawTickerInput)?.symbol;
    const normalizedTicker = (symbolLookup?.resolved?.symbol ?? localResolved ?? rawTickerInput)
      .trim()
      .toUpperCase();
    if (!normalizedTicker) return;
    if (!symbolLookup?.resolved?.symbol && !localResolved && !isTickerLikeInput(rawTickerInput)) {
      setAssumptions(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setAssumptionsLoading(true);
      try {
        const next = await apiClient.dcfAssumptions(normalizedTicker);
        setAssumptions(next);
        if (!next.error) {
          const restoredTicker = storedState?.ticker?.trim().toUpperCase();
          if (
            skipNextAssumptionApplyRef.current ||
            (!tickerOverride && restoredTicker === normalizedTicker)
          ) {
            skipNextAssumptionApplyRef.current = false;
          } else {
            setDiscountRateOverride(Number((next.discount_rate * 100).toFixed(1)));
            setGrowthRateOverride(Number((next.growth_rate * 100).toFixed(1)));
            setTerminalGrowthOverride(Number((next.terminal_growth * 100).toFixed(1)));
          }
        }
      } catch {
        setAssumptions(null);
      } finally {
        setAssumptionsLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [ticker, storedState?.ticker, tickerOverride, symbolLookup?.resolved?.symbol]);

  useEffect(() => {
    const query = ticker.trim();
    setSymbolLookup(null);
    if (query.length < 2) {
      setSymbolNotice(null);
      setSymbolLookupLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSymbolLookupLoading(true);
      try {
        const resolved = await resolveTickerInput(query);
        if (!cancelled) setSymbolLookup(resolved);
      } catch {
        if (!cancelled) setSymbolLookup(null);
      } finally {
        if (!cancelled) setSymbolLookupLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ticker]);

  const applySymbolCandidate = (candidate: SymbolCandidate) => {
    skipNextAssumptionApplyRef.current = false;
    setTickerOverride(candidate.symbol);
    setSymbolNotice(t("dcfSymbolSelected", { symbol: candidate.symbol, name: candidate.name }));
    setError(null);
  };

  const runDCF = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setResultOverride(null);
    setSensitivityOverride(null);

    try {
      const resolved = await resolveTickerInput(ticker);
      setSymbolLookup(resolved);
      let resolvedTicker = ticker.trim().toUpperCase();

      if (resolved.resolved) {
        resolvedTicker = resolved.resolved.symbol;
        if (resolvedTicker !== ticker.trim().toUpperCase()) {
          setTickerOverride(resolvedTicker);
          setSymbolNotice(
            t("dcfSymbolAutoResolved", {
              input: ticker.trim(),
              symbol: resolved.resolved.symbol,
              name: resolved.resolved.name,
            })
          );
        }
      } else if (resolved.candidates.length > 0) {
        setError(t("dcfSymbolNeedsChoice"));
        setLoading(false);
        return;
      }

      const params = {
        ticker: resolvedTicker,
        discount_rate: discountRate / 100,
        growth_rate: growthRate / 100,
        terminal_growth: terminalGrowth / 100,
        forecast_years: 10,
      };

      const [dcf, sens] = await Promise.all([
        apiClient.dcf(params),
        apiClient.dcfSensitivity(params),
      ]);

      if (dcf.error) {
        setError(dcf.error);
      } else {
        setResultOverride(dcf);
        setSensitivityOverride(sens);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "DCF calculation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onScroll = () => setCompactControls(workspaceActive && window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [workspaceActive]);

  const backToIntro = () => {
    setResultOverride(null);
    setSensitivityOverride(null);
    setError(null);
    setLoading(false);
    setInputFocused(false);
  };

  return (
    <section className="relative z-10">
      <motion.div
        animate={{
          opacity: workspaceActive ? 0.2 : 1,
          filter: workspaceActive ? "blur(8px)" : "blur(0px)",
        }}
        transition={{ duration: 0.35 }}
        className={workspaceActive ? "h-[320px] overflow-hidden" : ""}
      >
        <DCFIntro />
      </motion.div>

      <motion.div
        layout
        className={
          workspaceActive
            ? "sticky top-20 z-30 mx-auto -mt-72 max-w-5xl"
            : "relative z-20 mx-auto -mt-40 max-w-4xl"
        }
      >
    <div
      ref={controlsRef}
      onClick={(e) => e.stopPropagation()}
      className={`rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-xl shadow-slate-200/50 dark:shadow-black/30 backdrop-blur-2xl transition-colors ${
        compactControls ? "bg-white/45 dark:bg-slate-950/45" : "bg-white/85 dark:bg-slate-950/85"
      }`}
    >
      {workspaceActive && !compactControls && (
        <button
          type="button"
          onClick={backToIntro}
          className="mb-3 inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("analysisBackToIntro")}
        </button>
      )}

      {/* 输入区 */}
      <div className="space-y-4">
        <div>
          <label className={`${compactControls ? "sr-only" : "block"} text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5`}>
            {t("dcfTicker")}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={ticker}
              onFocus={() => setInputFocused(true)}
              onChange={(e) => {
                setTickerOverride(e.target.value);
                setSymbolNotice(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && runDCF()}
              placeholder={t("dcfTickerPlaceholder")}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none ${
                compactControls ? "bg-white/60 dark:bg-slate-950/55" : "bg-white dark:bg-slate-800"
              }`}
            />
          </div>
        </div>

        {!compactControls &&
          (symbolLookupLoading ||
            symbolNotice ||
            (symbolLookup?.candidates.length ?? 0) > 0 ||
            symbolLookup?.error) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 p-3 text-sm">
              {symbolLookupLoading && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("dcfSymbolSearching")}
                </div>
              )}
              {!symbolLookupLoading && symbolNotice && (
                <div className="text-emerald-700 dark:text-emerald-300">{symbolNotice}</div>
              )}
              {!symbolLookupLoading && !symbolNotice && symbolLookup?.candidates.length ? (
                <div className="space-y-2">
                  <div className="text-slate-500 dark:text-slate-400">{t("dcfSymbolMatches")}</div>
                  <div className="flex flex-wrap gap-2">
                    {symbolLookup.candidates.map((candidate) => (
                      <button
                        key={candidate.symbol}
                        type="button"
                        onClick={() => applySymbolCandidate(candidate)}
                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-700"
                      >
                        <span className="font-mono font-semibold text-slate-950 dark:text-white">
                          {candidate.symbol}
                        </span>
                        <span className="truncate">{candidate.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!symbolLookupLoading && !symbolNotice && symbolLookup?.error && (
                <div className="text-amber-700 dark:text-amber-300">{symbolLookup.error}</div>
              )}
            </div>
          )}

        {!compactControls && assumptions?.error && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-sm">
            {assumptions.error}
          </div>
        )}

        {!compactControls && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SliderInput
            label={t("dcfWacc")}
            value={discountRate}
            min={6}
            max={20}
            step={0.5}
            unit="%"
            hint={
              assumptionsLoading
                ? t("dcfWaccLoading")
                : assumptions?.wacc_breakdown
                  ? t("dcfWaccSuggested")
                  : t("dcfWaccHint")
            }
            tooltip={
              assumptions?.wacc_breakdown ? (
                <WaccTooltip breakdown={assumptions.wacc_breakdown} />
              ) : undefined
            }
            onChange={setDiscountRateOverride}
          />
          <SliderInput
            label={t("dcfGrowth")}
            value={growthRate}
            min={-5}
            max={50}
            step={0.5}
            unit="%"
            hint={t("dcfGrowthHint")}
            tooltip={
              <AssumptionTooltip
                title={t("dcfGrowthTooltipTitle")}
                body={t("dcfGrowthTooltipBody")}
                caution={t("dcfGrowthTooltipCaution")}
              />
            }
            onChange={setGrowthRateOverride}
          />
          <SliderInput
            label={t("dcfTerminal")}
            value={terminalGrowth}
            min={0}
            max={4}
            step={0.1}
            unit="%"
            hint={t("dcfTerminalHint")}
            tooltip={
              <AssumptionTooltip
                title={t("dcfTerminalTooltipTitle")}
                body={t("dcfTerminalTooltipBody")}
                caution={t("dcfTerminalTooltipCaution")}
              />
            }
            onChange={setTerminalGrowthOverride}
          />
        </div>}

        {!compactControls && assumptions?.wacc_breakdown &&
          (assumptions.wacc_breakdown.beta >= 1.4 || growthRate >= 25) && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-sm flex gap-2">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">{t("dcfGrowthProfile")}</span>{" "}
                {t("dcfGrowthProfileBody")}
              </span>
            </div>
          )}

        {!compactControls && assumptions?.warning && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm flex gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{translateDcfWarning(assumptions.warning, t)}</span>
          </div>
        )}

        {!compactControls && <button
          onClick={runDCF}
          disabled={loading || !ticker.trim() || Boolean(assumptions?.error)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Calculator className="w-5 h-5" />
          )}
          {loading ? t("dcfRunning") : t("dcfRun")}
        </button>}

        {!compactControls && error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
      </motion.div>

      {/* 结果区 */}
      <AnimatePresence>
        {result && result.intrinsic_value_per_share && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            id="valuation-report"
            className="mt-10 space-y-8"
          >
            <div className="flex justify-end">
              <ExportPDFButton
                targetId="valuation-report"
                filename={`valuation-${ticker.toUpperCase()}.pdf`}
                label={t("exportPdf")}
              />
            </div>
            {/* 主要结果卡片 */}
            <ValuationResultCard result={result} />

            {result.market_implied_assumptions?.length > 0 && (
              <MarketImpliedAssumptionsCard assumptions={result.market_implied_assumptions} />
            )}

            {result.warning && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm">
                {translateDcfWarning(result.warning, t)}
              </div>
            )}

            {result.framework && <ValuationFrameworkCard framework={result.framework} />}

            {result.framework?.driver_template && (
              <EditableDriverValuationCard result={result} />
            )}

            {result.valuation_context && (
              <ValuationContextCard
                context={result.valuation_context}
                intrinsicValue={result.intrinsic_value_per_share}
                currentPrice={result.current_price}
              />
            )}

            {/* 10 年 FCF 投影柱状图 */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-5">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-sm">
                {t("dcfFcfProjection")}
              </h4>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.projection}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      label={{
                        value: t("dcfYear"),
                        position: "bottom",
                        offset: -5,
                        style: { fontSize: 11, fill: "#94a3b8" },
                      }}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgb(15 23 42)",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="fcf" fill="#94a3b8" name={t("dcfFutureFcf")} />
                    <Bar dataKey="pv" fill="#3b82f6" name={t("dcfPresentValue")} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 敏感性三档场景 */}
            {sensitivity && <SensitivityScenarios data={sensitivity} />}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function DCFIntro() {
  const t = useT();
  const items = [
    { icon: Calculator, title: t("dcfIntroModelTitle"), body: t("dcfIntroModelBody") },
    { icon: Workflow, title: t("dcfIntroDriverTitle"), body: t("dcfIntroDriverBody") },
    { icon: BarChart3, title: t("dcfIntroMarketTitle"), body: t("dcfIntroMarketBody") },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-56">
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
        <Calculator className="h-4 w-4" />
        {t("dcfIntroEyebrow")}
      </div>
      <div className="mt-10">
        <div>
          <h1 className="max-w-4xl text-4xl md:text-6xl font-bold tracking-tight text-slate-950 dark:text-white">
            {t("dcfIntroTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            {t("dcfIntroBody")}
          </p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("dcfIntroExampleLabel")}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {t("dcfIntroFormulaBody")}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                [t("dcfIntroExampleStep1"), "Framework"],
                [t("dcfIntroExampleStep2"), "Drivers"],
                [t("dcfIntroExampleStep3"), "Implied"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-5 shadow-sm">
            <div className="font-bold text-slate-900 dark:text-slate-100">
              {t("dcfIntroTeslaTitle")}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                [t("dcfIntroTeslaAuto"), "Auto"],
                [t("dcfIntroTeslaEnergy"), "Energy"],
                [t("dcfIntroTeslaFsd"), "FSD"],
                [t("dcfIntroTeslaRobotaxi"), "Robotaxi"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                  <div className="mt-2 font-bold text-slate-900 dark:text-slate-100">{value}</div>
                </div>
              ))}
            </div>
            <div className="my-4 border-t border-slate-200 dark:border-slate-800" />
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-slate-500 dark:text-slate-400">{t("driverValuePerShare")}</div>
                <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">$312</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">{t("dcfMarketAnswer")}</div>
                <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">$395</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">{t("marketImpliedEyebrow")}</div>
                <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">FSD?</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {t("dcfIntroExampleBody")}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMultiple(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}x`;
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(2)}`;
}

function normalizeRecommendation(value: string | null) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ValuationContextCard({
  context,
  intrinsicValue,
  currentPrice,
}: {
  context: ValuationContext;
  intrinsicValue: number | null;
  currentPrice: number | null;
}) {
  const t = useT();
  const [analystDrawerOpen, setAnalystDrawerOpen] = useState(false);
  const analyst = context.analyst_target;
  const analystTarget =
    analyst?.median_price ?? analyst?.mean_price;
  const hasAnalystTarget = analystTarget !== null && analystTarget !== undefined;
  const impliedGrowth =
    context.implied_growth_rate === null
      ? "—"
      : `${(context.implied_growth_rate * 100).toFixed(1)}${
          context.implied_growth_rate >= 0.5995 ? "%+" : "%"
        }`;
  const metrics = [
    { label: t("dcfForwardPe"), value: formatMultiple(context.forward_pe) },
    { label: t("dcfPeg"), value: formatMultiple(context.peg_ratio) },
    { label: t("dcfEvSales"), value: formatMultiple(context.ev_to_sales) },
    { label: t("dcfEvRevenueGrowth"), value: formatMultiple(context.ev_to_revenue_growth) },
    { label: t("dcfRevenueGrowth"), value: formatPercent(context.revenue_growth) },
    { label: t("dcfEarningsGrowth"), value: formatPercent(context.earnings_growth) },
    { label: t("dcfGrossMargin"), value: formatPercent(context.gross_margin) },
    { label: t("dcfOperatingMargin"), value: formatPercent(context.operating_margin) },
    { label: t("dcfMarketImplied"), value: impliedGrowth },
    {
      label: t("dcfStability"),
      value: context.dcf_stability === "unstable" ? t("dcfUnstable") : t("dcfModerate"),
    },
  ];

  const trendPoints: { year: string; gross: number | null; operating: number | null }[] = [
    ...context.margin_trend.gross_margin.map((point) => ({
      year: point.year,
      gross: point.value,
      operating: null,
    })),
  ];
  context.margin_trend.operating_margin.forEach((point) => {
    const existing = trendPoints.find((item) => item.year === point.year);
    if (existing) {
      existing.operating = point.value;
    } else {
      trendPoints.push({ year: point.year, gross: null, operating: point.value });
    }
  });
  const sortedTrend = trendPoints.sort((a, b) => a.year.localeCompare(b.year));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      {hasAnalystTarget && (
        <div className="mb-5 rounded-2xl bg-slate-950 text-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h4 className="font-bold">{t("dcfThreeAnswersTitle")}</h4>
              <p className="mt-1 text-sm text-slate-300 max-w-3xl">
                {t("dcfDisagreementSignal")}
              </p>
            </div>
            {analyst?.opinion_count && (
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                {t("dcfAnalystCount", { n: analyst.opinion_count })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AnswerTile label={t("dcfOurDcfAnswer")} value={formatPrice(intrinsicValue)} />
            <AnswerTile label={t("dcfMarketAnswer")} value={formatPrice(currentPrice)} />
            <button
              type="button"
              onClick={() => setAnalystDrawerOpen(true)}
              className="rounded-xl bg-white/10 p-4 text-left hover:bg-white/15 transition-colors"
            >
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {t("dcfAnalystAnswer")}
              </div>
              <div className="mt-2 text-3xl font-bold tabular-nums">
                {formatPrice(analystTarget)}
              </div>
              <div className="mt-1 text-xs text-blue-200">
                {t("dcfViewAnalysts")}
              </div>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-xs text-slate-400">{t("dcfTargetRange")}</div>
              <div className="mt-1 font-semibold tabular-nums">
                {formatPrice(analyst?.low_price ?? null)} -{" "}
                {formatPrice(analyst?.high_price ?? null)}
              </div>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-xs text-slate-400">{t("dcfRecommendation")}</div>
              <div className="mt-1 font-semibold">
                {normalizeRecommendation(analyst?.recommendation ?? null)}
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-400">
            {t("dcfAnalystCaveat")}
          </p>
          <AnalystCoverageDrawer
            open={analystDrawerOpen}
            analyst={analyst}
            onClose={() => setAnalystDrawerOpen(false)}
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h4 className="font-bold text-slate-900 dark:text-slate-100">
            {t("dcfContextTitle")}
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
            {t("dcfContextSubtitle")}
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            context.dcf_stability === "unstable"
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
              : "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
          }`}
        >
          {context.dcf_stability === "unstable" ? t("dcfUnstable") : t("dcfModerate")}
        </div>
      </div>

      {context.is_high_growth && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t("dcfHighGrowthWarning")}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {metric.label}
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {sortedTrend.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("dcfMarginTrend")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedTrend.map((point) => (
              <div
                key={point.year}
                className="rounded-xl border border-slate-100 dark:border-slate-800 p-3 text-sm"
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {point.year}
                </div>
                <div className="mt-2 flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>{t("dcfGrossMargin")}</span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPercent(point.gross)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>{t("dcfOperatingMargin")}</span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPercent(point.operating)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {t("dcfContextNote")}
      </p>
    </div>
  );
}

function AnalystCoverageDrawer({
  open,
  analyst,
  onClose,
}: {
  open: boolean;
  analyst: NonNullable<ValuationContext["analyst_target"]> | undefined;
  onClose: () => void;
}) {
  const t = useT();
  if (!open || !analyst) return null;
  const entries = analyst.entries ?? [];

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Close analyst coverage"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold">{t("dcfAnalystDrawerTitle")}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {t("dcfAnalystDrawerSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <AnswerTile label={t("dcfAnalystAnswer")} value={formatPrice(analyst.median_price ?? analyst.mean_price)} />
          <AnswerTile
            label={t("dcfAnalystCount", { n: analyst.opinion_count ?? 0 })}
            value={normalizeRecommendation(analyst.recommendation)}
          />
        </div>

        <div className="mt-6 space-y-3">
          {entries.length > 0 ? (
            entries.map((entry, index) => (
              <div key={`${entry.firm}-${entry.date}-${index}`} className="rounded-xl bg-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{entry.firm ?? "—"}</div>
                    <div className="mt-1 text-xs text-slate-400">{entry.date ?? "—"}</div>
                  </div>
                  <div className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                    {entry.action ?? "—"}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">{t("dcfAnalystToGrade")}</div>
                    <div className="mt-1 font-medium">{entry.to_grade ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{t("dcfAnalystFromGrade")}</div>
                    <div className="mt-1 font-medium">{entry.from_grade ?? "—"}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-white/10 p-4 text-sm text-slate-300">
              {t("dcfNoAnalystEntries")}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function AnswerTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl bg-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
      {sublabel && <div className="mt-1 text-xs text-slate-400">{sublabel}</div>}
    </div>
  );
}

// ─────────────────────────────────────────
// 滑块输入
// ─────────────────────────────────────────
function SliderInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  tooltip,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
  tooltip?: ReactNode;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <span className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
          {value.toFixed(1)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      {hint && (
        <div className="relative text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1 group">
          <Info className="w-3 h-3" />
          <span>{hint}</span>
          {tooltip && (
            <div className="pointer-events-none absolute left-0 bottom-6 z-50 w-[min(20rem,calc(100vw-3rem))] opacity-0 group-hover:opacity-100 transition-opacity">
              {tooltip}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WaccTooltip({ breakdown }: { breakdown: WaccBreakdown }) {
  const t = useT();
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 shadow-xl text-slate-700 dark:text-slate-200">
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {t("dcfSuggestedWacc")}: {pct(breakdown.discount_rate)}
      </div>
      <div className="space-y-1">
        <TooltipRow label={t("dcfRiskFree")} value={pct(breakdown.risk_free_rate)} />
        {typeof breakdown.raw_beta === "number" && (
          <TooltipRow label={t("dcfRawBeta")} value={breakdown.raw_beta.toFixed(2)} />
        )}
        <TooltipRow label={t("dcfBeta")} value={breakdown.beta.toFixed(2)} />
        <TooltipRow label={t("dcfEquityRiskPremium")} value={pct(breakdown.equity_risk_premium)} />
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800 my-2" />
      <div className="space-y-1">
        <TooltipRow label={t("dcfCostOfEquity")} value={pct(breakdown.cost_of_equity)} />
        <TooltipRow label={t("dcfCostOfDebt")} value={pct(breakdown.after_tax_cost_of_debt)} />
        <TooltipRow label={t("dcfTaxRate")} value={pct(breakdown.tax_rate)} />
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800 my-2" />
      <div className="space-y-1">
        <TooltipRow label={t("dcfMarketCapWeight")} value={pct(breakdown.equity_weight)} />
        <TooltipRow label={t("dcfDebtWeight")} value={pct(breakdown.debt_weight)} />
      </div>
      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        WACC = {pct(breakdown.equity_weight)} × {pct(breakdown.cost_of_equity)} +{" "}
        {pct(breakdown.debt_weight)} × {pct(breakdown.after_tax_cost_of_debt)}
      </div>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function AssumptionTooltip({
  title,
  body,
  caution,
}: {
  title: string;
  body: string;
  caution: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 shadow-xl text-slate-700 dark:text-slate-200">
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {title}
      </div>
      <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
        {body}
      </p>
      <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {caution}
      </p>
    </div>
  );
}

function ValuationFrameworkCard({ framework }: { framework: ValuationFramework }) {
  const t = useT();
  const { lang } = useApp();
  const roleStyles: Record<string, string> = {
    primary: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    "cross-check": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    diagnostic: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    supplemental: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">
            {t("valuationFrameworkEyebrow")}
          </div>
          <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            {displayText(framework.label, lang)}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {displayText(framework.description, lang)}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm">
          <div className="text-xs text-slate-400">{t("valuationFrameworkConfidence")}</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {(framework.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("valuationFrameworkMethods")}
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {framework.recommended_methods.map((method) => (
                <span
                  key={`${method.key}-${method.role}`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    roleStyles[method.role] ?? roleStyles["cross-check"]
                  }`}
                >
                  {displayText(method.label, lang)} · {t(`valuationRole_${method.role}`)}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {t("valuationFrameworkPrinciple")}
            </span>{" "}
            {displayText(framework.principle, lang)}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {framework.drivers.slice(0, 6).map((driver) => (
            <div
              key={`${driver.category}-${driver.label}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3"
            >
              <div className="text-[11px] font-semibold uppercase text-slate-400">
                {driver.category}
              </div>
              <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {displayText(driver.label, lang)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {driver.inputs.slice(0, 4).map((input) => (
                  <span
                    key={input}
                    className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300"
                  >
                    {displayText(input, lang)}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {displayText(driver.source, lang)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {framework.driver_template && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("valuationDriverTemplateTitle")}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {displayText(framework.driver_template.label, lang)}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {framework.driver_template.segments.map((segment) => (
              <div
                key={segment.name}
                className="rounded-xl bg-white dark:bg-slate-950 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {displayText(segment.name, lang)}
                  </div>
                  <span className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    {displayText(segment.method, lang)}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-400">
                    {t("valuationDriverInputs")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {segment.drivers.map((driver) => (
                      <span
                        key={driver}
                        className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300"
                      >
                        {displayText(driver, lang)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-400">
                    {t("valuationDriverOutputs")}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {segment.outputs.map((output) => displayText(output, lang)).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {framework.driver_template.next_steps.map((step) => (
              <div
                key={step}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-600 dark:text-slate-300"
              >
                {displayText(step, lang)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-slate-950 p-4 text-white dark:bg-slate-900">
        <div className="text-sm font-semibold">{t("valuationMarketImpliedTitle")}</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          {framework.market_implied_questions.slice(0, 3).map((item) => (
            <div key={item.driver} className="rounded-lg bg-white/10 p-3">
              <div className="text-[11px] uppercase text-slate-400">{item.driver}</div>
              <div className="mt-1 text-sm leading-5 text-slate-100">
                {displayText(item.question, lang)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketImpliedAssumptionsCard({
  assumptions,
}: {
  assumptions: MarketImpliedAssumption[];
}) {
  const t = useT();
  const { lang } = useApp();
  const statusStyles: Record<string, string> = {
    reasonable: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    stretched: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    extreme: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    unknown: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  const formatValue = (item: MarketImpliedAssumption, value: number | null) => {
    if (value === null || value === undefined) return "—";
    if (item.unit === "currency_billion") return `$${value.toFixed(1)}B`;
    if (item.unit === "percent") {
      const scaled = ["stage1_fcf_growth", "terminal_growth"].includes(item.key)
        ? value * 100
        : value;
      return `${scaled.toFixed(1)}%${item.capped ? "+" : ""}`;
    }
    return String(value);
  };
  const formatBaseline = (item: MarketImpliedAssumption) => {
    if (item.baseline === null || item.baseline === undefined) return null;
    if (item.unit === "currency_billion") return `$${item.baseline.toFixed(1)}B`;
    if (item.unit === "percent") {
      const scaled = ["stage1_fcf_growth", "terminal_growth"].includes(item.key)
        ? item.baseline * 100
        : item.baseline;
      return `${scaled.toFixed(1)}%`;
    }
    return String(item.baseline);
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">
            {t("marketImpliedEyebrow")}
          </div>
          <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            {t("marketImpliedTitle")}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t("marketImpliedSubtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {assumptions.map((item) => {
          const baseline = formatBaseline(item);
          return (
            <div
              key={item.key}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {displayText(item.label, lang)}
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${
                    statusStyles[item.status] ?? statusStyles.unknown
                  }`}
                >
                  {t(`marketImpliedStatus_${item.status}`)}
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {formatValue(item, item.value)}
              </div>
              {baseline && (
                <div className="mt-1 text-xs text-slate-400">
                  {t("marketImpliedBaseline")}: {baseline}
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {displayText(item.explanation, lang)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const DRIVER_FIELD_LABELS: Record<string, string> = {
  deliveries_m: "Deliveries (M)",
  asp: "ASP",
  gross_margin: "Gross margin",
  operating_margin: "Operating margin",
  reinvestment_rate: "Reinvestment rate",
  multiple: "Multiple",
  revenue_b: "Revenue ($B)",
  growth: "Growth",
  fleet_m: "Fleet size (M)",
  attach_rate: "Attach rate",
  monthly_arpu: "Monthly ARPU",
  success_probability: "Success probability",
  tam_b: "TAM ($B)",
  market_share: "Market share",
  take_rate: "Take rate",
  discount_years: "Discount years",
  discount_rate: "Discount rate",
};

const DRIVER_FIELD_ZH: Record<string, string> = {
  deliveries_m: "交付量（百万）",
  asp: "平均售价",
  gross_margin: "毛利率",
  operating_margin: "营业利润率",
  reinvestment_rate: "再投资率",
  multiple: "倍数",
  revenue_b: "收入（十亿美元）",
  growth: "增长率",
  fleet_m: "车队规模（百万）",
  attach_rate: "渗透率",
  monthly_arpu: "月 ARPU",
  success_probability: "成功概率",
  tam_b: "TAM（十亿美元）",
  market_share: "市场份额",
  take_rate: "平台抽成率",
  discount_years: "折现年数",
  discount_rate: "折现率",
};

function isPercentDriverField(field: string) {
  return [
    "gross_margin",
    "operating_margin",
    "reinvestment_rate",
    "growth",
    "attach_rate",
    "success_probability",
    "market_share",
    "take_rate",
    "discount_rate",
  ].includes(field);
}

function driverFieldStep(field: string) {
  if (field === "asp" || field === "monthly_arpu") return 1;
  if (field === "multiple" || field === "discount_years") return 0.5;
  if (isPercentDriverField(field)) return 0.01;
  return 0.1;
}

function EditableDriverValuationCard({ result }: { result: DCFResult }) {
  const t = useT();
  const { lang } = useApp();
  const [assumptions, setAssumptions] = useState<DriverAssumptions | null>(null);
  const [driverResult, setDriverResult] = useState<DriverValuationResult | null>(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);

  const tickerSymbol = result.ticker.trim().toUpperCase();
  const driverUnsupportedMessage = t("driverUnsupported");
  const driverLoadFailedMessage = t("driverLoadFailed");
  const driverCalcFailedMessage = t("driverCalcFailed");

  useEffect(() => {
    let cancelled = false;
    const loadDefaults = async () => {
      setLoadingDrivers(true);
      setDriverError(null);
      try {
        const defaults = await apiClient.driverValuationDefaults(tickerSymbol);
        if (cancelled) return;
        if (!defaults.supported) {
          setDriverError(defaults.error ?? driverUnsupportedMessage);
          setAssumptions(null);
          setDriverResult(null);
          return;
        }
        setAssumptions(defaults.assumptions);
      } catch (e) {
        if (!cancelled) setDriverError(e instanceof Error ? e.message : driverLoadFailedMessage);
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    };
    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [tickerSymbol, driverUnsupportedMessage, driverLoadFailedMessage]);

  useEffect(() => {
    if (!assumptions) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingDrivers(true);
      setDriverError(null);
      try {
        const calculated = await apiClient.driverValuation({
          ticker: tickerSymbol,
          assumptions,
          shares_outstanding_b: result.shares_outstanding,
          net_debt_b: result.net_debt,
          current_price: result.current_price,
        });
        if (cancelled) return;
        if (!calculated.supported) {
          setDriverError(calculated.error ?? driverUnsupportedMessage);
          setDriverResult(null);
        } else {
          setDriverResult(calculated);
        }
      } catch (e) {
        if (!cancelled) setDriverError(e instanceof Error ? e.message : driverCalcFailedMessage);
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    assumptions,
    tickerSymbol,
    result.shares_outstanding,
    result.net_debt,
    result.current_price,
    driverUnsupportedMessage,
    driverCalcFailedMessage,
  ]);

  const updateAssumption = (segment: string, field: string, value: number) => {
    setAssumptions((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [segment]: {
          ...prev[segment],
          [field]: value,
        },
      };
    });
  };

  const formatDriverValue = (field: string, value: number) => {
    if (isPercentDriverField(field)) return `${(value * 100).toFixed(1)}%`;
    if (field === "asp" || field === "monthly_arpu") return `$${value.toFixed(0)}`;
    return value.toFixed(field === "multiple" || field === "discount_years" ? 1 : 2);
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-400">
            {t("driverValuationEyebrow")}
          </div>
          <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
            {t("driverValuationTitle")}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t("driverValuationSubtitle")}
          </p>
        </div>
        {loadingDrivers && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
      </div>

      {driverError && (
        <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-700 dark:text-amber-300">
          {driverError}
        </div>
      )}

      {assumptions && (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            {Object.entries(assumptions).map(([segment, fields]) => (
              <div key={segment} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  {displayText(segment === "auto" ? "Auto core" : segment === "fsd" ? "FSD subscription" : segment === "robotaxi" ? "Robotaxi" : "Energy", lang)}
                </h4>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Object.entries(fields).map(([field, rawValue]) => (
                    <label key={field} className="block">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {lang === "zh" ? DRIVER_FIELD_ZH[field] ?? field : DRIVER_FIELD_LABELS[field] ?? field}
                        </span>
                        <span className="font-mono text-slate-900 dark:text-slate-100">
                          {formatDriverValue(field, rawValue)}
                        </span>
                      </div>
                      <input
                        type="number"
                        step={driverFieldStep(field)}
                        value={rawValue}
                        onChange={(e) => updateAssumption(segment, field, Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <div className="text-xs uppercase text-slate-400">{t("driverValuePerShare")}</div>
              <div className="mt-2 text-4xl font-bold tabular-nums">
                ${driverResult?.value_per_share?.toFixed(2) ?? "—"}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-slate-500">{t("dcfEnterpriseValue")}</div>
                  <div className="font-semibold tabular-nums">
                    ${driverResult?.enterprise_value_b?.toFixed(0) ?? "—"}B
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{t("dcfEquityValue")}</div>
                  <div className="font-semibold tabular-nums">
                    ${driverResult?.equity_value_b?.toFixed(0) ?? "—"}B
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{t("driverMarketGap")}</div>
                  <div className="font-semibold tabular-nums">
                    ${driverResult?.market_gap_b?.toFixed(0) ?? "—"}B
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{t("dcfCurrent")}</div>
                  <div className="font-semibold tabular-nums">
                    ${driverResult?.current_price?.toFixed(2) ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {driverResult?.segments?.map((segment) => (
                <div
                  key={segment.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {displayText(segment.label, lang)}
                      </div>
                      <div className="text-xs text-slate-400">{displayText(segment.method, lang)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">{t("driverSegmentValue")}</div>
                      <div className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        ${segment.value_b?.toFixed(1) ?? "—"}B
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      {t("driverRevenue")}: ${segment.revenue_b?.toFixed(1) ?? "—"}B
                    </div>
                    <div>
                      {t("driverProfit")}: ${segment.profit_b?.toFixed(1) ?? "—"}B
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────
// 估值结果卡片
// ─────────────────────────────────────────
function ValuationResultCard({ result }: { result: DCFResult }) {
  const t = useT();
  const upside = result.upside_pct ?? 0;
  const isUndervalued = upside > 0;
  const assumptions = result.assumptions;
  const growthPct = assumptions.growth_rate * 100;
  const discountPct = assumptions.discount_rate * 100;
  const impliedGrowthPct =
    result.implied_growth_rate !== null ? result.implied_growth_rate * 100 : null;
  const impliedGrowthText =
    impliedGrowthPct === null
      ? "—"
      : `${impliedGrowthPct.toFixed(1)}${impliedGrowthPct >= 59.95 ? "%+" : "%"}`;
  const netDebt = result.net_debt;
  const balanceSheetLabel = netDebt !== null && netDebt < 0 ? t("dcfNetCash") : t("dcfNetDebt");
  const balanceSheetValue =
    netDebt === null ? "—" : `$${Math.abs(netDebt).toFixed(1)}B`;
  const marketLens =
    impliedGrowthPct !== null && impliedGrowthPct > growthPct + 3
      ? t("dcfMarketImplies", { implied: impliedGrowthText })
      : t("dcfCompareImplied");
  const cardStyle = isUndervalued
    ? "from-emerald-500 to-green-600"
    : "from-rose-500 to-red-600";

  return (
    <div className={`rounded-2xl p-6 bg-gradient-to-br ${cardStyle} text-white shadow-lg`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
            {t("dcfIntrinsic")}
          </div>
          <div className="text-4xl font-bold tabular-nums">
            ${result.intrinsic_value_per_share?.toFixed(2)}
          </div>
          <div className="text-sm opacity-80 mt-1">{t("dcfIntrinsicSub")}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
            {t("dcfCurrent")}
          </div>
          <div className="text-3xl font-bold tabular-nums">
            ${result.current_price?.toFixed(2) ?? "—"}
          </div>
          <div className="text-sm opacity-80 mt-1">{t("dcfCurrentSub")}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
            {t("dcfUpside")}
          </div>
          <div className="text-4xl font-bold tabular-nums flex items-center gap-1">
            {isUndervalued ? (
              <TrendingUp className="w-7 h-7" />
            ) : (
              <TrendingDown className="w-7 h-7" />
            )}
            {isUndervalued ? "+" : ""}
            {upside.toFixed(1)}%
          </div>
          <div className="text-sm opacity-80 mt-1">
            {isUndervalued ? t("dcfUndervalued") : t("dcfOvervalued")}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/20 bg-white/10 p-3 text-sm leading-relaxed">
        <div className="flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{t("dcfAssumptionTitle")}</span>{" "}
            {t("dcfAssumptionBody", {
              growth: growthPct.toFixed(1),
              discount: discountPct.toFixed(1),
            })}{" "}
            {marketLens}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-white/20 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs opacity-70">{t("dcfCurrentFcf")}</div>
          <div className="font-semibold tabular-nums">
            ${result.current_fcf?.toFixed(1) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{t("dcfTerminalValuePv")}</div>
          <div className="font-semibold tabular-nums">
            ${result.terminal_value_pv?.toFixed(0) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{t("dcfEnterpriseValue")}</div>
          <div className="font-semibold tabular-nums">
            ${result.enterprise_value?.toFixed(0) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{t("dcfEquityValue")}</div>
          <div className="font-semibold tabular-nums">
            ${result.equity_value?.toFixed(0) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{t("dcfSharesOut")}</div>
          <div className="font-semibold tabular-nums">
            {result.shares_outstanding?.toFixed(2) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{balanceSheetLabel}</div>
          <div className="font-semibold tabular-nums">
            {balanceSheetValue}
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{t("dcfTerminalPct")}</div>
          <div className="font-semibold tabular-nums">
            {result.terminal_value_pct?.toFixed(1) ?? "—"}%
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">{t("dcfImpliedGrowth")}</div>
          <div className="font-semibold tabular-nums">
            {impliedGrowthText}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 敏感性三档场景
// ─────────────────────────────────────────
function SensitivityScenarios({ data }: { data: SensitivityResult }) {
  const t = useT();
  const order = ["conservative", "base", "optimistic"];
  const scenarioLabels: Record<string, string> = {
    conservative: t("dcfConservative"),
    base: t("dcfBase"),
    optimistic: t("dcfOptimistic"),
  };
  const styles: Record<string, string> = {
    conservative: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
    base: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
    optimistic:
      "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  };

  return (
    <div>
      <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-sm">
        🎲 {t("dcfSensitivityTitle")}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {order.map((key) => {
          const s = data.scenarios[key];
          if (!s) return null;
          const upside = s.upside_pct ?? 0;
          const isUp = upside >= 0;
          return (
            <div
              key={key}
              className={`rounded-2xl border p-4 ${styles[key]}`}
            >
              <div className="font-bold text-slate-900 dark:text-slate-100 mb-2">
                {scenarioLabels[key] ?? s.label}
              </div>
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 mb-3">
                <div>WACC: {(s.discount_rate * 100).toFixed(1)}%</div>
                <div>{t("dcfGrowthLabel")}: {(s.growth_rate * 100).toFixed(1)}%</div>
              </div>
              {s.intrinsic_value !== null ? (
                <>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    ${s.intrinsic_value?.toFixed(2)}
                  </div>
                  <div
                    className={`text-sm font-medium tabular-nums mt-1 ${
                      isUp
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {isUp ? "+" : ""}
                    {upside.toFixed(1)}% {t("dcfVsMarket")}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">{t("dcfNotAvailable")}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
