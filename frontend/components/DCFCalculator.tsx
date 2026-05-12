/**
 * Model Builder - DCF 估值计算器 + 敏感性分析
 * 用户输入折现率、增长率、终值增长率，计算每股内在价值
 * 三档场景对比（保守 / 中性 / 激进）
 */

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Loader2,
  TrendingUp,
  TrendingDown,
  Search,
  Info,
  Sparkles,
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
  type WaccBreakdown,
} from "@/lib/api";

export function DCFCalculator() {
  const [ticker, setTicker] = useState("AAPL");
  const [discountRate, setDiscountRate] = useState(10);  // 百分比
  const [growthRate, setGrowthRate] = useState(5);
  const [terminalGrowth, setTerminalGrowth] = useState(2.5);

  const [assumptions, setAssumptions] = useState<DCFAssumptions | null>(null);
  const [assumptionsLoading, setAssumptionsLoading] = useState(false);
  const [result, setResult] = useState<DCFResult | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) return;

    const timer = window.setTimeout(async () => {
      setAssumptionsLoading(true);
      try {
        const next = await apiClient.dcfAssumptions(normalizedTicker);
        setAssumptions(next);
        if (!next.error) {
          setDiscountRate(Number((next.discount_rate * 100).toFixed(1)));
          setGrowthRate(Number((next.growth_rate * 100).toFixed(1)));
          setTerminalGrowth(Number((next.terminal_growth * 100).toFixed(1)));
        }
      } catch {
        setAssumptions(null);
      } finally {
        setAssumptionsLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [ticker]);

  const runDCF = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSensitivity(null);

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
        setResult(dcf);
        setSensitivity(sens);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "DCF calculation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 rounded-t-3xl">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            🧮 Model Builder · DCF Valuation
          </h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Two-stage DCF valuation with WACC build-up, net debt adjustment, and implied growth
        </p>
      </div>

      {/* 输入区 */}
      <div className="p-6 space-y-4 bg-slate-50/50 dark:bg-slate-800/30">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Ticker
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && runDCF()}
              placeholder="AAPL, MSFT, TSLA..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none"
            />
          </div>
        </div>

        {assumptions?.error && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-sm">
            {assumptions.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SliderInput
            label="Discount Rate (WACC)"
            value={discountRate}
            min={6}
            max={15}
            step={0.5}
            unit="%"
            hint={
              assumptionsLoading
                ? "Calculating suggested WACC..."
                : assumptions?.wacc_breakdown
                  ? "Suggested by CAPM + capital structure"
                  : "Higher = more conservative"
            }
            tooltip={
              assumptions?.wacc_breakdown ? (
                <WaccTooltip breakdown={assumptions.wacc_breakdown} />
              ) : undefined
            }
            onChange={setDiscountRate}
          />
          <SliderInput
            label="Stage 1 FCF Growth (5y)"
            value={growthRate}
            min={-5}
            max={25}
            step={0.5}
            unit="%"
            hint="Annual FCF growth assumption"
            onChange={setGrowthRate}
          />
          <SliderInput
            label="Terminal Growth"
            value={terminalGrowth}
            min={0}
            max={4}
            step={0.1}
            unit="%"
            hint="Long-term GDP-like growth"
            onChange={setTerminalGrowth}
          />
        </div>

        {assumptions?.warning && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm flex gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{assumptions.warning}</span>
          </div>
        )}

        <button
          onClick={runDCF}
          disabled={loading || !ticker.trim() || Boolean(assumptions?.error)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Calculator className="w-5 h-5" />
          )}
          {loading ? "Calculating..." : "Run DCF Valuation"}
        </button>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* 结果区 */}
      <AnimatePresence>
        {result && result.intrinsic_value_per_share && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 space-y-6"
          >
            {/* 主要结果卡片 */}
            <ValuationResultCard result={result} />

            {result.warning && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-sm">
                {result.warning}
              </div>
            )}

            {/* 10 年 FCF 投影柱状图 */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-5">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-sm">
                10-Year Two-Stage FCF Projection (Present Value, $B)
              </h4>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.projection}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      label={{
                        value: "Year",
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
                    <Bar dataKey="fcf" fill="#94a3b8" name="FCF (Future)" />
                    <Bar dataKey="pv" fill="#3b82f6" name="Present Value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 敏感性三档场景 */}
            {sensitivity && <SensitivityScenarios data={sensitivity} />}
          </motion.div>
        )}
      </AnimatePresence>
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
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 shadow-xl text-slate-700 dark:text-slate-200">
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Suggested WACC: {pct(breakdown.discount_rate)}
      </div>
      <div className="space-y-1">
        <TooltipRow label="Risk-free rate (10Y T)" value={pct(breakdown.risk_free_rate)} />
        <TooltipRow label="Beta" value={breakdown.beta.toFixed(2)} />
        <TooltipRow label="Equity risk premium" value={pct(breakdown.equity_risk_premium)} />
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800 my-2" />
      <div className="space-y-1">
        <TooltipRow label="Cost of equity" value={pct(breakdown.cost_of_equity)} />
        <TooltipRow label="Cost of debt (after tax)" value={pct(breakdown.after_tax_cost_of_debt)} />
        <TooltipRow label="Tax rate" value={pct(breakdown.tax_rate)} />
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800 my-2" />
      <div className="space-y-1">
        <TooltipRow label="Market cap weight" value={pct(breakdown.equity_weight)} />
        <TooltipRow label="Debt weight" value={pct(breakdown.debt_weight)} />
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

// ─────────────────────────────────────────
// 估值结果卡片
// ─────────────────────────────────────────
function ValuationResultCard({ result }: { result: DCFResult }) {
  const upside = result.upside_pct ?? 0;
  const isUndervalued = upside > 0;
  const cardStyle = isUndervalued
    ? "from-emerald-500 to-green-600"
    : "from-rose-500 to-red-600";

  return (
    <div className={`rounded-2xl p-6 bg-gradient-to-br ${cardStyle} text-white shadow-lg`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
            Intrinsic Value
          </div>
          <div className="text-4xl font-bold tabular-nums">
            ${result.intrinsic_value_per_share?.toFixed(2)}
          </div>
          <div className="text-sm opacity-80 mt-1">per share</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
            Current Price
          </div>
          <div className="text-3xl font-bold tabular-nums">
            ${result.current_price?.toFixed(2) ?? "—"}
          </div>
          <div className="text-sm opacity-80 mt-1">market price</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide opacity-80 mb-1">
            Upside / Downside
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
            {isUndervalued ? "potentially undervalued" : "potentially overvalued"}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-white/20 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs opacity-70">Current FCF</div>
          <div className="font-semibold tabular-nums">
            ${result.current_fcf?.toFixed(1) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Terminal Value (PV)</div>
          <div className="font-semibold tabular-nums">
            ${result.terminal_value_pv?.toFixed(0) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Enterprise Value</div>
          <div className="font-semibold tabular-nums">
            ${result.enterprise_value?.toFixed(0) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Equity Value</div>
          <div className="font-semibold tabular-nums">
            ${result.equity_value?.toFixed(0) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Shares Out</div>
          <div className="font-semibold tabular-nums">
            {result.shares_outstanding?.toFixed(2) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Net Debt</div>
          <div className="font-semibold tabular-nums">
            ${result.net_debt?.toFixed(1) ?? "—"}B
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Terminal % of EV</div>
          <div className="font-semibold tabular-nums">
            {result.terminal_value_pct?.toFixed(1) ?? "—"}%
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">Implied Growth</div>
          <div className="font-semibold tabular-nums">
            {result.implied_growth_rate !== null
              ? `${(result.implied_growth_rate * 100).toFixed(1)}%`
              : "—"}
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
  const order = ["conservative", "base", "optimistic"];
  const styles: Record<string, string> = {
    conservative: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900",
    base: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
    optimistic:
      "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  };

  return (
    <div>
      <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-sm">
        🎲 Sensitivity Analysis · Three Scenarios
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
                {s.label}
              </div>
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 mb-3">
                <div>WACC: {(s.discount_rate * 100).toFixed(1)}%</div>
                <div>Growth: {(s.growth_rate * 100).toFixed(1)}%</div>
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
                    {upside.toFixed(1)}% vs market
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">N/A</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
