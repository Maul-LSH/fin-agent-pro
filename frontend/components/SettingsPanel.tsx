/**
 * 设置面板（增强版）
 * 包含：AI 配置、主题切换、语言切换
 */

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  KeyRound,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Monitor,
  Languages,
} from "lucide-react";
import { useApp, useT, type Theme, type Lang } from "@/lib/AppContext";

const PROVIDERS = [
  { value: "Claude (Anthropic)", label: "Claude", hint: "console.anthropic.com" },
  { value: "OpenAI", label: "OpenAI (GPT-4o)", hint: "platform.openai.com" },
  { value: "DeepSeek", label: "DeepSeek", hint: "platform.deepseek.com" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (config: { provider: string; apiKey: string }) => void;
  currentProvider?: string;
  currentApiKey?: string;
}

export function SettingsPanel({
  open,
  onClose,
  onSave,
  currentProvider = "Claude (Anthropic)",
  currentApiKey = "",
}: Props) {
  const { theme, lang, setTheme, setLang } = useApp();
  const t = useT();

  const [provider, setProvider] = useState(currentProvider);
  const [apiKey, setApiKey] = useState(currentApiKey);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setProvider(currentProvider);
    setApiKey(currentApiKey);
  }, [currentProvider, currentApiKey, open]);

  const handleSave = () => {
    onSave({ provider, apiKey: apiKey.trim() });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none"
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full pointer-events-auto max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between z-10">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t("settingsTitle")}
                </h3>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* 主题切换 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    <Sun className="w-4 h-4" />
                    {t("settingsTheme")}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "light" as Theme, icon: Sun, label: t("themeLight") },
                      { value: "system" as Theme, icon: Monitor, label: t("themeSystem") },
                      { value: "dark" as Theme, icon: Moon, label: t("themeDark") },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const active = theme === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setTheme(opt.value)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                            active
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-100 dark:ring-blue-900"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 ${
                              active
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-slate-600 dark:text-slate-400"
                            }`}
                          />
                          <span
                            className={`text-xs font-medium ${
                              active
                                ? "text-blue-900 dark:text-blue-100"
                                : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 语言切换 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    <Languages className="w-4 h-4" />
                    {t("settingsLanguage")}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "zh" as Lang, label: "中文" },
                      { value: "en" as Lang, label: "English" },
                    ].map((opt) => {
                      const active = lang === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setLang(opt.value)}
                          className={`p-3 rounded-xl border transition-all text-sm font-medium ${
                            active
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-100 dark:ring-blue-900 text-blue-900 dark:text-blue-100"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                  <h4 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 mb-3">
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    {t("settingsAi")}
                  </h4>

                  <div className="space-y-2 mb-4">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setProvider(p.value)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          provider === p.value
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-100 dark:ring-blue-900"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {p.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {p.hint}
                        </div>
                      </button>
                    ))}
                  </div>

                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t("settingsApiKey")}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {t("keyHint")}
                  </p>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!apiKey.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("save")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
