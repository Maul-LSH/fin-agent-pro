"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Loader2,
  AlertCircle,
  Settings as SettingsIcon,
  Radar,
  Waves,
  Building2,
  CircleHelp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiClient, type AnalyzeResponse } from "@/lib/api";
import { RiskDashboard } from "./RiskDashboard";
import { ExportPDFButton } from "./ExportPDFButton";
import { useT, useApp } from "@/lib/AppContext";

interface Props {
  apiKey: string;
  provider: string;
  onOpenSettings: () => void;
  initialQuery?: string;
  autoRunInitialQuery?: boolean;
  analysisMode?: "company" | "sector";
}

const EXAMPLE_QUERIES_ZH = [
  "分析苹果 2024 年的财务状况",
  "Tesla 估值合理吗",
  "茅台财务有什么风险",
  "宁德时代 2023 年财务分析",
];

const EXAMPLE_QUERIES_EN = [
  "Analyze Apple's 2024 financials",
  "Is Tesla overvalued?",
  "What are NVIDIA's risks?",
  "Microsoft cash flow analysis",
];

export function AnalysisChat({
  apiKey,
  provider,
  onOpenSettings,
  initialQuery,
  autoRunInitialQuery = false,
  analysisMode = "company",
}: Props) {
  const t = useT();
  const { lang } = useApp();
  const [input, setInput] = useState(initialQuery ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialRunRef = useRef<string | null>(null);

  const examples = lang === "en" ? EXAMPLE_QUERIES_EN : EXAMPLE_QUERIES_ZH;
  const isSectorMode = analysisMode === "sector";
  const sectorTitle =
    initialQuery
      ?.replace(/^Analyze\s+/i, "")
      .replace(/^分析/, "")
      .split(/\s+and the key companies driving this move/i)[0]
      .split("相关板块和代表公司")[0]
      .trim() || "";
  const sectorSections = isSectorMode ? parseSectorSections(result?.analysis) : null;

  const handleSubmit = async (text?: string) => {
    const query = text ?? input;
    if (!query.trim()) return;

    if (!apiKey) {
      onOpenSettings();
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiClient.analyze({
        user_input: query,
        llm_api_key: apiKey,
        provider,
        lang,
        analysis_mode: analysisMode,
      });
      setResult(res);
      if (text) setInput("");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Analysis failed";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialQuery) return;
    if (autoRunInitialQuery && apiKey && initialRunRef.current !== initialQuery) {
      initialRunRef.current = initialQuery;
      void handleSubmit(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, autoRunInitialQuery, apiKey]);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("chatTitle")}
          </h3>
        </div>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <SettingsIcon className="w-4 h-4" />
          {apiKey ? t("settingsBtn") : t("settingsBtnEmpty")}
        </button>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 dark:from-blue-950/30 dark:via-slate-900 dark:to-indigo-950/20 border border-blue-100 dark:border-blue-900/50 p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {isSectorMode ? t("sectorChatPrompt") : t("chatPrompt")}
            </h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {isSectorMode ? t("sectorChatHint") : t("chatHint")}
            </p>
          </div>

          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) handleSubmit();
              }}
              disabled={loading}
              placeholder={isSectorMode ? t("sectorChatPlaceholder") : t("chatPlaceholder")}
              className="w-full px-5 py-4 pr-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none transition-all text-base shadow-sm"
            />
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          {!loading && !result && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {examples.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-full transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center"
          >
            <div className="inline-flex items-center gap-3 text-slate-600 dark:text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>{t("loadingMsg")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-5 flex gap-3"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-900 dark:text-rose-100">
                {t("errorTitle")}
              </div>
              <div className="text-sm text-rose-700 dark:text-rose-300 mt-1">
                {error}
              </div>
              <div className="text-xs text-rose-600 dark:text-rose-400 mt-2">
                {t("errorHint")}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && result.status === "ok" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* PDF 导出按钮 */}
            {result.company && !isSectorMode && (
              <div className="flex justify-end">
                <ExportPDFButton
                  targetId="analysis-report"
                  filename={`analysis-${result.company.ticker}.pdf`}
                  label="Export PDF Report"
                />
              </div>
            )}

            <div id="analysis-report" className="space-y-4 bg-slate-50 dark:bg-slate-900 p-1 rounded-2xl">
            {isSectorMode && (
              <div className="overflow-hidden rounded-2xl border border-cyan-200/80 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#082f49,#0f172a_58%,#111827)] text-white dark:border-cyan-900/70">
                <div className="p-6 md:p-7">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200/80">
                        <Radar className="h-4 w-4" />
                        {t("sectorRadarEyebrow")}
                      </div>
                      <h4 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">
                        {sectorTitle || t("sectorRadarTitle")}
                      </h4>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                        {t("sectorRadarSubtitle")}
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-cyan-100">
                      {t("sectorRadarMode")}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {[
                      {
                        icon: Waves,
                        label: t("sectorRadarMove"),
                        body: t("sectorRadarMoveBody"),
                      },
                      {
                        icon: Building2,
                        label: t("sectorRadarCompanies"),
                        body: t("sectorRadarCompaniesBody"),
                      },
                      {
                        icon: CircleHelp,
                        label: t("sectorRadarUnknowns"),
                        body: t("sectorRadarUnknownsBody"),
                      },
                    ].map(({ icon: Icon, label, body }) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"
                      >
                        <Icon className="h-4 w-4 text-cyan-200" />
                        <div className="mt-3 text-sm font-semibold">{label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-300">{body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {result.company && result.intent && !isSectorMode && (
              <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 text-white p-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">{t("identified")}</div>
                    <h4 className="text-2xl font-bold">{result.company.name}</h4>
                    <div className="text-sm text-slate-300 mt-1">
                      {result.company.ticker} ·{" "}
                      {result.company.market === "us"
                        ? t("usMarket")
                        : t("cnMarket")}{" "}
                      · {result.intent.period}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.intent.analysis_types.map((type) => {
                      const labels: Record<string, string> = {
                        financial: "📊",
                        valuation: "💰",
                        risk: "⚠️",
                      };
                      return (
                        <span
                          key={type}
                          className="px-3 py-1 bg-white/10 rounded-full text-xs font-medium"
                        >
                          {labels[type] || ""} {type}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {result.risk && result.risk.overall_score !== null && !isSectorMode && (
              <RiskDashboard data={result.risk} />
            )}

            {result.analysis && (
              <>
              {isSectorMode && sectorSections && (
                <div className="grid gap-4 lg:grid-cols-3">
                  <SectorInsightCard
                    tone="cyan"
                    icon={Waves}
                    title={t("sectorRadarMove")}
                    content={sectorSections.move}
                  />
                  <SectorInsightCard
                    tone="blue"
                    icon={Building2}
                    title={t("sectorRadarCompanies")}
                    content={sectorSections.drivers}
                  />
                  <SectorInsightCard
                    tone="slate"
                    icon={CircleHelp}
                    title={t("sectorRadarUnknowns")}
                    content={sectorSections.unknowns}
                  />
                </div>
              )}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8">
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  {isSectorMode ? t("sectorAiDetail") : t("aiDetail")}
                </h4>
                <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-strong:text-slate-900 dark:prose-strong:text-slate-100 prose-li:text-slate-700 dark:prose-li:text-slate-300">
                  <ReactMarkdown>{result.analysis}</ReactMarkdown>
                </article>
              </div>
              </>
            )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && result.status === "no_company" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-5"
          >
            <div className="text-amber-900 dark:text-amber-100 font-medium">
              {result.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function parseSectorSections(markdown?: string) {
  if (!markdown) return null;

  const normalized = markdown.replace(/\r/g, "");
  const blocks = normalized
    .split(/\n(?=#{1,3}\s+)/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const findBlock = (patterns: RegExp[]) =>
    blocks.find((block) => patterns.some((pattern) => pattern.test(block)));

  const stripHeading = (block?: string) =>
    block
      ?.replace(/^#{1,3}\s+.*\n?/, "")
      .trim();

  const move = stripHeading(
    findBlock([
      /^#{1,3}\s*(1\.\s*)?(What moved|发生了什么)/i,
      /^#{1,3}\s*(1\.\s*)?(Move|异动)/i,
    ])
  );
  const drivers = stripHeading(
    findBlock([
      /^#{1,3}\s*(3\.\s*)?(Key companies driving this move|推动本轮走势的关键公司)/i,
      /^#{1,3}\s*(3\.\s*)?(Drivers|驱动)/i,
    ])
  );
  const unknowns = stripHeading(
    findBlock([
      /^#{1,3}\s*(4\.\s*)?(What remains uncertain|仍然未知的部分)/i,
      /^#{1,3}\s*(4\.\s*)?(Unknowns|未知)/i,
    ])
  );

  if (!move && !drivers && !unknowns) return null;
  return { move, drivers, unknowns };
}

function SectorInsightCard({
  icon: Icon,
  title,
  content,
  tone,
}: {
  icon: typeof Waves;
  title: string;
  content?: string;
  tone: "cyan" | "blue" | "slate";
}) {
  const toneClasses = {
    cyan: "border-cyan-200 bg-cyan-50/70 dark:border-cyan-900 dark:bg-cyan-950/20",
    blue: "border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/20",
    slate: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <article className="prose prose-sm prose-slate mt-4 max-w-none dark:prose-invert prose-p:my-2 prose-li:my-1 prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-li:text-slate-700 dark:prose-li:text-slate-300">
        <ReactMarkdown>{content || "—"}</ReactMarkdown>
      </article>
    </div>
  );
}
