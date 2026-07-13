/**
 * 多公司对比组件 — Apple-style 横向对比
 * 用户选 2-4 家公司 → 分模块对比（财务概览/盈利/估值/风险）
 * 数字最优的会高亮
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Search,
  Loader2,
  TrendingUp,
  Shield,
  DollarSign,
  Target,
  ArrowLeft,
  GitCompare,
  Workflow,
  BarChart3,
} from "lucide-react";
import { apiClient, type CompanySnapshot, type CompareResponse } from "@/lib/api";
import { useApp, useT, type Lang } from "@/lib/AppContext";
import { ExportPDFButton } from "./ExportPDFButton";

const MAX_COMPANIES = 4;
const COMPARE_STORAGE_KEY = "fin-agent-compare-state";

interface CompareStoredState {
  tickerInput: string;
  tickers: string[];
  data: CompareResponse | null;
  lang: Lang;
}

function loadCompareStoredState(): Partial<CompareStoredState> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(COMPARE_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Partial<CompareStoredState>) : null;
  } catch {
    return null;
  }
}

interface MetricRow {
  key: string;
  label: string;
  format?: (val: unknown) => string;
  // 是否要标记最优值（true=越大越好，false=越小越好，undefined=不标）
  preferHigh?: boolean;
}

interface MetricGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  source: "valuation" | "income" | "balance" | "cashflow" | "indicators" | "risk";
  rows: MetricRow[];
}

// ─────────────────────────────────────────
// 对比模块定义
// ─────────────────────────────────────────
const METRIC_GROUPS: MetricGroup[] = [
  {
    id: "overview",
    label: "Financial Overview",
    icon: <DollarSign className="w-5 h-5" />,
    source: "valuation",
    rows: [
      { key: "Market Cap (B)", label: "Market Cap (B)", preferHigh: true },
      { key: "PE (TTM)", label: "P/E (TTM)", preferHigh: false },
      { key: "Forward PE", label: "Forward P/E", preferHigh: false },
      { key: "PB", label: "P/B", preferHigh: false },
      { key: "PS (TTM)", label: "P/S", preferHigh: false },
      { key: "Dividend Yield (%)", label: "Dividend Yield (%)", preferHigh: true },
    ],
  },
  {
    id: "profitability",
    label: "Profitability",
    icon: <TrendingUp className="w-5 h-5" />,
    source: "income",
    rows: [
      { key: "Revenue (B)", label: "Revenue (B)", preferHigh: true },
      { key: "Gross Profit (B)", label: "Gross Profit (B)", preferHigh: true },
      { key: "Operating Income (B)", label: "Operating Income (B)", preferHigh: true },
      { key: "Net Income (B)", label: "Net Income (B)", preferHigh: true },
      { key: "Gross Margin (%)", label: "Gross Margin (%)", preferHigh: true },
      { key: "Net Margin (%)", label: "Net Margin (%)", preferHigh: true },
      { key: "EPS (Basic)", label: "EPS", preferHigh: true },
    ],
  },
  {
    id: "balance",
    label: "Balance Sheet",
    icon: <Shield className="w-5 h-5" />,
    source: "balance",
    rows: [
      { key: "Total Assets (B)", label: "Total Assets (B)", preferHigh: true },
      { key: "Total Liabilities (B)", label: "Total Liabilities (B)", preferHigh: false },
      { key: "Stockholders Equity (B)", label: "Equity (B)", preferHigh: true },
      { key: "Cash & Equivalents (B)", label: "Cash (B)", preferHigh: true },
      { key: "Total Debt (B)", label: "Total Debt (B)", preferHigh: false },
      { key: "Debt-to-Asset Ratio (%)", label: "D/A Ratio (%)", preferHigh: false },
    ],
  },
  {
    id: "cashflow",
    label: "Cash Flow",
    icon: <DollarSign className="w-5 h-5" />,
    source: "cashflow",
    rows: [
      { key: "Operating Cash Flow (B)", label: "Operating CF (B)", preferHigh: true },
      { key: "Free Cash Flow (B)", label: "Free CF (B)", preferHigh: true },
      { key: "Capital Expenditure (B)", label: "CapEx (B)" },
    ],
  },
];

// 风险维度对比（特别处理）
const RISK_DIMENSIONS = [
  { key: "profitability", label: "Profitability" },
  { key: "solvency", label: "Solvency" },
  { key: "cash_flow", label: "Cash Flow" },
  { key: "revenue_quality", label: "Revenue Quality" },
  { key: "valuation", label: "Valuation" },
];


function getMetric(snapshot: CompanySnapshot, source: string, key: string): number | null {
  const data = snapshot.financial as Record<string, Record<string, number | null>>;
  const section = data?.[source];
  if (!section) return null;
  const val = section[key];
  return typeof val === "number" ? val : null;
}

function formatNumber(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface Props {
  onClose?: () => void;
}

export function CompareView({ onClose }: Props) {
  const t = useT();
  const { lang } = useApp();
  const [storedState] = useState(loadCompareStoredState);
  const shouldRestoreStoredState = storedState?.lang === lang;
  const [tickerInput, setTickerInput] = useState(
    shouldRestoreStoredState ? storedState?.tickerInput ?? "" : ""
  );
  const [tickers, setTickers] = useState<string[]>(
    shouldRestoreStoredState && Array.isArray(storedState?.tickers) ? storedState.tickers : []
  );
  const [data, setData] = useState<CompareResponse | null>(
    shouldRestoreStoredState ? storedState?.data ?? null : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [compactControls, setCompactControls] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const workspaceActive =
    inputFocused ||
    Boolean(tickerInput.trim()) ||
    tickers.length > 0 ||
    loading ||
    Boolean(error) ||
    Boolean(data);

  useEffect(() => {
    try {
      localStorage.setItem(
        COMPARE_STORAGE_KEY,
        JSON.stringify({ tickerInput, tickers, data, lang })
      );
    } catch {}
  }, [tickerInput, tickers, data]);

  const addTicker = () => {
    const nextTicker = tickerInput.trim().toUpperCase();
    if (!nextTicker) return;
    if (tickers.includes(nextTicker)) {
      setError(t("compareAlready"));
      return;
    }
    if (tickers.length >= MAX_COMPANIES) {
      setError(t("compareMax4"));
      return;
    }
    setTickers([...tickers, nextTicker]);
    setTickerInput("");
    setError(null);
  };

  const removeTicker = (idx: number) => {
    setTickers(tickers.filter((_, i) => i !== idx));
    setData(null);
  };

  const runCompare = async () => {
    if (tickers.length < 2) {
      setError(t("compareNeed2"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.compare({ tickers, lang });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("compareFailed"));
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
    setData(null);
    setError(null);
    setLoading(false);
    setTickerInput("");
    setTickers([]);
    setInputFocused(false);
  };

  // PDF 导出由 ExportPDFButton 组件处理（targetId="compare-content"）

  const numCols = data?.companies.length || 0;

  return (
    <section className="relative">
      <motion.div
        animate={{
          opacity: workspaceActive ? 0.2 : 1,
          filter: workspaceActive ? "blur(8px)" : "blur(0px)",
        }}
        transition={{ duration: 0.35 }}
        className={workspaceActive ? "h-[320px] overflow-hidden" : ""}
      >
        <CompareIntro />
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
      {/* 顶部输入区 */}
      <div>
        {!compactControls && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          {workspaceActive ? (
            <button
              type="button"
              onClick={backToIntro}
              className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("analysisBackToIntro")}
            </button>
          ) : (
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t("compareHeaderSubtitle")}
            </div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          )}
        </div>
        )}

        {!compactControls && (
        <div className="flex gap-2 flex-wrap mb-3">
          {tickers.map((tk, i) => (
            <motion.div
              key={tk}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 rounded-full text-sm font-medium border border-blue-200 dark:border-blue-900"
            >
              <span>{tk}</span>
              <button
                onClick={() => removeTicker(i)}
                className="hover:bg-blue-100 dark:hover:bg-blue-900 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={tickerInput}
              onFocus={() => setInputFocused(true)}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              placeholder={t("compareTickerPlaceholder")}
              disabled={tickers.length >= MAX_COMPANIES}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none ${
                compactControls ? "bg-white/60 dark:bg-slate-950/55" : "bg-white dark:bg-slate-800"
              }`}
            />
          </div>
          {!compactControls && <button
            onClick={addTicker}
            disabled={!tickerInput.trim() || tickers.length >= MAX_COMPANIES}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm font-medium flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t("compareAdd")}
          </button>}
          {!compactControls && <button
            onClick={runCompare}
            disabled={tickers.length < 2 || loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("compareRun")}
          </button>}
        </div>

        {!compactControls && error && (
          <p className="text-sm text-rose-600 dark:text-rose-400 mt-2">{error}</p>
        )}
      </div>
    </div>
      </motion.div>

      {/* 对比结果区 */}
      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            id="compare-content"
            className="mt-10 space-y-8"
          >
            {/* 顶部：公司名 + 风险评分 */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div
                  className="grid gap-4 mb-2"
                  style={{ gridTemplateColumns: `200px repeat(${numCols}, minmax(0, 1fr))` }}
                >
                  <div></div>
                  {data.companies.map((c) => (
                    <div key={c.company.ticker} className="text-center">
                      <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {c.company.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.company.ticker}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <ExportPDFButton
                targetId="compare-content"
                filename={`compare-${tickers.join("-")}.pdf`}
                label={t("exportPdf")}
              />
            </div>

            {/* 风险评分卡片 */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `200px repeat(${numCols}, minmax(0, 1fr))` }}
            >
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 self-center">
                {t("compareRiskScore")}
              </div>
              {data.companies.map((c) => {
                const score = c.risk.overall_score ?? 0;
                const level = c.risk.risk_level || "low";
                const levelStyle = {
                  low: "from-emerald-500 to-green-600",
                  medium_low: "from-sky-500 to-blue-600",
                  medium: "from-amber-500 to-orange-600",
                  medium_high: "from-orange-500 to-rose-600",
                  high: "from-rose-500 to-red-600",
                }[level];
                return (
                  <div
                    key={c.company.ticker}
                    className={`rounded-2xl p-4 text-center bg-gradient-to-br ${levelStyle} text-white`}
                  >
                    <div className="text-4xl font-bold tabular-nums">{score}</div>
                    <div className="text-xs opacity-90 mt-1">/100</div>
                    <div className="text-xs font-medium mt-2 capitalize">
                      {t(`riskLevel_${level}`)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 五维度雷达数据（用横条对比，比叠加雷达图清晰）*/}
            <CompareGroup
              icon={<Target className="w-5 h-5" />}
              label={t("compareDimensions")}
              hint={t("compareDimHint")}
            >
              <div className="space-y-2">
                {RISK_DIMENSIONS.map((dim) => (
                  <div
                    key={dim.key}
                    className="grid items-center gap-4"
                    style={{ gridTemplateColumns: `200px repeat(${numCols}, minmax(0, 1fr))` }}
                  >
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {t(`dim${dim.key === "cash_flow" ? "CashFlow" : dim.key === "revenue_quality" ? "RevenueQuality" : dim.key.charAt(0).toUpperCase() + dim.key.slice(1)}`)}
                    </div>
                    {data.companies.map((c) => {
                      const score =
                        (c.risk.dimension_scores as Record<string, number | undefined>)?.[
                          dim.key
                        ] ?? null;
                      const pct = score ?? 0;
                      const color =
                        pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
                      return (
                        <div key={c.company.ticker} className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className={`h-full ${color}`}
                            />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-8 text-right text-slate-700 dark:text-slate-300">
                            {score ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CompareGroup>

            {/* 各财务模块 */}
            {METRIC_GROUPS.map((group) => (
              <CompareGroup
                key={group.id}
                icon={group.icon}
                label={
                  group.id === "overview"
                    ? t("compareGroupOverview")
                    : group.id === "profitability"
                      ? t("compareGroupProfit")
                      : group.id === "balance"
                        ? t("compareGroupBalance")
                        : t("compareGroupCashflow")
                }
              >
                <div className="space-y-1">
                  {group.rows.map((row) => {
                    const values = data.companies.map((c) =>
                      getMetric(c, group.source, row.key)
                    );
                    const validValues = values.filter(
                      (v): v is number => v !== null
                    );
                    let bestIdx = -1;
                    if (row.preferHigh !== undefined && validValues.length > 1) {
                      const target = row.preferHigh
                        ? Math.max(...validValues)
                        : Math.min(...validValues);
                      bestIdx = values.findIndex((v) => v === target);
                    }

                    return (
                      <div
                        key={row.key}
                        className="grid items-center gap-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-b-0"
                        style={{
                          gridTemplateColumns: `200px repeat(${numCols}, minmax(0, 1fr))`,
                        }}
                      >
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {row.label}
                        </div>
                        {values.map((v, i) => (
                          <div
                            key={i}
                            className={`text-center text-sm tabular-nums ${
                              i === bestIdx
                                ? "font-bold text-emerald-600 dark:text-emerald-400"
                                : "text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {formatNumber(v)}
                            {i === bestIdx && (
                              <span className="ml-1 text-[10px] uppercase tracking-wide">
                                {t("compareBestValue")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CompareGroup>
            ))}

            <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-4 border-t border-slate-100 dark:border-slate-800">
              {t("compareBestValue")} · {t("comparePeriod")}: FY {data.period}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function CompareIntro() {
  const t = useT();
  const items = [
    { icon: GitCompare, title: t("compareIntroPeerTitle"), body: t("compareIntroPeerBody") },
    { icon: BarChart3, title: t("compareIntroMetricTitle"), body: t("compareIntroMetricBody") },
    { icon: Workflow, title: t("compareIntroOutputTitle"), body: t("compareIntroOutputBody") },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-56">
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
        <GitCompare className="h-4 w-4" />
        {t("compareIntroEyebrow")}
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
        <div>
          <h1 className="max-w-4xl text-4xl md:text-6xl font-bold tracking-tight text-slate-950 dark:text-white">
            {t("compareIntroTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            {t("compareIntroBody")}
          </p>
        </div>
        <div className="grid gap-3">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("compareIntroExampleLabel")}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {[t("compareIntroExampleA"), t("compareIntroExampleB"), t("compareIntroExampleC")].map((name, index) => (
                <div key={name} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{name}</div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${[82, 56, 71][index]}%` }}
                    />
                  </div>
                  <div className="mt-2 text-slate-500 dark:text-slate-400">
                    {[82, 56, 71][index]}/100
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>{t("compareIntroExampleMetric1")}</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("compareBestValue")}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>{t("compareIntroExampleMetric2")}</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("compareBestValue")}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("compareIntroExampleMetric3")}</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("compareBestValue")}</span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {t("compareIntroExampleBody")}
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

function CompareGroup({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600 dark:text-blue-400">{icon}</span>
        <h4 className="font-bold text-slate-900 dark:text-slate-100">{label}</h4>
        {hint && (
          <span className="text-xs text-slate-400 dark:text-slate-500">· {hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
