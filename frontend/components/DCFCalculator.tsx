/**
 * Model Builder - DCF 估值计算器 + 敏感性分析
 * 用户输入折现率、增长率、终值增长率，计算每股内在价值
 * 三档场景对比（保守 / 中性 / 激进）
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Loader2,
  TrendingUp,
  TrendingDown,
  Search,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { apiClient, type DCFResult, type SensitivityResult } from "@/lib/api";

export function DCFCalculator() {
  const [ticker, setTicker] = useState("AAPL");
  const [discountRate, setDiscountRate] = useState(10);  // 百分比
  const [growthRate, setGrowthRate] = useState(5);
  const [terminalGrowth, setTerminalGrowth] = useState(2.5);

  const [result, setResult] = useState<DCFResult | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        forecast_years: 5,
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
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            🧮 Model Builder · DCF Valuation
          </h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Discounted Cash Flow valuation with three-scenario sensitivity analysis
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SliderInput
            label="Discount Rate (WACC)"
            value={discountRate}
            min={5}
            max={20}
            step={0.5}
            unit="%"
            hint="Higher = more conservative"
            onChange={setDiscountRate}
          />
          <SliderInput
            label="FCF Growth Rate (5y)"
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

        <button
          onClick={runDCF}
          disabled={loading || !ticker.trim()}
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

            {/* 5 年 FCF 投影柱状图 */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-5">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 text-sm">
                5-Year FCF Projection (Present Value, $B)
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
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
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
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
          <Info className="w-3 h-3" />
          {hint}
        </p>
      )}
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
          <div className="text-xs opacity-70">Shares Out</div>
          <div className="font-semibold tabular-nums">
            {result.shares_outstanding?.toFixed(2) ?? "—"}B
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
