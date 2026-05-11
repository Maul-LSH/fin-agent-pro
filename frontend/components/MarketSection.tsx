/**
 * MarketSection — wrapper that fetches data based on selected market.
 *
 * Layout:
 * - US/CN: Indices grid → Bubble heatmap → Sector ranking table
 * - HK:    Indices grid + note about HK individual stock analysis (sectors not available)
 */

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
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
      // HK: only fetch indices (sectors and attention return empty arrays from backend)
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
      // US / CN: full data
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

  // Currency prefix per market
  const currencyPrefix =
    market === "us" ? "$" : market === "hk" ? "HK$" : "";

  if (market === "hk") {
    // HK: show indices + AI prompt card (no sectors / heatmap)
    return (
      <div className="space-y-24">
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

  return (
    <div className="space-y-24">
      <MarketOverview
        data={indices}
        loading={loading}
        currencyPrefix={currencyPrefix}
      />

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
          <p className="section-subtitle mt-4">
            {t("sectorHeatmapSubtitle")}
          </p>
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
    </div>
  );
}
