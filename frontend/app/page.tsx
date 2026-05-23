/**
 * Apple-style scroll narrative homepage
 *
 * Hero
 *  ↓
 * 1. DCF Valuation         → /valuation
 *  ↓
 * 2. Market Overview      → /markets/us
 *  ↓
 * 3. Sector Heatmap       → /markets/us
 *  ↓
 * 4. AI Financial Analysis → opens floating chat
 *  ↓
 * 5. Multi-Company Compare → /compare
 *  ↓
 * 6. Portfolio Diagnostic  → /portfolio
 *  ↓
 * Footer
 */

"use client";

import { useRef } from "react";
import {
  BarChart3,
  Flame,
  Sparkles,
  GitCompare,
  Briefcase,
  TrendingUp,
} from "lucide-react";
import { Hero } from "@/components/Hero";
import { FeatureSection } from "@/components/FeatureSection";
import { useT } from "@/lib/AppContext";

export default function HomePage() {
  const t = useT();
  const featuresRef = useRef<HTMLDivElement>(null);

  const scrollToFeatures = () =>
    featuresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="min-h-screen">
      <Hero onLearnMore={scrollToFeatures} />

      <div ref={featuresRef} id="features">
        {/* 1. DCF Valuation */}
        <FeatureSection
          icon={TrendingUp}
          iconColor="text-rose-500"
          bgClass="from-rose-50 via-slate-50 to-rose-50 dark:from-rose-950/30 dark:via-slate-900 dark:to-rose-950/30"
          eyebrow={t("featDcfEyebrow")}
          title={t("featDcfTitle")}
          body={t("featDcfBody")}
          ctaLabel={t("learnMore")}
          ctaHref="/valuation"
          visualKind="dcf"
        />

        {/* 2. Market Overview */}
        <FeatureSection
          icon={BarChart3}
          iconColor="text-blue-500"
          bgClass="from-blue-50 via-slate-50 to-blue-50 dark:from-blue-950/30 dark:via-slate-900 dark:to-blue-950/30"
          eyebrow={t("featMarketEyebrow")}
          title={t("featMarketTitle")}
          body={t("featMarketBody")}
          visualKind="market"
          reversed
        />

        {/* 3. Sector Heatmap */}
        <FeatureSection
          icon={Flame}
          iconColor="text-orange-500"
          bgClass="from-orange-50 via-slate-50 to-orange-50 dark:from-orange-950/30 dark:via-slate-900 dark:to-orange-950/30"
          eyebrow={t("featHeatmapEyebrow")}
          title={t("featHeatmapTitle")}
          body={t("featHeatmapBody")}
          ctaLabel={t("learnMore")}
          ctaHref="/markets/us"
          visualKind="heatmap"
        />

        {/* 4. AI Financial Analysis */}
        <FeatureSection
          icon={Sparkles}
          iconColor="text-purple-500"
          bgClass="from-purple-50 via-slate-50 to-purple-50 dark:from-purple-950/30 dark:via-slate-900 dark:to-purple-950/30"
          eyebrow={t("featAiEyebrow")}
          title={t("featAiTitle")}
          body={t("featAiBody")}
          ctaLabel={t("tryIt")}
          ctaHref="/analysis"
          visualKind="ai"
          reversed
        />

        {/* 5. Multi-Company Compare */}
        <FeatureSection
          icon={GitCompare}
          iconColor="text-emerald-500"
          bgClass="from-emerald-50 via-slate-50 to-emerald-50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-emerald-950/30"
          eyebrow={t("featCompareEyebrow")}
          title={t("featCompareTitle")}
          body={t("featCompareBody")}
          ctaLabel={t("learnMore")}
          ctaHref="/compare"
          visualKind="compare"
        />

        {/* 6. Portfolio Diagnostic */}
        <FeatureSection
          icon={Briefcase}
          iconColor="text-amber-500"
          bgClass="from-amber-50 via-slate-50 to-amber-50 dark:from-amber-950/30 dark:via-slate-900 dark:to-amber-950/30"
          eyebrow={t("featPortfolioEyebrow")}
          title={t("featPortfolioTitle")}
          body={t("featPortfolioBody")}
          ctaLabel={t("learnMore")}
          ctaHref="/portfolio"
          visualKind="portfolio"
          reversed
        />
      </div>

      <footer className="px-6 py-12 mt-8 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {t("footerDisclaimer")}
          </p>
        </div>
      </footer>
    </main>
  );
}
