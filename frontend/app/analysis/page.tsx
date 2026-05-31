"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnalysisChat } from "@/components/AnalysisChat";

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
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialMode = searchParams.get("mode") === "sector" ? "sector" : "company";
  const [config] = useState(loadSavedConfig);

  return (
    <main className="min-h-screen pt-12">
      <section className="px-6 pt-10 pb-20">
        <div className="max-w-7xl mx-auto">
          <AnalysisChat
            apiKey={config.apiKey}
            provider={config.provider}
            onOpenSettings={() => window.dispatchEvent(new Event("open-settings"))}
            initialQuery={initialQuery}
            autoRunInitialQuery={Boolean(initialQuery)}
            analysisMode={initialMode}
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
