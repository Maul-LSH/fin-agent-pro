"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles, Settings as SettingsIcon } from "lucide-react";
import { MarketOverview } from "@/components/MarketOverview";
import { SectorTable } from "@/components/SectorTable";
import { AttentionQuadrant } from "@/components/AttentionQuadrant";
import { SectorDetail } from "@/components/SectorDetail";
import { AnalysisChat } from "@/components/AnalysisChat";
import { SettingsPanel } from "@/components/SettingsPanel";
import { CompareView } from "@/components/CompareView";
import { DCFCalculator } from "@/components/DCFCalculator";
import {
  apiClient,
  type MarketIndex,
  type Sector,
  type AttentionSector,
} from "@/lib/api";
import { useT } from "@/lib/AppContext";

type MarketTab = "us" | "cn";
type ViewMode = "heatmap" | "rank";
type UsCategory = "industry" | "size";
type CnCategory = "industry" | "region";

const AI_STORAGE_KEY = "fin-agent-config";

export default function Home() {
  const t = useT();

  const [activeMarket, setActiveMarket] = useState<MarketTab>("us");
  const [viewMode, setViewMode] = useState<ViewMode>("heatmap");
  const [usCategory, setUsCategory] = useState<UsCategory>("industry");
  const [cnCategory, setCnCategory] = useState<CnCategory>("industry");

  const [usMarkets, setUsMarkets] = useState<MarketIndex[]>([]);
  const [cnMarkets, setCnMarkets] = useState<MarketIndex[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [attention, setAttention] = useState<AttentionSector[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState<{
    name: string;
    ticker?: string;
  } | null>(null);

  const [provider, setProvider] = useState("Claude (Anthropic)");
  const [apiKey, setApiKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.provider) setProvider(config.provider);
        if (config.apiKey) setApiKey(config.apiKey);
      }
    } catch {}
  }, []);

  const handleSaveConfig = (config: { provider: string; apiKey: string }) => {
    setProvider(config.provider);
    setApiKey(config.apiKey);
    try {
      localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(config));
    } catch {}
  };

  useEffect(() => {
    Promise.all([
      apiClient.getMarkets("us").catch(() => []),
      apiClient.getMarkets("cn").catch(() => []),
    ]).then(([us, cn]) => {
      setUsMarkets(us);
      setCnMarkets(cn);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const category = activeMarket === "us" ? usCategory : cnCategory;

    if (viewMode === "heatmap") {
      apiClient
        .getAttention(activeMarket, category)
        .then(setAttention)
        .catch(() => setAttention([]))
        .finally(() => setLoading(false));
    } else {
      apiClient
        .getSectors(activeMarket, category)
        .then(setSectors)
        .catch(() => setSectors([]))
        .finally(() => setLoading(false));
    }
  }, [activeMarket, usCategory, cnCategory, viewMode]);

  const currentMarkets = activeMarket === "us" ? usMarkets : cnMarkets;
  const currencyPrefix = activeMarket === "us" ? "$" : "";

  const handleSectorClick = (sector: Sector | AttentionSector) => {
    setSelectedSector({ name: sector.label, ticker: sector.ticker });
    setDetailOpen(true);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                fin-agent
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("appSubtitle")}
              </p>
            </div>
          </motion.div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm text-slate-500 dark:text-slate-400">
              {t("headerTagline")}
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              title={t("settingsTitle")}
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            {t("heroTitle1")}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              {t("heroTitle2")}
            </span>
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {t("heroSubtitle")}
          </p>
        </motion.section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {t("marketOverview")}
            </h3>
            <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1">
              {[
                { key: "us" as const, label: t("usMarket") },
                { key: "cn" as const, label: t("cnMarket") },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveMarket(tab.key)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    activeMarket === tab.key
                      ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <MarketOverview
            data={currentMarkets}
            currencyPrefix={currencyPrefix}
            loading={currentMarkets.length === 0}
          />
        </section>

        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {activeMarket === "us" ? t("usSectors") : t("cnSectors")}
            </h3>

            <div className="flex gap-2">
              <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1">
                {activeMarket === "us"
                  ? [
                      { key: "industry" as const, label: t("catIndustry") },
                      { key: "size" as const, label: t("catSize") },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setUsCategory(tab.key)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                          usCategory === tab.key
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))
                  : [
                      { key: "industry" as const, label: t("catIndustry") },
                      { key: "region" as const, label: t("catRegion") },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setCnCategory(tab.key)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                          cnCategory === tab.key
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
              </div>

              <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1">
                {[
                  { key: "heatmap" as const, label: t("viewHeatmap") },
                  { key: "rank" as const, label: t("viewRank") },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setViewMode(tab.key)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      viewMode === tab.key
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {viewMode === "heatmap" ? (
            <AttentionQuadrant
              data={attention}
              loading={loading}
              onSelectSector={handleSectorClick}
            />
          ) : (
            <SectorTable
              data={sectors}
              showInflow={activeMarket === "cn" && cnCategory === "industry"}
              onSelect={handleSectorClick}
            />
          )}
        </section>

        <AnalysisChat
          apiKey={apiKey}
          provider={provider}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* 多公司对比 */}
        <section className="space-y-4">
          <CompareView />
        </section>

        {/* DCF 估值计算器（Model Builder）*/}
        <section className="space-y-4">
          <DCFCalculator />
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-slate-500 dark:text-slate-500">
          <p>{t("footer")}</p>
        </div>
      </footer>

      {selectedSector && (
        <SectorDetail
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          sectorName={selectedSector.name}
          etfTicker={selectedSector.ticker}
          market={activeMarket}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
        currentProvider={provider}
        currentApiKey={apiKey}
      />
    </div>
  );
}
