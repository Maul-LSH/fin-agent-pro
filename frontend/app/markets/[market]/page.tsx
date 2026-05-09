/**
 * Dynamic market page: /markets/us, /markets/cn, /markets/hk
 *
 * Reads market from URL param, syncs it to global AppContext,
 * and renders MarketSection with real data.
 */

"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MarketSection } from "@/components/MarketSection";
import { useApp, useT, type Market } from "@/lib/AppContext";

const VALID_MARKETS: Market[] = ["us", "cn", "hk"];

export default function MarketPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ market: string }>();
  const { setMarket } = useApp();

  const urlMarket = params?.market as Market;
  const isValid = VALID_MARKETS.includes(urlMarket);

  // Sync URL market → global state
  useEffect(() => {
    if (isValid) setMarket(urlMarket);
  }, [urlMarket, isValid, setMarket]);

  // Invalid market → redirect home
  useEffect(() => {
    if (!isValid) router.replace("/");
  }, [isValid, router]);

  if (!isValid) return null;

  const titleMap: Record<Market, string> = {
    us: t("navMarketUS"),
    cn: t("navMarketCN"),
    hk: t("navMarketHK"),
  };

  return (
    <main className="min-h-screen pt-12">
      <section className="pt-16 pb-12 px-6 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="hero-title text-slate-900 dark:text-slate-50">
            {titleMap[urlMarket]}
          </h1>
          <p className="hero-subtitle mt-4">
            {t("marketOverviewSubtitle")}
          </p>
        </motion.div>

        <MarketSection market={urlMarket} />
      </section>

      <footer className="px-6 py-12 mt-16 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {t("footerDisclaimer")}
          </p>
        </div>
      </footer>
    </main>
  );
}
