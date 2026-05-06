/**
 * 全局 App Context
 * 管理：主题（light / dark / system）、语言（zh / en）
 * 配置持久化到 localStorage
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

const STORAGE_KEY = "fin-agent-prefs";

interface AppContextValue {
  theme: Theme;
  lang: Lang;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [lang, setLangState] = useState<Lang>("zh");
  const [hydrated, setHydrated] = useState(false);

  // 初次加载：从 localStorage 读
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.theme) setThemeState(prefs.theme);
        if (prefs.lang) setLangState(prefs.lang);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // 应用主题到 <html> 标签
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

    // 跟随系统时监听系统主题变化
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, hydrated]);

  // 持久化
  const persist = (next: { theme: Theme; lang: Lang }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    persist({ theme: t, lang });
  };

  const setLang = (l: Lang) => {
    setLangState(l);
    persist({ theme, lang: l });
  };

  return (
    <AppContext.Provider value={{ theme, lang, setTheme, setLang }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

// ─────────────────────────────────────────
// 翻译表
// ─────────────────────────────────────────
const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  zh: {
    // Header
    appSubtitle: "AI 财务分析 · 美股 + A 股",
    headerTagline: "让你 30 秒看懂一家公司的风险",
    // Hero
    heroTitle1: "让财务报表",
    heroTitle2: " 说人话",
    heroSubtitle: "实时市场热度 · 板块洞察 · AI 财务分析与风险识别",
    // Sections
    marketOverview: "🗺️ 市场概览",
    usMarket: "美股",
    cnMarket: "A 股",
    usSectors: "美股板块",
    cnSectors: "A 股板块",
    catIndustry: "行业",
    catSize: "市值",
    catRegion: "地域",
    viewHeatmap: "🎯 热度图",
    viewRank: "📊 排行",
    // Heatmap
    heatmapTitle: "市场热度地图",
    heatmapSubtitle: "气泡越大 = 资金越关注 · 颜色越深 = 波动越剧烈",
    todayHottest: "今日最热：",
    legendUp: "上涨",
    legendDown: "下跌",
    legendFlat: "持平",
    clickHint: "点击任何板块查看其领涨公司 · 数据每 30 分钟更新",
    // Sector table
    sectorCol: "板块 / Sector",
    priceCol: "价格",
    changeCol: "涨跌幅",
    inflowCol: "主力净流入(亿)",
    actionCol: "操作",
    viewDetail: "查看详情 →",
    noData: "暂无数据",
    // Sector detail
    sectorHistory: "📈 近 90 天走势",
    topHoldings: "🏢 前 5 大成分股",
    // Chat
    chatTitle: "AI 财务分析",
    settingsBtn: "已配置",
    settingsBtnEmpty: "配置 AI",
    chatPrompt: "问我任何公司的财务问题",
    chatHint: "我会拉取最新财务数据，30 秒内告诉你这家公司值不值得关注",
    chatPlaceholder: "例：分析苹果 2024 年的财务状况",
    loadingMsg:
      "正在分析中... 拉取财务数据 + AI 解读，可能需要 15-30 秒",
    errorTitle: "分析出错",
    errorHint: "请检查 API Key 是否正确，或稍后重试。",
    identified: "已识别",
    aiDetail: "AI 详细解读",
    // Risk dashboard
    riskLow: "低风险",
    riskMedium: "中等风险",
    riskHigh: "高风险",
    riskScoreLabel: "风险分 / 100",
    riskBasedOn:
      "基于 Altman Z-Score、Beneish M-Score、现金流质量等多维度模型评估",
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
    // Settings
    settingsTitle: "设置",
    settingsAi: "AI 服务",
    settingsApiKey: "API Key",
    settingsTheme: "主题",
    settingsLanguage: "语言",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    keyHint: "🔒 Key 只存于你的浏览器，不会上传任何服务器",
    cancel: "取消",
    save: "保存",
    // Footer
    footer: "本工具仅供学习使用，所有内容不构成投资建议",
  },
  en: {
    appSubtitle: "AI Financial Analysis · US & CN Stocks",
    headerTagline: "Spot company risks in 30 seconds",
    heroTitle1: "Make financials",
    heroTitle2: " human-readable",
    heroSubtitle:
      "Real-time market heat · Sector insights · AI risk detection",
    marketOverview: "🗺️ Market Overview",
    usMarket: "US",
    cnMarket: "China A",
    usSectors: "US Sectors",
    cnSectors: "CN Sectors",
    catIndustry: "Industry",
    catSize: "Size",
    catRegion: "Region",
    viewHeatmap: "🎯 Heatmap",
    viewRank: "📊 Rank",
    heatmapTitle: "Market Heat Map",
    heatmapSubtitle:
      "Bigger bubbles = more attention · Deeper colors = more volatile",
    todayHottest: "Today's hottest:",
    legendUp: "Up",
    legendDown: "Down",
    legendFlat: "Flat",
    clickHint: "Click any sector for its top companies · Updates every 30 min",
    sectorCol: "Sector",
    priceCol: "Price",
    changeCol: "Change",
    inflowCol: "Net Inflow (¥100M)",
    actionCol: "Action",
    viewDetail: "View detail →",
    noData: "No data",
    sectorHistory: "📈 Last 90 days",
    topHoldings: "🏢 Top 5 holdings",
    chatTitle: "AI Financial Analysis",
    settingsBtn: "Configured",
    settingsBtnEmpty: "Configure AI",
    chatPrompt: "Ask me about any company's financials",
    chatHint:
      "I'll fetch the latest data and tell you if it's worth a look in 30 seconds",
    chatPlaceholder: "e.g. Analyze Apple's 2024 financials",
    loadingMsg:
      "Analyzing... fetching data + AI interpretation, may take 15-30s",
    errorTitle: "Analysis error",
    errorHint: "Please check your API key or try again later.",
    identified: "Identified",
    aiDetail: "AI Interpretation",
    riskLow: "Low Risk",
    riskMedium: "Medium Risk",
    riskHigh: "High Risk",
    riskScoreLabel: "Risk Score / 100",
    riskBasedOn:
      "Based on Altman Z-Score, Beneish M-Score, cash flow quality and more",
    redFlagsTitle: "Found {n} signal(s) to watch",
    radarTitle: "5-Dimension Health",
    radarSubtitle: "Each dimension scored 0-100, higher is healthier",
    dimProfitability: "Profitability",
    dimSolvency: "Solvency",
    dimCashFlow: "Cash Flow",
    dimRevenueQuality: "Revenue Quality",
    dimValuation: "Valuation",
    metricAltman: "Altman Z-Score",
    metricAltmanSub: "Bankruptcy risk",
    metricBeneish: "Beneish M-Score",
    metricBeneishSub: "Earnings manipulation",
    metricCash: "Cash Flow Match",
    metricCashSub: "Earnings quality",
    metricAR: "AR Growth",
    metricARSub: "Revenue authenticity",
    settingsTitle: "Settings",
    settingsAi: "AI Provider",
    settingsApiKey: "API Key",
    settingsTheme: "Theme",
    settingsLanguage: "Language",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    keyHint: "🔒 Key stays in your browser, never uploaded",
    cancel: "Cancel",
    save: "Save",
    footer: "For educational use only. Nothing here is investment advice.",
  },
};

export function useT() {
  const { lang } = useApp();
  return (key: string, vars?: Record<string, string | number>) => {
    let text = TRANSLATIONS[lang][key] || TRANSLATIONS.zh[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };
}
