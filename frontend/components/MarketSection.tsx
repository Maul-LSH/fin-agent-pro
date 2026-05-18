/**
 * MarketSection — fetches data based on selected market.
 *
 * Layout:
 * - US:    Indices grid → Bubble heatmap → Sector ranking table  (uses yfinance, always works)
 * - CN/HK: Same layout, but with a graceful banner if AkShare is unavailable
 *
 * If all index prices come back as null (AkShare/EastMoney rejecting requests),
 * shows a friendly "Market data temporarily unavailable" banner instead of
 * silent empty cards. AI analysis still works for individual stocks.
 */

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, X, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  apiClient,
  type MarketIndex,
  type Sector,
  type AttentionSector,
} from "@/lib/api";
import { MarketOverview } from "./MarketOverview";
import { SectorTable } from "./SectorTable";
import { AttentionQuadrant } from "./AttentionQuadrant";
import { useT, type Market } from "@/lib/AppContext";
import { emit } from "@/lib/events";

type MarketDetail =
  | { kind: "index"; item: MarketIndex }
  | { kind: "sector"; item: Sector | AttentionSector };

interface Props {
  market: Market;
}

export function MarketSection({ market }: Props) {
  const t = useT();
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [attention, setAttention] = useState<AttentionSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MarketDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (market === "hk") {
      const fetchHK = async () => {
        setLoading(true);
        try {
          const m = await apiClient.getMarkets("hk");
          if (!cancelled) setIndices(m);
        } catch {
          if (!cancelled) setIndices([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      void fetchHK();
    } else {
      const fetchMarket = async () => {
        setLoading(true);
        try {
          const [m, s, a] = await Promise.all([
            apiClient.getMarkets(market),
            apiClient.getSectors(market, "industry"),
            apiClient.getAttention(market, "industry"),
          ]);
          if (!cancelled) {
            setIndices(m);
            setSectors(s);
            setAttention(a);
          }
        } catch {
          if (!cancelled) {
            setIndices([]);
            setSectors([]);
            setAttention([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      void fetchMarket();
    }

    return () => {
      cancelled = true;
    };
  }, [market]);

  // Detect if data source is unavailable (all index prices null)
  const dataUnavailable =
    !loading &&
    indices.length > 0 &&
    indices.every((i) => i.price === null);
  const showAkShareBanner = dataUnavailable && (market === "cn" || market === "hk");

  // Currency prefix per market
  const currencyPrefix =
    market === "us" ? "$" : market === "hk" ? "HK$" : "";

  // ── HK layout: indices + AI prompt card ──
  if (market === "hk") {
    return (
      <div className="space-y-24">
        {showAkShareBanner && <DataUnavailableBanner />}

        <MarketOverview
          data={indices}
          loading={loading}
          currencyPrefix={currencyPrefix}
          onSelect={(item) => setDetail({ kind: "index", item })}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl bg-gradient-to-br from-purple-50 via-slate-50 to-purple-50 dark:from-purple-950/30 dark:via-slate-900 dark:to-purple-950/30 border border-purple-200/60 dark:border-purple-900/60 p-12 text-center"
        >
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-500" strokeWidth={1.5} />
          <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-3 tracking-tight">
            {t("hkAnalysisTitle")}
          </h3>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto mb-6 leading-relaxed">
            {t("hkAnalysisBody")}
          </p>
          <button
            onClick={() => emit("open-analysis-page")}
            className="btn-apple btn-apple-primary"
          >
            {t("hkAnalysisCTA")}
          </button>
        </motion.div>
        <MarketDetailDrawer
          detail={detail}
          market={market}
          currencyPrefix={currencyPrefix}
          onClose={() => setDetail(null)}
        />
      </div>
    );
  }

  // ── US / CN layout: full data ──
  return (
    <div className="space-y-24">
      {showAkShareBanner && <DataUnavailableBanner />}

      <MarketOverview
        data={indices}
        loading={loading}
        currencyPrefix={currencyPrefix}
        onSelect={(item) => setDetail({ kind: "index", item })}
      />

      {!showAkShareBanner && (
        <>
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10"
            >
              <h3 className="section-title text-slate-900 dark:text-slate-50">
                {t("sectorHeatmapTitle")}
              </h3>
              <p className="section-subtitle mt-4">{t("sectorHeatmapSubtitle")}</p>
            </motion.div>

            <AttentionQuadrant
              data={attention}
              loading={loading}
              onSelectSector={(item) => setDetail({ kind: "sector", item })}
            />
          </div>

          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10"
            >
              <h3 className="section-title text-slate-900 dark:text-slate-50">
                {t("sectorRankingTitle")}
              </h3>
            </motion.div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <SectorTable
                data={sectors}
                showInflow={market === "cn"}
                onSelect={(item) => setDetail({ kind: "sector", item })}
              />
            )}
          </div>
        </>
      )}

      {/* Always show AI prompt for CN/HK when data unavailable */}
      {showAkShareBanner && market === "cn" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl bg-gradient-to-br from-red-50 via-slate-50 to-red-50 dark:from-red-950/30 dark:via-slate-900 dark:to-red-950/30 border border-red-200/60 dark:border-red-900/60 p-12 text-center"
        >
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-red-500" strokeWidth={1.5} />
          <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-3 tracking-tight">
            {t("cnFallbackTitle")}
          </h3>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto mb-6 leading-relaxed">
            {t("cnFallbackBody")}
          </p>
          <button
            onClick={() => emit("open-analysis-page")}
            className="btn-apple btn-apple-primary"
          >
            {t("cnFallbackCTA")}
          </button>
        </motion.div>
      )}
      <MarketDetailDrawer
        detail={detail}
        market={market}
        currencyPrefix={currencyPrefix}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

/**
 * Banner shown when AkShare/EastMoney is unavailable.
 * Localized message via t() keys.
 */
function DataUnavailableBanner() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-[14px] font-medium text-amber-900 dark:text-amber-100">
          {t("dataUnavailableTitle")}
        </p>
        <p className="text-[13px] text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
          {t("dataUnavailableBody")}
        </p>
      </div>
    </motion.div>
  );
}

function MarketDetailDrawer({
  detail,
  market,
  currencyPrefix,
  onClose,
}: {
  detail: MarketDetail | null;
  market: Market;
  currencyPrefix: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<{ date: string; close: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const item = detail?.item;
  const change = item?.change_pct ?? 0;
  const isUp = change >= 0;
  const title = item?.label ?? "";
  const ticker = item && "ticker" in item && item.ticker ? item.ticker : item && "code" in item ? item.code : undefined;
  const isSector = detail?.kind === "sector";
  const attention = item && isSector && "attention_score" in item ? item.attention_score : undefined;
  const volatility = item && isSector && "volatility_score" in item ? item.volatility_score : undefined;
  const inflow = item && isSector && "main_inflow_yi" in item ? item.main_inflow_yi : undefined;

  useEffect(() => {
    if (!detail || !item) return;
    let cancelled = false;
    const loadHistory = async () => {
      setHistory([]);
      setHistoryLoading(true);
      try {
        const identifier =
          detail.kind === "index"
            ? item.ticker || item.label
            : market === "us" && "ticker" in item && item.ticker
              ? item.ticker
              : item.label;
        const rows =
          detail.kind === "index"
            ? await apiClient.getMarketHistory(market, identifier, 90)
            : market === "hk"
              ? []
              : await apiClient.getSectorHistory(market, identifier, 90);
        if (!cancelled) {
          setHistory(
            rows
              .filter(([, close]) => typeof close === "number" && Number.isFinite(close))
              .map(([date, close]) => ({ date, close }))
          );
        }
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [detail, item, market]);

  if (!detail || !item) return null;

  const openAI = () => {
    const prompt =
      market === "cn"
        ? `分析${title}${ticker ? `（${ticker}）` : ""}相关板块和代表公司`
        : market === "hk"
          ? `Analyze ${title}${ticker ? ` (${ticker})` : ""} and related Hong Kong-listed companies`
          : `Analyze ${title}${ticker ? ` (${ticker})` : ""} and the key companies driving this move`;
    emit("open-analysis-page", { query: prompt, mode: isSector ? "sector" : "company" });
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 420, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
              {isSector ? "Sector detail" : "Market index"}
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {title}
            </h3>
            {ticker && (
              <div className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">
                {ticker}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <MetricTile
            label="Price"
            value={item.price !== null ? `${currencyPrefix}${item.price.toLocaleString()}` : "—"}
          />
          <MetricTile
            label="Change"
            value={item.change_pct !== null ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—"}
            tone={isUp ? "up" : "down"}
          />
          {attention !== undefined && (
            <MetricTile label="Attention" value={attention !== null ? `${attention.toFixed(2)}x` : "—"} />
          )}
          {volatility !== undefined && (
            <MetricTile label="Volatility" value={volatility !== null ? `${volatility.toFixed(2)}%` : "—"} />
          )}
          {inflow !== undefined && (
            <MetricTile
              label="Net inflow"
              value={inflow !== null && inflow !== undefined ? `${inflow >= 0 ? "+" : ""}${inflow.toFixed(2)} 亿` : "—"}
              tone={(inflow ?? 0) >= 0 ? "up" : "down"}
            />
          )}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              90-day movement
            </h4>
            <span className="text-xs text-slate-400">hover to inspect</span>
          </div>
          {historyLoading ? (
            <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-900 animate-pulse" />
          ) : history.length > 0 ? (
            <div className="h-64 rounded-2xl bg-slate-50 dark:bg-slate-900/70 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="marketDetailFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(value) => String(value).slice(5)}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    domain={["auto", "auto"]}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgb(15 23 42)",
                      border: "1px solid rgb(51 65 85)",
                      borderRadius: "10px",
                      color: "white",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "rgb(203 213 225)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke={isUp ? "#10b981" : "#ef4444"}
                    fill="url(#marketDetailFill)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 rounded-2xl bg-slate-50 dark:bg-slate-900/70 flex items-center justify-center text-sm text-slate-400">
              No historical data available
            </div>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            What this means
          </div>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
            {isSector
              ? "Use this as a starting point for sector-level analysis. The AI report can explain the move, surface likely drivers, and name the key companies behind the theme."
              : "Index moves are market context, not a company thesis. Use the AI page to turn this into a focused company or sector question."}
          </p>
        </div>

        <button
          type="button"
          onClick={openAI}
          className="mt-5 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          Open full AI analysis
        </button>
      </motion.aside>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const color =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-slate-100";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums flex items-center gap-1 ${color}`}>
        {tone === "up" && <TrendingUp className="w-4 h-4" />}
        {tone === "down" && <TrendingDown className="w-4 h-4" />}
        {value}
      </div>
    </div>
  );
}
