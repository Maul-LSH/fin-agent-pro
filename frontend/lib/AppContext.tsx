/**
 * Global App Context
 * Manages: theme (light / dark / system), language (zh / en), market (us / cn / hk)
 *
 * Default language: English
 * Default market: US
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type Lang = "zh" | "en";
export type Market = "us" | "cn" | "hk";

const STORAGE_KEY = "fin-agent-prefs";

interface AppContextValue {
  theme: Theme;
  lang: Lang;
  market: Market;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  setMarket: (m: Market) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [lang, setLangState] = useState<Lang>("en");
  const [market, setMarketState] = useState<Market>("us");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.theme) setThemeState(prefs.theme);
        if (prefs.lang) setLangState(prefs.lang);
        if (prefs.market) setMarketState(prefs.market);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    const apply = (t: Theme) => {
      const isDark =
        t === "dark" ||
        (t === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply(theme);
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, hydrated]);

  const persist = (next: { theme: Theme; lang: Lang; market: Market }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const setTheme = (t: Theme) => { setThemeState(t); persist({ theme: t, lang, market }); };
  const setLang = (l: Lang) => { setLangState(l); persist({ theme, lang: l, market }); };
  const setMarket = (m: Market) => { setMarketState(m); persist({ theme, lang, market: m }); };

  return (
    <AppContext.Provider value={{ theme, lang, market, setTheme, setLang, setMarket }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  en: {
    brand: "fin-agent-pro",
    navMarketUS: "US Stocks",
    navMarketCN: "China A",
    navMarketHK: "Hong Kong",
    navPortfolio: "Portfolio",
    navCompare: "Compare",
    navValuation: "Valuation",
    navSettings: "Settings",
    heroTitle: "fin-agent-pro",
    heroSubtitle: "AI-powered risk detection for the stocks you don't have time to analyze.",
    heroCTAPrimary: "Try a demo",
    heroCTASecondary: "Learn more",
    learnMore: "Learn more",
    tryIt: "Try it",

    // Feature sections (homepage scroll narrative)
    featMarketEyebrow: "MARKET OVERVIEW",
    featMarketTitle: "Real-time market pulse.",
    featMarketBody: "S&P 500, NASDAQ, Hang Seng — all in one view. See what's moving across markets at a glance, with currency-aware formatting and live percentage changes.",

    featHeatmapEyebrow: "SECTOR HEATMAP",
    featHeatmapTitle: "See the heat.",
    featHeatmapBody: "Bigger bubbles mean more attention. Deeper colors mean wilder swings. Find the action across 11 sectors in seconds — no spreadsheets, no scrolling through tickers.",

    featAiEyebrow: "AI FINANCIAL ANALYSIS",
    featAiTitle: "30 seconds. Any company.",
    featAiBody: "Powered by Altman Z-Score, Beneish M-Score, and Claude / GPT-4o. Ask in plain English, get a pro-grade risk read with red flags surfaced — institutional rigor, retail accessibility.",

    featCompareEyebrow: "MULTI-COMPANY COMPARE",
    featCompareTitle: "Side-by-side, Apple-style.",
    featCompareBody: "Compare 2 to 4 companies across financials, risk scores, and valuation multiples. Best-value highlights instantly show you the outlier — the way Apple compares iPhones.",

    featPortfolioEyebrow: "PORTFOLIO DIAGNOSTIC",
    featPortfolioTitle: "Know your concentration.",
    featPortfolioBody: "Weighted risk scoring, sector concentration warnings, red flags per holding. Your portfolio's full X-ray — diagnostic only, never advice. Data stays in your browser.",

    featDcfEyebrow: "DCF VALUATION",
    featDcfTitle: "Build the model in seconds.",
    featDcfBody: "Set WACC, growth, and terminal growth — see intrinsic value plus three sensitivity scenarios. The DCF model that took your finance professor a lecture, now ten clicks.",
    marketOverviewTitle: "Market Overview",
    marketOverviewSubtitle: "Live indices, sector pulse, and what's moving today.",
    sectorHeatmapTitle: "Sector Heatmap",
    sectorHeatmapSubtitle: "Bigger bubble = more attention · Deeper color = more volatile",
    sectorRankingTitle: "Sector Ranking",
    hkAnalysisTitle: "Analyze any HK-listed company",
    hkAnalysisBody: "Sector heatmaps aren't available for Hong Kong, but you can ask the AI about any HK-listed stock — Tencent (00700), HSBC (00005), Alibaba HK (09988), Xiaomi (01810), and more. Get the same Altman Z-Score / Beneish M-Score / financial breakdown.",
    hkAnalysisCTA: "Ask the AI",
    dataUnavailableTitle: "Market data temporarily unavailable",
    dataUnavailableBody: "The data provider (EastMoney via AkShare) is currently not responding. This is on their side, not yours. AI analysis on individual stocks still works — try the floating chat below.",
    cnFallbackTitle: "Analyze any A-share company",
    cnFallbackBody: "Market overview is currently unavailable, but you can still ask the AI about any A-share stock — Kweichow Moutai (600519), CATL (300750), BYD (002594), and more. Full financial breakdown with Altman Z-Score and Beneish M-Score.",
    cnFallbackCTA: "Ask the AI",
    catIndustry: "Industry",
    catSize: "Size",
    catRegion: "Region",
    viewHeatmap: "Heatmap",
    viewRank: "Ranking",
    todayHottest: "Today's hottest:",
    legendUp: "Up",
    legendDown: "Down",
    legendFlat: "Flat",
    clickHint: "Click any sector to see its top holdings · Updated every 30 minutes",
    sectorCol: "Sector",
    priceCol: "Price",
    changeCol: "Change %",
    inflowCol: "Net Inflow (B)",
    actionCol: "Action",
    viewDetail: "View detail",
    noData: "No data available",
    sectorHistory: "90-Day Trend",
    topHoldings: "Top 5 Holdings",
    chatTitle: "AI Financial Analysis",
    chatPrompt: "Ask me anything about a company's financials",
    chatHint: "I'll pull the latest data and tell you in 30 seconds whether the company is worth your attention.",
    chatPlaceholder: "e.g. Analyze Apple's 2024 financials",
    loadingMsg: "Analyzing... fetching financial data + AI interpretation, may take 15-30 seconds",
    errorTitle: "Analysis failed",
    errorHint: "Please verify your API key or try again later.",
    identified: "Identified",
    aiDetail: "Detailed AI analysis",
    settingsBtn: "Configured",
    settingsBtnEmpty: "Configure AI",
    chatFloatingTitle: "Ask AI",
    chatExpand: "Expand",
    chatCollapse: "Collapse",
    riskLow: "Low Risk",
    riskMedium: "Medium Risk",
    riskHigh: "High Risk",
    riskScoreLabel: "Risk score / 100",
    riskBasedOn: "Based on Altman Z-Score, Beneish M-Score, cash flow quality, and other models",
    redFlagsTitle: "{n} signals to watch",
    radarTitle: "5-Dimension Health",
    radarSubtitle: "Each dimension scored 0-100, higher is healthier",
    dimProfitability: "Profitability",
    dimSolvency: "Solvency",
    dimCashFlow: "Cash Flow",
    dimRevenueQuality: "Revenue Quality",
    dimValuation: "Valuation",
    metricAltman: "Altman Z-Score",
    metricAltmanSub: "Bankruptcy risk prediction",
    metricBeneish: "Beneish M-Score",
    metricBeneishSub: "Earnings manipulation detection",
    metricCash: "Cash Flow Match",
    metricCashSub: "Earnings quality",
    metricAR: "AR Growth Rate",
    metricARSub: "Revenue authenticity",
    settingsTitle: "Settings",
    settingsAi: "AI Provider",
    settingsApiKey: "API Key",
    settingsTheme: "Theme",
    settingsLanguage: "Language",
    settingsMarket: "Default Market",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    keyHint: "Your key is stored only in your browser, never uploaded.",
    cancel: "Cancel",
    save: "Save",
    compareTitle: "Compare Companies",
    compareSubtitle: "Side-by-side comparison of 2-4 companies, Apple-style",
    compareAdd: "Add",
    compareRun: "Compare",
    compareNeed2: "Need at least 2 companies",
    compareMax4: "Max 4 companies",
    compareAlready: "Already added",
    compareExportPDF: "Export PDF",
    compareRiskScore: "Risk Score",
    compareDimensions: "5-Dimension Health",
    compareDimHint: "Higher is healthier",
    compareGroupOverview: "Financial Overview",
    compareGroupProfit: "Profitability",
    compareGroupBalance: "Balance Sheet",
    compareGroupCashflow: "Cash Flow",
    compareBestValue: "Best value among compared",
    comparePeriod: "Period",
    portfolioTitle: "My Portfolio",
    portfolioSubtitle: "Diagnose your holdings — weighted risk, sector concentration, individual signals. Stored locally.",
    portfolioTickerPh: "Ticker (AAPL, 600519, 00700...)",
    portfolioAmountPh: "Position size ($, optional)",
    portfolioAdd: "Add",
    portfolioMax: "Max 15 holdings",
    portfolioClearAll: "Clear all",
    portfolioTotal: "Total",
    portfolioDiagnose: "Diagnose My Portfolio",
    portfolioAnalyzing: "Analyzing portfolio...",
    portfolioNeedHolding: "Add at least one holding",
    portfolioWeightedRisk: "Portfolio Risk / 100",
    portfolioSummaryDisclaimer: "Diagnostic only — not investment advice.",
    portfolioSignals: "Individual Stock Signals",
    portfolioSectorConcentration: "Sector Concentration",
    portfolioGeoDistribution: "Geographic Distribution",
    portfolioHoldings: "Holdings Detail",
    dcfTitle: "DCF Valuation",
    dcfSubtitle: "Discounted Cash Flow model with three-scenario sensitivity analysis",
    dcfTicker: "Ticker",
    dcfWacc: "Discount Rate (WACC)",
    dcfWaccHint: "Higher = more conservative",
    dcfGrowth: "FCF Growth Rate (5y)",
    dcfGrowthHint: "Annual FCF growth assumption",
    dcfTerminal: "Terminal Growth",
    dcfTerminalHint: "Long-term GDP-like growth",
    dcfRun: "Run DCF Valuation",
    dcfRunning: "Calculating...",
    dcfIntrinsic: "Intrinsic Value",
    dcfIntrinsicSub: "per share",
    dcfCurrent: "Current Price",
    dcfCurrentSub: "market price",
    dcfUpside: "Upside / Downside",
    dcfUndervalued: "potentially undervalued",
    dcfOvervalued: "potentially overvalued",
    dcfFcfProjection: "5-Year FCF Projection (Present Value, $B)",
    dcfSensitivityTitle: "Sensitivity Analysis · Three Scenarios",
    dcfConservative: "Conservative",
    dcfBase: "Base Case",
    dcfOptimistic: "Optimistic",
    footerDisclaimer: "For educational use only. Nothing here constitutes investment advice.",
    backToHome: "Back to home",
    loading: "Loading...",
  },
  zh: {
    brand: "fin-agent-pro",
    navMarketUS: "美股",
    navMarketCN: "A 股",
    navMarketHK: "港股",
    navPortfolio: "投资组合",
    navCompare: "对比",
    navValuation: "估值",
    navSettings: "设置",
    heroTitle: "fin-agent-pro",
    heroSubtitle: "用 AI 帮你 30 秒看懂一家公司的风险——给没时间研究财报的你。",
    heroCTAPrimary: "试用演示",
    heroCTASecondary: "了解更多",
    learnMore: "了解更多",
    tryIt: "立即体验",

    // 首页滚动叙事
    featMarketEyebrow: "大盘指数",
    featMarketTitle: "全球市场，一屏掌握。",
    featMarketBody: "标普 500、纳斯达克、恒生指数——一眼看尽。实时百分比变动 + 自动货币格式化，不用再切换 App 看不同市场。",

    featHeatmapEyebrow: "行业热度图",
    featHeatmapTitle: "热点一目了然。",
    featHeatmapBody: "气泡越大，关注度越高；颜色越深，波动越剧烈。30 秒看清 11 个行业的资金动向——不用翻表、不用算指标。",

    featAiEyebrow: "AI 财务分析",
    featAiTitle: "30 秒，看懂任何公司。",
    featAiBody: "Altman Z-Score、Beneish M-Score、Claude/GPT-4o 多模型驱动。用大白话提问，得到机构级风险解读和红旗预警——专业严谨，散户友好。",

    featCompareEyebrow: "多公司对比",
    featCompareTitle: "苹果风格的横向对比。",
    featCompareBody: "支持 2-4 家公司在财务、风险、估值维度并排对比。最优项自动高亮——就像苹果官网比较 iPhone 那样直观。",

    featPortfolioEyebrow: "投资组合诊断",
    featPortfolioTitle: "看清你的持仓集中度。",
    featPortfolioBody: "加权风险评分、行业集中度告警、个股红旗。给你的组合做一次全面体检——只诊断，不建议；数据永远不离开你的浏览器。",

    featDcfEyebrow: "DCF 估值",
    featDcfTitle: "10 次点击，搭好估值模型。",
    featDcfBody: "调整 WACC、增长率、终值增长——立刻看到内在价值和三档敏感性场景。当年财务课老师讲一节课的 DCF，现在拖几个滑块就够了。",
    marketOverviewTitle: "市场概览",
    marketOverviewSubtitle: "实时指数、板块脉搏、今日热点。",
    sectorHeatmapTitle: "行业热度地图",
    sectorHeatmapSubtitle: "气泡越大 = 资金越关注 · 颜色越深 = 波动越剧烈",
    sectorRankingTitle: "板块排行",
    hkAnalysisTitle: "分析任何港股公司",
    hkAnalysisBody: "港股暂不支持行业热度图，但你可以让 AI 分析任何港股个股——腾讯 (00700)、汇丰 (00005)、阿里 (09988)、小米 (01810) 等。同样的 Altman Z-Score / Beneish M-Score / 财务全面解读。",
    hkAnalysisCTA: "问 AI",
    dataUnavailableTitle: "市场数据暂时不可用",
    dataUnavailableBody: "数据源（东方财富/AkShare）当前未响应，与你无关。个股 AI 分析仍然可用——可以使用右下角浮动对话框测试。",
    cnFallbackTitle: "分析任何 A 股公司",
    cnFallbackBody: "大盘数据暂不可用，但你仍可以让 AI 分析任何 A 股个股——贵州茅台 (600519)、宁德时代 (300750)、比亚迪 (002594) 等。完整财务解读 + Altman Z-Score + Beneish M-Score。",
    cnFallbackCTA: "问 AI",
    catIndustry: "行业",
    catSize: "市值",
    catRegion: "地域",
    viewHeatmap: "热度图",
    viewRank: "排行",
    todayHottest: "今日最热：",
    legendUp: "上涨",
    legendDown: "下跌",
    legendFlat: "持平",
    clickHint: "点击任何板块查看其领涨公司 · 数据每 30 分钟更新",
    sectorCol: "板块",
    priceCol: "价格",
    changeCol: "涨跌幅",
    inflowCol: "主力净流入(亿)",
    actionCol: "操作",
    viewDetail: "查看详情",
    noData: "暂无数据",
    sectorHistory: "近 90 天走势",
    topHoldings: "前 5 大成分股",
    chatTitle: "AI 财务分析",
    chatPrompt: "问我任何公司的财务问题",
    chatHint: "我会拉取最新财务数据，30 秒内告诉你这家公司值不值得关注",
    chatPlaceholder: "例：分析苹果 2024 年的财务状况",
    loadingMsg: "正在分析中... 拉取财务数据 + AI 解读，可能需要 15-30 秒",
    errorTitle: "分析出错",
    errorHint: "请检查 API Key 是否正确，或稍后重试。",
    identified: "已识别",
    aiDetail: "AI 详细解读",
    settingsBtn: "已配置",
    settingsBtnEmpty: "配置 AI",
    chatFloatingTitle: "问 AI",
    chatExpand: "展开",
    chatCollapse: "收起",
    riskLow: "低风险",
    riskMedium: "中等风险",
    riskHigh: "高风险",
    riskScoreLabel: "风险分 / 100",
    riskBasedOn: "基于 Altman Z-Score、Beneish M-Score、现金流质量等多维度模型评估",
    redFlagsTitle: "发现 {n} 项关注信号",
    radarTitle: "五维度健康度",
    radarSubtitle: "每个维度 0-100 分，越大越健康",
    dimProfitability: "盈利能力",
    dimSolvency: "偿债能力",
    dimCashFlow: "现金流",
    dimRevenueQuality: "营收质量",
    dimValuation: "估值",
    metricAltman: "Altman Z-Score",
    metricAltmanSub: "破产风险预测",
    metricBeneish: "Beneish M-Score",
    metricBeneishSub: "盈余操纵识别",
    metricCash: "现金流匹配度",
    metricCashSub: "盈利质量",
    metricAR: "应收账款增速",
    metricARSub: "营收真实性",
    settingsTitle: "设置",
    settingsAi: "AI 服务",
    settingsApiKey: "API Key",
    settingsTheme: "主题",
    settingsLanguage: "语言",
    settingsMarket: "默认市场",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    keyHint: "Key 只存于你的浏览器，不会上传任何服务器",
    cancel: "取消",
    save: "保存",
    compareTitle: "多公司对比",
    compareSubtitle: "Apple 风格的横向对比，支持 2-4 家公司",
    compareAdd: "添加",
    compareRun: "对比",
    compareNeed2: "至少需要 2 家公司",
    compareMax4: "最多 4 家",
    compareAlready: "已经添加过了",
    compareExportPDF: "导出 PDF",
    compareRiskScore: "风险评分",
    compareDimensions: "五维度健康度",
    compareDimHint: "越高越健康",
    compareGroupOverview: "财务概览",
    compareGroupProfit: "盈利能力",
    compareGroupBalance: "资产负债",
    compareGroupCashflow: "现金流",
    compareBestValue: "对比中最优",
    comparePeriod: "财年",
    portfolioTitle: "我的投资组合",
    portfolioSubtitle: "诊断你的持仓——加权风险、行业集中度、个股信号。数据本地存储。",
    portfolioTickerPh: "代码（AAPL、600519、00700...）",
    portfolioAmountPh: "仓位金额（$，可选）",
    portfolioAdd: "添加",
    portfolioMax: "最多 15 只",
    portfolioClearAll: "全部清空",
    portfolioTotal: "总计",
    portfolioDiagnose: "AI 诊断我的组合",
    portfolioAnalyzing: "正在诊断...",
    portfolioNeedHolding: "请至少添加一只持仓",
    portfolioWeightedRisk: "组合风险 / 100",
    portfolioSummaryDisclaimer: "仅作诊断参考——不构成投资建议。",
    portfolioSignals: "个股信号",
    portfolioSectorConcentration: "行业集中度",
    portfolioGeoDistribution: "地域分布",
    portfolioHoldings: "持仓明细",
    dcfTitle: "DCF 估值",
    dcfSubtitle: "现金流折现模型 + 三档场景敏感性分析",
    dcfTicker: "股票代码",
    dcfWacc: "折现率 (WACC)",
    dcfWaccHint: "越高越保守",
    dcfGrowth: "未来 5 年自由现金流增速",
    dcfGrowthHint: "年化增速假设",
    dcfTerminal: "终值增长率",
    dcfTerminalHint: "长期 GDP 类增长",
    dcfRun: "运行 DCF",
    dcfRunning: "计算中...",
    dcfIntrinsic: "内在价值",
    dcfIntrinsicSub: "每股",
    dcfCurrent: "当前价格",
    dcfCurrentSub: "市场价",
    dcfUpside: "上涨 / 下跌空间",
    dcfUndervalued: "可能被低估",
    dcfOvervalued: "可能被高估",
    dcfFcfProjection: "未来 5 年自由现金流现值 (B)",
    dcfSensitivityTitle: "敏感性分析 · 三档场景",
    dcfConservative: "保守",
    dcfBase: "中性",
    dcfOptimistic: "激进",
    footerDisclaimer: "本工具仅供学习使用，所有内容不构成投资建议。",
    backToHome: "返回首页",
    loading: "加载中...",
  },
};

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  let s = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

export function useT() {
  const { lang } = useApp();
  return (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);
}
