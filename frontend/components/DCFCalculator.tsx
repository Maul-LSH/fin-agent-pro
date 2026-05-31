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
  type SensitivityResult,
  type ValuationContext,
  type WaccBreakdown,
} from "@/lib/api";
import { useT } from "@/lib/AppContext";
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
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) return;

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
  }, [ticker, storedState?.ticker, tickerOverride]);

  const runDCF = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setResultOverride(null);
    setSensitivityOverride(null);

    try {
      const params = {
        ticker: ticker.toUpperCase(),
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

  const handleBlankMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, button, a, textarea, select, [role='button']")) return;
    if (workspaceActive) {
      backToIntro();
    }
  };

  return (
    <section className="relative z-10" onMouseDownCapture={handleBlankMouseDown}>
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
              onChange={(e) => setTickerOverride(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && runDCF()}
              placeholder={t("dcfTickerPlaceholder")}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none ${
                compactControls ? "bg-white/60 dark:bg-slate-950/55" : "bg-white dark:bg-slate-800"
              }`}
            />
          </div>
        </div>

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

            {result.warning && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm">
                {translateDcfWarning(result.warning, t)}
              </div>
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
    { icon: BarChart3, title: t("dcfIntroContextTitle"), body: t("dcfIntroContextBody") },
    { icon: Workflow, title: t("dcfIntroOutputTitle"), body: t("dcfIntroOutputBody") },
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
                [t("dcfIntroExampleStep1"), "WACC"],
                [t("dcfIntroExampleStep2"), "FCF"],
                [t("dcfIntroExampleStep3"), "Value"],
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
              {t("dcfIntroWaccTitle")}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {[
                [t("dcfRiskFree"), "4.5%", t("dcfIntroSourceTreasury")],
                [t("dcfRawBeta"), "2.24", t("dcfIntroSourceMarket")],
                [t("dcfBeta"), "1.83", t("dcfIntroSourceAdjusted")],
                [t("dcfEquityRiskPremium"), "6.0%", t("dcfIntroSourceAssumption")],
              ].map(([label, value, source]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-3">
                  <span className="text-slate-600 dark:text-slate-400">{label}</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">{value}</span>
                  <span className="col-span-2 text-xs text-slate-400 dark:text-slate-500">{source}</span>
                </div>
              ))}
            </div>
            <div className="my-4 border-t border-slate-200 dark:border-slate-800" />
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-slate-500 dark:text-slate-400">{t("dcfOurDcfAnswer")}</div>
                <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">$128</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">{t("dcfMarketAnswer")}</div>
                <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">$142</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">{t("dcfAnalystAnswer")}</div>
                <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">$151</div>
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
