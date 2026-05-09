/**
 * MarketSection — wrapper that fetches market overview + sectors + attention
 * based on the currently selected market (US / CN / HK).
 *
 * Layout: Indices grid → Bubble heatmap (AttentionQuadrant) → Sector ranking table
 * For HK: shows "Coming soon" placeholder.
 */

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
    if (market === "hk") {
      // HK not yet supported on backend
      setIndices([]);
      setSectors([]);
      setAttention([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiClient.getMarkets(market as "us" | "cn"),
      apiClient.getSectors(market as "us" | "cn", "industry"),
      apiClient.getAttention(market as "us" | "cn", "industry"),
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

    return () => {
      cancelled = true;
    };
  }, [market]);

  // HK placeholder
  if (market === "hk") {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-purple-50 via-slate-50 to-purple-50 dark:from-purple-950/30 dark:via-slate-900 dark:to-purple-950/30 border border-purple-200/60 dark:border-purple-900/60 p-12 text-center">
        <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-2">
          Hong Kong market — Coming soon
        </p>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Hang Seng Index, H-shares, and HK individual stock analysis will be
          available in the next release.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-24">
      {/* Indices grid */}
      <MarketOverview
        data={indices}
        loading={loading}
        currencyPrefix={market === "us" ? "$" : ""}
      />

      {/* Bubble heatmap */}
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

      {/* Sector ranking table */}
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
