/**
 * Floating AI chat bubble — Intercom-style
 * - Fixed at bottom-right of viewport, never scrolls away
 * - Collapsed: small pill button
 * - Expanded: full chat panel sliding up
 * - Listens for global "open-floating-chat" event so other components
 *   (e.g. home page CTA) can trigger it
 */

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, MessageSquare, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnalysisChat } from "./AnalysisChat";
import { useT } from "@/lib/AppContext";
import { on } from "@/lib/events";

const STORAGE_KEY = "fin-agent-config";

interface Props {
  onOpenSettings: () => void;
}

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

export function FloatingChat({ onOpenSettings }: Props) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [config] = useState(loadSavedConfig);

  // Listen for global open event (from home page CTA)
  useEffect(() => {
    const off = on("open-floating-chat", () => setOpen(true));
    return off;
  }, []);

  useEffect(() => {
    const off = on<{ query?: string; mode?: "company" | "sector" }>("open-analysis-page", (detail) => {
      const params = new URLSearchParams();
      if (detail?.query) params.set("q", detail.query);
      if (detail?.mode) params.set("mode", detail.mode);
      const query = params.toString() ? `?${params.toString()}` : "";
      setOpen(false);
      router.push(`/analysis${query}`);
    });
    return off;
  }, [router]);

  return (
    <>
      <AnimatePresence>
        {!open && (
            <motion.button
            key="bubble"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-4 pr-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[14px] font-medium">{t("chatFloatingTitle")}</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="fixed bottom-6 right-6 left-6 md:left-auto md:w-[440px] z-50 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-950 rounded-3xl shadow-2xl border border-slate-200/60 dark:border-slate-800/60"
            >
              <div className="sticky top-0 px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm rounded-t-3xl z-10">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-50">
                  {t("chatTitle")}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push("/analysis");
                    }}
                    aria-label="Open full AI page"
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label={t("chatCollapse")}
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5">
                <AnalysisChat
                  apiKey={config.apiKey}
                  provider={config.provider}
                  onOpenSettings={onOpenSettings}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
