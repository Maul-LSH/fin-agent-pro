/**
 * 投资组合诊断组件
 * - 用户输入持仓（ticker + 权重 / 仓位金额）
 * - 持仓存在 localStorage（跟设置一样）
 * - 点击「AI 诊断」拉后端做加权风险评估
 * 
 * 设计原则：只诊断不推荐
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Layers,
  TrendingUp,
  ArrowLeft,
  ShieldCheck,
  PieChart as PieChartIcon,
  Workflow,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from "recharts";
import { apiClient, type PortfolioHolding, type PortfolioDiagnosis } from "@/lib/api";
import { ExportPDFButton } from "./ExportPDFButton";
import { useT } from "@/lib/AppContext";

const STORAGE_KEY = "fin-agent-portfolio";
const PORTFOLIO_UI_STORAGE_KEY = "fin-agent-portfolio-ui-state";

interface PortfolioStoredState {
  tickerInput: string;
  amountInput: string;
  diagnosis: PortfolioDiagnosis | null;
}

function loadStoredHoldings(): PortfolioHolding[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as PortfolioHolding[]) : [];
  } catch {
    return [];
  }
}

function loadPortfolioStoredState(): Partial<PortfolioStoredState> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(PORTFOLIO_UI_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Partial<PortfolioStoredState>) : null;
  } catch {
    return null;
  }
}

const SECTOR_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

export function PortfolioView() {
  const t = useT();
  const [storedUiState] = useState(loadPortfolioStoredState);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(loadStoredHoldings);
  const [tickerInput, setTickerInput] = useState(storedUiState?.tickerInput ?? "");
  const [amountInput, setAmountInput] = useState(storedUiState?.amountInput ?? "");
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [compactControls, setCompactControls] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const [diagnosis, setDiagnosis] = useState<PortfolioDiagnosis | null>(
    storedUiState?.diagnosis ?? null
  );
  const [loading, setLoading] = useState(false);
  const workspaceActive =
    inputFocused ||
    Boolean(tickerInput.trim()) ||
    Boolean(amountInput.trim()) ||
    holdings.length > 0 ||
    loading ||
    Boolean(error) ||
    Boolean(diagnosis);

  // 持仓变化时持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
    } catch {}
  }, [holdings]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PORTFOLIO_UI_STORAGE_KEY,
        JSON.stringify({ tickerInput, amountInput, diagnosis })
      );
    } catch {}
  }, [tickerInput, amountInput, diagnosis]);

  // 总仓位金额
  const totalAmount = holdings.reduce((sum, h) => sum + (h.amount || 0), 0);

  // 重新计算权重（基于金额比例）
  const computedHoldings: PortfolioHolding[] = totalAmount > 0
    ? holdings.map((h) => ({
        ...h,
        weight: (h.amount || 0) / totalAmount,
      }))
    : holdings.map((h) => ({ ...h, weight: 1 / Math.max(holdings.length, 1) }));

  const addHolding = () => {
    const ticker = tickerInput.trim().toUpperCase();
    const amount = parseFloat(amountInput);
    if (!ticker) {
      setError(t("tickerRequired"));
      return;
    }
    if (holdings.some((h) => h.ticker === ticker)) {
      setError(t("compareAlready"));
      return;
    }
    if (holdings.length >= 15) {
      setError(t("portfolioMax"));
      return;
    }
    setHoldings([
      ...holdings,
      {
        ticker,
        weight: 0, // 重新计算
        amount: isNaN(amount) ? 0 : amount,
      },
    ]);
    setTickerInput("");
    setAmountInput("");
    setError(null);
  };

  const removeHolding = (idx: number) => {
    setHoldings(holdings.filter((_, i) => i !== idx));
    setDiagnosis(null);
  };

  const updateAmount = (idx: number, amount: number) => {
    const next = [...holdings];
    next[idx] = { ...next[idx], amount };
    setHoldings(next);
  };

  const clearAll = () => {
    if (confirm(t("portfolioRemoveConfirm"))) {
      setHoldings([]);
      setDiagnosis(null);
    }
  };

  const runDiagnosis = async () => {
    if (computedHoldings.length === 0) {
      setError(t("portfolioNeedHolding"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.diagnosePortfolio(
        computedHoldings.map((h) => ({ ticker: h.ticker, weight: h.weight }))
      );
      setDiagnosis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("portfolioDiagnosisFailed"));
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
    setHoldings([]);
    setDiagnosis(null);
    setError(null);
    setLoading(false);
    setTickerInput("");
    setAmountInput("");
    setInputFocused(false);
  };

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
        <PortfolioIntro />
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
        {workspaceActive && (
          <button
            type="button"
            onClick={backToIntro}
            className="mb-3 inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("analysisBackToIntro")}
          </button>
        )}
        <div
          className={`grid grid-cols-1 gap-2 mb-3 ${
            compactControls ? "md:grid-cols-2" : "md:grid-cols-[1fr_1fr_auto]"
          }`}
        >
          <input
            value={tickerInput}
            onFocus={() => setInputFocused(true)}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addHolding()}
            placeholder={t("portfolioTickerPh")}
            className={`px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none ${
              compactControls ? "bg-white/60 dark:bg-slate-950/55" : "bg-white dark:bg-slate-800"
            }`}
          />
          <input
            type="number"
            value={amountInput}
            onFocus={() => setInputFocused(true)}
            onChange={(e) => setAmountInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHolding()}
            placeholder={t("portfolioAmountPh")}
            className={`px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none ${
              compactControls ? "bg-white/60 dark:bg-slate-950/55" : "bg-white dark:bg-slate-800"
            }`}
          />
          {!compactControls && <button
            onClick={addHolding}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t("portfolioAdd")}
          </button>}
        </div>
        {!compactControls && error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}

      {/* 持仓列表 */}
      {!compactControls && computedHoldings.length > 0 && (
        <div className="mt-4 space-y-2">
          {computedHoldings.map((h, i) => (
            <motion.div
              key={h.ticker}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="grid grid-cols-[80px_1fr_120px_80px_40px] items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
            >
              <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                {h.ticker}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                {h.name || "—"}
              </span>
              <input
                type="number"
                value={h.amount || ""}
                onChange={(e) =>
                  updateAmount(i, parseFloat(e.target.value) || 0)
                }
                placeholder="$"
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums text-right outline-none focus:border-blue-500"
              />
              <span className="text-sm font-medium tabular-nums text-blue-600 dark:text-blue-400 text-right">
                {(h.weight * 100).toFixed(1)}%
              </span>
              <button
                onClick={() => removeHolding(i)}
                className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-lg text-slate-400 hover:text-rose-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={clearAll}
              className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
            >
              {t("portfolioClearAll")}
            </button>
            <div className="text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t("portfolioTotal")}: </span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                ${totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 诊断按钮 */}
      {!compactControls && (
      <div className="mt-4">
        <button
          onClick={runDiagnosis}
          disabled={loading || computedHoldings.length === 0}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-700 dark:disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <TrendingUp className="w-5 h-5" />
          )}
          {loading ? t("portfolioAnalyzing") : t("portfolioDiagnose")}
        </button>
      </div>
      )}
      </div>
      </motion.div>

      {/* 诊断结果 */}
      <AnimatePresence>
        {diagnosis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            id="portfolio-diagnosis"
            className="mt-10 space-y-8"
          >
            <div className="flex justify-end">
              <ExportPDFButton
                targetId="portfolio-diagnosis"
                filename="portfolio-diagnosis.pdf"
                label={t("exportPdf")}
              />
            </div>

            <DiagnosisResult data={diagnosis} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function PortfolioIntro() {
  const t = useT();
  const items = [
    {
      icon: ShieldCheck,
      title: t("portfolioIntroRiskTitle"),
      body: t("portfolioIntroRiskBody"),
    },
    {
      icon: PieChartIcon,
      title: t("portfolioIntroExposureTitle"),
      body: t("portfolioIntroExposureBody"),
    },
    {
      icon: Workflow,
      title: t("portfolioIntroOutputTitle"),
      body: t("portfolioIntroOutputBody"),
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-56">
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
        <Briefcase className="h-4 w-4" />
        {t("portfolioIntroEyebrow")}
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
        <div>
          <h1 className="max-w-4xl text-4xl md:text-6xl font-bold tracking-tight text-slate-950 dark:text-white">
            {t("portfolioIntroTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            {t("portfolioIntroBody")}
          </p>
        </div>
        <div className="grid gap-3">
          {[t("portfolioIntroFlow1"), t("portfolioIntroFlow2"), t("portfolioIntroFlow3")].map((text) => (
            <div key={text} className="border-l-2 border-slate-200 dark:border-slate-800 py-3 pl-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {text}
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("portfolioIntroExampleLabel")}
          </div>
          <div className="mt-4 grid grid-cols-[140px_1fr] gap-5 items-center">
            <div className="relative aspect-square rounded-full bg-[conic-gradient(#3b82f6_0_42%,#10b981_42%_68%,#f59e0b_68%_84%,#ef4444_84%_100%)]">
              <div className="absolute inset-[24%] rounded-full bg-white dark:bg-slate-950 flex items-center justify-center text-center">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t("portfolioIntroPieCenter")}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["#3b82f6", t("portfolioIntroExampleTech")],
                ["#10b981", t("portfolioIntroExampleConsumer")],
                ["#f59e0b", t("portfolioIntroExampleCashflow")],
                ["#ef4444", t("portfolioIntroExampleRisk")],
              ].map(([color, label]) => (
                <div key={label} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {t("portfolioIntroExampleBody")}
          </p>
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

// ─────────────────────────────────────────
// 诊断结果展示
// ─────────────────────────────────────────
function DiagnosisResult({ data }: { data: PortfolioDiagnosis }) {
  const t = useT();
  const score = data.weighted_risk_score ?? 0;
  const level = data.weighted_risk_level || "low";
  const levelStyle = {
    low: "from-emerald-500 to-green-600",
    medium_low: "from-sky-500 to-blue-600",
    medium: "from-amber-500 to-orange-600",
    medium_high: "from-orange-500 to-rose-600",
    high: "from-rose-500 to-red-600",
  }[level];

  // 行业饼图数据
  const sectorPieData = data.sector_concentration.map((s, i) => ({
    name: s.sector,
    value: s.weight_pct,
    color: SECTOR_COLORS[i % SECTOR_COLORS.length],
  }));

  // 区域饼图数据
  const geoPieData = data.geo_distribution.map((g) => ({
    name: g.market === "US" ? t("usMarket") : t("cnMarket"),
    value: g.weight_pct,
    color: g.market === "US" ? "#3b82f6" : "#ef4444",
  }));

  return (
    <div className="space-y-6">
      {/* 顶部：加权风险评分 */}
      <div className={`rounded-2xl p-6 bg-gradient-to-br ${levelStyle} text-white shadow-lg`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="text-center">
            <div className="text-6xl font-bold tabular-nums">{score}</div>
            <div className="text-xs uppercase tracking-wide opacity-80 mt-1">
              {t("portfolioWeightedRisk")}
            </div>
            <div className="text-base font-semibold mt-2 capitalize">
              {t(`riskLevel_${level}`)}
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="text-base leading-relaxed mb-2">{data.summary}</p>
            <p className="text-xs opacity-75 italic">
              {t("portfolioPublicDataDisclaimer")}
            </p>
          </div>
        </div>
      </div>

      {/* 个股信号 */}
      {data.individual_signals.length > 0 && (
        <div>
          <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {t("portfolioSignals")} ({data.individual_signals.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.individual_signals.map((s, i) => {
              const isWarning = s.type === "warning";
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl border p-4 ${
                    isWarning
                      ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900"
                      : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isWarning ? (
                      <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                          {s.ticker}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md ${
                            isWarning
                              ? "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300"
                              : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {s.category}
                        </span>
                      </div>
                      <h5
                        className={`font-semibold text-sm ${
                          isWarning
                            ? "text-rose-900 dark:text-rose-100"
                            : "text-emerald-900 dark:text-emerald-100"
                        }`}
                      >
                        {s.title}
                      </h5>
                      <p
                        className={`text-xs mt-1 ${
                          isWarning
                            ? "text-rose-700 dark:text-rose-300"
                            : "text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {s.message}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* 集中度分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 行业集中度 */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t("portfolioSectorConcentration")}
          </h4>
          <div className="grid grid-cols-[1fr_1.2fr] gap-4 items-center">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorPieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {sectorPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      backgroundColor: "rgb(15 23 42)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {data.sector_concentration.map((s, i) => (
                <div key={s.sector} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                    />
                    <span className="truncate text-slate-700 dark:text-slate-300">
                      {s.sector}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {s.weight_pct.toFixed(1)}%
                    </span>
                    {s.warning && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        {s.warning}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 区域分布 */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t("portfolioGeoDistribution")}
          </h4>
          <div className="grid grid-cols-[1fr_1.2fr] gap-4 items-center">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={geoPieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {geoPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      backgroundColor: "rgb(15 23 42)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {data.geo_distribution.map((g) => (
                <div key={g.market} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: g.market === "US" ? "#3b82f6" : "#ef4444" }}
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {g.market === "US" ? t("usMarket") : t("cnMarket")}
                    </span>
                  </div>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {g.weight_pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 持仓明细 */}
      <div>
        <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-3">
          {t("portfolioHoldings")}
        </h4>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="grid grid-cols-[80px_1fr_120px_80px_120px] gap-3 px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <div>{t("portfolioTickerCol")}</div>
            <div>{t("portfolioNameCol")}</div>
            <div>{t("portfolioSectorCol")}</div>
            <div className="text-right">{t("portfolioWeightCol")}</div>
            <div className="text-right">{t("compareRiskScore")}</div>
          </div>
          {data.holdings_detail.map((h) => {
            const dotColor =
              h.risk_level === "high"
                ? "bg-rose-500"
                : h.risk_level === "medium_high"
                ? "bg-orange-500"
                : h.risk_level === "medium"
                ? "bg-amber-500"
                : h.risk_level === "medium_low"
                ? "bg-sky-500"
                : "bg-emerald-500";
            return (
              <div
                key={h.ticker}
                className="grid grid-cols-[80px_1fr_120px_80px_120px] gap-3 px-4 py-2.5 text-sm border-b border-slate-50 dark:border-slate-800/50 last:border-b-0"
              >
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {h.ticker}
                </div>
                <div className="text-slate-700 dark:text-slate-300 truncate">
                  {h.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {h.sector}
                </div>
                <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {h.weight_pct.toFixed(1)}%
                </div>
                <div className="text-right flex items-center justify-end gap-2">
                  {h.risk_score !== null && (
                    <>
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {h.risk_score}
                      </span>
                    </>
                  )}
                  {h.risk_score === null && (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 错误信息 */}
      {data.errors.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="font-semibold mb-1">{t("portfolioSomeDataMissing")}</div>
          {data.errors.map((e, i) => (
            <div key={i}>· {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}
