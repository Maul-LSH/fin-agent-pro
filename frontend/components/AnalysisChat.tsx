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
  ShieldCheck,
  FileText,
  Workflow,
  SearchCheck,
  Layers3,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiClient, type AnalyzeResponse } from "@/lib/api";
import { RiskDashboard } from "./RiskDashboard";
import { ExportPDFButton } from "./ExportPDFButton";
import { useT, useApp, type Lang } from "@/lib/AppContext";

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

const ANALYSIS_STORAGE_KEY = "fin-agent-analysis-state";

interface AnalysisStoredState {
  input: string;
  result: AnalyzeResponse | null;
  mode: "company" | "sector";
  lang: Lang;
}

function loadAnalysisStoredState(): Partial<AnalysisStoredState> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(ANALYSIS_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Partial<AnalysisStoredState>) : null;
  } catch {
    return null;
  }
}

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
  const [storedState] = useState(() => (initialQuery ? null : loadAnalysisStoredState()));
  const shouldRestoreStoredState = storedState?.mode === analysisMode && storedState?.lang === lang;
  const [input, setInput] = useState(
    initialQuery ?? (shouldRestoreStoredState ? storedState?.input ?? "" : "")
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(
    shouldRestoreStoredState ? storedState?.result ?? null : null
  );
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [compactControls, setCompactControls] = useState(false);
  const initialRunRef = useRef<string | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const examples = lang === "en" ? EXAMPLE_QUERIES_EN : EXAMPLE_QUERIES_ZH;
  const isSectorMode = analysisMode === "sector";
  const workspaceActive = inputFocused || Boolean(input.trim()) || loading || Boolean(result) || Boolean(error);
  const sectorTitle =
    initialQuery
      ?.replace(/^Analyze\s+/i, "")
      .replace(/^分析/, "")
      .split(/\s+and the key companies driving this move/i)[0]
      .split("相关板块和代表公司")[0]
      .trim() || "";
  const sectorSections = isSectorMode ? parseSectorSections(result?.analysis) : null;

  useEffect(() => {
    try {
      localStorage.setItem(
        ANALYSIS_STORAGE_KEY,
        JSON.stringify({ input, result, mode: analysisMode, lang })
      );
    } catch {}
  }, [input, result, analysisMode, lang]);

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

  const handleBackToIntro = () => {
    setResult(null);
    setError(null);
    setLoading(false);
    setInput("");
    setInputFocused(false);
  };

  useEffect(() => {
    if (!initialQuery) return;
    if (autoRunInitialQuery && apiKey && initialRunRef.current !== initialQuery) {
      initialRunRef.current = initialQuery;
      void handleSubmit(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, autoRunInitialQuery, apiKey]);

  useEffect(() => {
    const onScroll = () => setCompactControls(workspaceActive && window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [workspaceActive]);

  const queryComposer = (
    <div className="relative">
      <input
        type="text"
        value={input}
        onFocus={() => setInputFocused(true)}
        onBlur={() => {
          if (!input.trim() && !loading && !result) setInputFocused(false);
        }}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) handleSubmit();
        }}
        disabled={loading}
        placeholder={isSectorMode ? t("sectorChatPlaceholder") : t("chatPlaceholder")}
        className={`w-full px-5 pr-14 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none transition-all text-base shadow-sm backdrop-blur-xl ${
          compactControls
            ? "py-3 bg-white/60 dark:bg-slate-950/55"
            : "py-4 bg-white/95 dark:bg-slate-900/95"
        }`}
      />
      <button
        onClick={() => handleSubmit()}
        disabled={loading || !input.trim()}
        aria-label="Run analysis"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
      </button>
    </div>
  );

  return (
    <section className="relative">
      <motion.div
        animate={{
          opacity: workspaceActive ? 0.28 : 1,
          filter: workspaceActive ? "blur(10px)" : "blur(0px)",
          scale: workspaceActive ? 0.985 : 1,
        }}
        transition={{ duration: 0.35 }}
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.14),transparent_48%)]"
      />

      <motion.div
        animate={{
          opacity: workspaceActive ? 0.2 : 1,
          filter: workspaceActive ? "blur(8px)" : "blur(0px)",
        }}
        transition={{ duration: 0.35 }}
        className={workspaceActive ? "h-[320px] overflow-hidden" : "space-y-16"}
      >
        <AnalysisIntro
          isSectorMode={isSectorMode}
          onOpenSettings={onOpenSettings}
          apiKey={apiKey}
        />
      </motion.div>

      <motion.div
        layout
        className={
          workspaceActive
            ? "sticky top-20 z-30 mx-auto -mt-72 max-w-4xl px-0"
            : "relative z-20 mx-auto -mt-36 max-w-3xl px-0"
        }
      >
        <div
          ref={controlsRef}
          onClick={(e) => e.stopPropagation()}
          className={`rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-3 shadow-xl shadow-slate-200/50 dark:shadow-black/30 backdrop-blur-2xl transition-colors ${
            compactControls ? "bg-white/45 dark:bg-slate-950/45" : "bg-white/80 dark:bg-slate-950/80"
          }`}
        >
          {(result || error) && (
            <button
              type="button"
              onClick={handleBackToIntro}
              className="mb-3 inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("analysisBackToIntro")}
            </button>
          )}
          {queryComposer}
          {!compactControls && !loading && !result && !input.trim() && !workspaceActive && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {examples.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-full transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto mt-10 max-w-4xl border-y border-slate-200 dark:border-slate-800 py-10 text-center"
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
            className="mx-auto mt-10 max-w-4xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-5 flex gap-3"
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
            className="mt-10 space-y-8"
          >
            {/* PDF 导出按钮 */}
            {result && (
              <div className="flex justify-end">
                <ExportPDFButton
                  targetId="analysis-report"
                  filename={
                    result.company
                      ? `analysis-${result.company.ticker}.pdf`
                      : "sector-analysis.pdf"
                  }
                  label={t("exportPdfReport")}
                />
              </div>
            )}

            <div id="analysis-report" className="space-y-8">
            {isSectorMode && (
              <div className="overflow-hidden border-y border-cyan-200/80 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#082f49,#0f172a_58%,#111827)] text-white dark:border-cyan-900/70">
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
              <div className="bg-gradient-to-r from-slate-950 to-slate-800 dark:from-slate-900 dark:to-slate-800 text-white px-6 py-8 md:px-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">{t("identified")}</div>
                    <h4 className="text-2xl font-bold">{result.company.name}</h4>
                    <div className="text-sm text-slate-300 mt-1">
                      {result.company.ticker} ·{" "}
                      {result.company.market === "us"
                        ? t("usMarket")
                        : result.company.market === "hk"
                          ? t("hkMarket")
                          : t("cnMarket")}{" "}
                      · FY {result.resolved_period || result.intent.period}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md bg-white/10 px-2.5 py-1 text-slate-200">
                        {t("requestedPeriod")}: {result.requested_period || result.intent.period}
                      </span>
                      <span
                        className={`rounded-md px-2.5 py-1 ${
                          result.period_matched === false
                            ? "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/30"
                            : "bg-white/10 text-slate-200"
                        }`}
                      >
                        {t("actualFiscalYear")}: {result.actual_period_used || result.resolved_period || "—"}
                      </span>
                      <span className="rounded-md bg-white/10 px-2.5 py-1 text-slate-200">
                        {t("dataSource")}: {result.data_source || "unknown"}
                      </span>
                      {result.period_matched === false && (
                        <span className="rounded-md bg-amber-400/20 px-2.5 py-1 text-amber-100 ring-1 ring-amber-300/30">
                          {t("periodMismatch")}
                        </span>
                      )}
                      {result.is_stale && (
                        <span className="rounded-md bg-rose-400/20 px-2.5 py-1 text-rose-100 ring-1 ring-rose-300/30">
                          {t("staleData")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.intent.analysis_types.map((type) => {
                      return (
                        <span
                          key={type}
                          className="px-3 py-1 bg-white/10 rounded-full text-xs font-medium"
                        >
                          {type}
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
              <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-5 flex items-center gap-2">
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

function AnalysisIntro({
  isSectorMode,
  onOpenSettings,
  apiKey,
}: {
  isSectorMode: boolean;
  onOpenSettings: () => void;
  apiKey: string;
}) {
  const t = useT();

  const capabilitySections = [
    {
      icon: ShieldCheck,
      title: t("analysisIntroRiskTitle"),
      body: t("analysisIntroRiskBody"),
      items: [
        t("analysisIntroRiskItem1"),
        t("analysisIntroRiskItem2"),
        t("analysisIntroRiskItem3"),
      ],
    },
    {
      icon: Workflow,
      title: t("analysisIntroMethodTitle"),
      body: t("analysisIntroMethodBody"),
      items: [
        t("analysisIntroMethodItem1"),
        t("analysisIntroMethodItem2"),
        t("analysisIntroMethodItem3"),
      ],
    },
    {
      icon: FileText,
      title: t("analysisIntroOutputTitle"),
      body: t("analysisIntroOutputBody"),
      items: [
        t("analysisIntroOutputItem1"),
        t("analysisIntroOutputItem2"),
        t("analysisIntroOutputItem3"),
      ],
    },
  ];

  const workflow = [
    {
      icon: SearchCheck,
      label: t("analysisIntroFlow1"),
      detail: t("analysisIntroFlow1Body"),
    },
    {
      icon: Layers3,
      label: t("analysisIntroFlow2"),
      detail: t("analysisIntroFlow2Body"),
    },
    {
      icon: BarChart3,
      label: t("analysisIntroFlow3"),
      detail: t("analysisIntroFlow3Body"),
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-56">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
          <Sparkles className="h-4 w-4" />
          {t("analysisIntroEyebrow")}
        </div>
        <button
          onClick={onOpenSettings}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <SettingsIcon className="w-4 h-4" />
          {apiKey ? t("settingsBtn") : t("settingsBtnEmpty")}
        </button>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
        <div>
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl text-4xl md:text-6xl font-bold tracking-tight text-slate-950 dark:text-white"
          >
            {isSectorMode ? t("analysisIntroSectorTitle") : t("analysisIntroTitle")}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300"
          >
            {isSectorMode ? t("analysisIntroSectorBody") : t("analysisIntroBody")}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="grid gap-3"
        >
          {workflow.map(({ icon: Icon, label, detail }) => (
            <div
              key={label}
              className="border-l-2 border-slate-200 dark:border-slate-800 py-3 pl-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                {label}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {detail}
              </p>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {capabilitySections.map(({ icon: Icon, title, body, items }, index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.16 + index * 0.06 }}
            className="border-t border-slate-200 dark:border-slate-800 pt-5"
          >
            <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">
              {title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {body}
            </p>
            <div className="mt-4 space-y-2">
              {items.map((item) => (
                <div key={item} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
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
