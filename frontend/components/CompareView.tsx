/**
 * 多公司对比组件 — Apple-style 横向对比
 * 用户选 2-4 家公司 → 分模块对比（财务概览/盈利/估值/风险）
 * 数字最优的会高亮
 */

"use client";

import { useState } from "react";
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
} from "lucide-react";
import { apiClient, type CompanySnapshot, type CompareResponse } from "@/lib/api";
import { useT } from "@/lib/AppContext";
import { ExportPDFButton } from "./ExportPDFButton";

const MAX_COMPANIES = 4;

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
  const [tickerInput, setTickerInput] = useState("");
  const [tickers, setTickers] = useState<string[]>([]);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) {
      setError("Already added");
      return;
    }
    if (tickers.length >= MAX_COMPANIES) {
      setError(`Max ${MAX_COMPANIES} companies`);
      return;
    }
    setTickers([...tickers, t]);
    setTickerInput("");
    setError(null);
  };

  const removeTicker = (idx: number) => {
    setTickers(tickers.filter((_, i) => i !== idx));
    setData(null);
  };

  const runCompare = async () => {
    if (tickers.length < 2) {
      setError("Need at least 2 companies");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.compare({ tickers });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compare");
    } finally {
      setLoading(false);
    }
  };

  // PDF 导出由 ExportPDFButton 组件处理（targetId="compare-content"）

  const numCols = data?.companies.length || 0;

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* 顶部输入区 */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              📊 Compare Companies
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Add 2-4 tickers to compare side-by-side (Apple-style)
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          )}
        </div>

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

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              placeholder="e.g. AAPL, MSFT, GOOGL, 600519..."
              disabled={tickers.length >= MAX_COMPANIES}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none"
            />
          </div>
          <button
            onClick={addTicker}
            disabled={!tickerInput.trim() || tickers.length >= MAX_COMPANIES}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl text-sm font-medium flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
          <button
            onClick={runCompare}
            disabled={tickers.length < 2 || loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Compare
          </button>
        </div>

        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400 mt-2">{error}</p>
        )}
      </div>

      {/* 对比结果区 */}
      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            id="compare-content"
            className="p-6 space-y-8"
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
                label="Export PDF"
              />
            </div>

            {/* 风险评分卡片 */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `200px repeat(${numCols}, minmax(0, 1fr))` }}
            >
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 self-center">
                Risk Score
              </div>
              {data.companies.map((c) => {
                const score = c.risk.overall_score ?? 0;
                const level = c.risk.risk_level || "low";
                const levelStyle = {
                  low: "from-emerald-500 to-green-600",
                  medium: "from-amber-500 to-orange-600",
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
                      {level} risk
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 五维度雷达数据（用横条对比，比叠加雷达图清晰）*/}
            <CompareGroup
              icon={<Target className="w-5 h-5" />}
              label="5-Dimension Health"
              hint="Higher is healthier"
            >
              <div className="space-y-2">
                {RISK_DIMENSIONS.map((dim) => (
                  <div
                    key={dim.key}
                    className="grid items-center gap-4"
                    style={{ gridTemplateColumns: `200px repeat(${numCols}, minmax(0, 1fr))` }}
                  >
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {dim.label}
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
              <CompareGroup key={group.id} icon={group.icon} label={group.label}>
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
                            {i === bestIdx && <span className="ml-1">★</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CompareGroup>
            ))}

            <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-4 border-t border-slate-100 dark:border-slate-800">
              ★ = Best value among compared · Period: FY {data.period}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
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
