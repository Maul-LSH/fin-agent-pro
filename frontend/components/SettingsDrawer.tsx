/**
 * Settings drawer — slides in from the right
 * Replaces the old SettingsPanel modal
 */

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useApp, useT, type Theme, type Lang } from "@/lib/AppContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "fin-agent-config";

export function SettingsDrawer({ open, onClose }: Props) {
  const t = useT();
  const { theme, setTheme, lang, setLang } = useApp();

  const [provider, setProvider] = useState("Claude (Anthropic)");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.provider) setProvider(cfg.provider);
        if (cfg.apiKey) setApiKey(cfg.apiKey);
      }
    } catch {}
  }, [open]);

  const handleSave = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ provider, apiKey: apiKey.trim() })
      );
    } catch {}
    onClose();
  };

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md z-[70] bg-white dark:bg-slate-950 shadow-2xl overflow-y-auto"
          >
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
                {t("settingsTitle")}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-8 py-6 space-y-8">
              {/* Language */}
              <Section label={t("settingsLanguage")}>
                <SegmentedControl
                  value={lang}
                  onChange={(v) => setLang(v as Lang)}
                  options={[
                    { value: "en", label: "English" },
                    { value: "zh", label: "中文" },
                  ]}
                />
              </Section>

              {/* Theme */}
              <Section label={t("settingsTheme")}>
                <SegmentedControl
                  value={theme}
                  onChange={(v) => setTheme(v as Theme)}
                  options={[
                    { value: "light", label: t("themeLight") },
                    { value: "dark", label: t("themeDark") },
                    { value: "system", label: t("themeSystem") },
                  ]}
                />
              </Section>

              {/* AI provider */}
              <Section label={t("settingsAi")}>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[15px] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option>Claude (Anthropic)</option>
                  <option>OpenAI</option>
                  <option>DeepSeek</option>
                </select>
              </Section>

              {/* API key */}
              <Section label={t("settingsApiKey")}>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[15px] text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {t("keyHint")}
                </p>
              </Section>
            </div>

            <div className="px-8 py-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-full text-[15px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-full text-[15px] text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                {t("save")}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex w-full p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 text-[13px] rounded-lg transition-all ${
              active
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
