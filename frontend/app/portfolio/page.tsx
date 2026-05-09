"use client";

import { useEffect, useState } from "react";
import { PortfolioView } from "@/components/PortfolioView";

const STORAGE_KEY = "fin-agent-config";

export default function PortfolioPage() {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("Claude (Anthropic)");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.apiKey) setApiKey(cfg.apiKey);
        if (cfg.provider) setProvider(cfg.provider);
      }
    } catch {}
  }, []);

  return (
    <main className="min-h-screen pt-20 pb-32 px-6">
      <div className="max-w-7xl mx-auto">
        <PortfolioView apiKey={apiKey} provider={provider} />
      </div>
    </main>
  );
}
