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
import { Sparkles, AlertTriangle } from "lucide-react";
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

interface Props {
  market: Market;
}

export function MarketSection({ market }: Props) {
  const t = useT();
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [attention, setAttention] = useState<AttentionSector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (market === "hk") {
      apiClient
        .getMarkets("hk")
        .then((m) => {
          if (!cancelled) setIndices(m);
        })
        .catch(() => {
          if (!cancelled) setIndices([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      Promise.all([
        apiClient.getMarkets(market),
        apiClient.getSectors(market, "industry"),
        apiClient.getAttention(market, "industry"),
      ])
        .then(([m, s, a]) => {
          if (!cancelled) {
            setIndices(m);
            setSectors(s);
            setAttention(a);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIndices([]);
            setSectors([]);
            setAttention([]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
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
            onClick={() => emit("open-floating-chat")}
            className="btn-apple btn-apple-primary"
          >
            {t("hkAnalysisCTA")}
          </button>
        </motion.div>
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

            <AttentionQuadrant data={attention} loading={loading} />
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
              <SectorTable data={sectors} showInflow={market === "cn"} />
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
            onClick={() => emit("open-floating-chat")}
            className="btn-apple btn-apple-primary"
          >
            {t("cnFallbackCTA")}
          </button>
        </motion.div>
      )}
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
