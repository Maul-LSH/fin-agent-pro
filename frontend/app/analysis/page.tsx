"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AnalysisChat } from "@/components/AnalysisChat";
import { useT } from "@/lib/AppContext";

const STORAGE_KEY = "fin-agent-config";

function loadSavedConfig() {
  if (typeof window === "undefined") {
    return { apiKey: "", provider: "Claude (Anthropic)" };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const cfg = JSON.parse(saved);
      return {
        apiKey: cfg.apiKey || "",
        provider: cfg.provider || "Claude (Anthropic)",
      };
    }
  } catch {}
  return { apiKey: "", provider: "Claude (Anthropic)" };
}

function AnalysisPageContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [config] = useState(loadSavedConfig);

  return (
    <main className="min-h-screen pt-12">
      <section className="px-6 pt-14 pb-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-400 font-semibold mb-3">
              AI Workspace
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {t("chatTitle")}
            </h1>
            <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-400 leading-7">
              Ask a full financial-analysis question and read the report in a proper workspace.
            </p>
          </motion.div>

          <AnalysisChat
            apiKey={config.apiKey}
            provider={config.provider}
            onOpenSettings={() => window.dispatchEvent(new Event("open-settings"))}
            initialQuery={initialQuery}
            autoRunInitialQuery={Boolean(initialQuery)}
          />
        </div>
      </section>
    </main>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisPageContent />
    </Suspense>
  );
}
