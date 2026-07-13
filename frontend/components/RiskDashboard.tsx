"use client";

import { motion } from "framer-motion";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  ShieldCheck,
  Shield,
  TrendingDown,
  Activity,
  DollarSign,
  Target,
  FileSearch,
  ClipboardCheck,
  CircleHelp,
  Route,
  CheckCircle2,
  Gauge,
} from "lucide-react";
import { useT } from "@/lib/AppContext";

interface RedFlag {
  category: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  metric?: string | number;
}

interface DimensionScores {
  profitability?: number;
  solvency?: number;
  cash_flow?: number;
  revenue_quality?: number;
  valuation?: number;
}

interface RiskData {
  overall_score: number | null;
  risk_level: RiskLevel | null;
  summary: string;
  altman_z?: {
    score: number;
    interpretation: string;
    risk_level: string;
    model?: string;
    model_name?: string;
    applicability?: string;
    distress_threshold?: number;
    safe_threshold?: number;
  } | null;
  industry_profile?: {
    type: string;
    confidence: number;
    sector?: string | null;
    industry?: string | null;
    signals: string[];
    recommended_model: string;
    altman_applicable: boolean;
    altman_variant?: string | null;
    note: string;
  } | null;
  beneish_m?: { score: number; interpretation: string; risk_level: string } | null;
  cash_quality?: {
    ratio: number | null;
    interpretation: string;
    risk_level: string;
  } | null;
  receivables?: {
    revenue_growth: number;
    ar_growth: number;
    diff: number;
    interpretation: string;
    risk_level: string;
  } | null;
  dimension_scores: DimensionScores;
  red_flags: RedFlag[];
  risk_scenarios?: RiskScenario[];
  disclosure_checks?: DisclosureCheck[];
  model_confidence?: {
    level: "low" | "medium" | "high";
    score: number;
    reasons: string[];
  } | null;
  risk_drivers?: Array<{
    title: string;
    description: string;
    severity: "high" | "medium" | "low";
    metric?: string | number | null;
  }>;
  mitigating_factors?: Array<{
    title: string;
    description: string;
    metric?: string | number | null;
  }>;
  stress_tests?: Array<{
    id: string;
    title: string;
    base_score: number;
    stressed_score: number;
    risk_level: RiskLevel;
    delta: number;
    summary: string;
  }>;
}

type RiskLevel = "low" | "medium_low" | "medium" | "medium_high" | "high";

interface RiskScenario {
  id: string;
  title: string;
  risk_level: "low" | "medium" | "high";
  score: number;
  summary: string;
  evidence: Array<{
    label: string;
    value: string | number;
    interpretation: string;
    severity: "high" | "medium" | "low";
  }>;
  disclosure_checks: DisclosureCheck[];
  missing_data: string[];
  next_steps: string[];
}

interface DisclosureCheck {
  scenario_id?: string;
  scenario_title?: string;
  section: string;
  focus: string;
  status: string;
}

interface Props {
  data: RiskData;
}

const LEVEL_COLORS = {
  low: { bg: "from-emerald-500 to-green-600", icon: ShieldCheck },
  medium_low: { bg: "from-sky-500 to-blue-600", icon: ShieldCheck },
  medium: { bg: "from-amber-500 to-orange-600", icon: Shield },
  medium_high: { bg: "from-orange-500 to-rose-600", icon: AlertTriangle },
  high: { bg: "from-rose-500 to-red-600", icon: AlertTriangle },
} satisfies Record<RiskLevel, { bg: string; icon: typeof ShieldCheck }>;

const SEVERITY_STYLES = {
  high: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-900",
    text: "text-rose-900 dark:text-rose-100",
    badge: "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300",
  },
  medium: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900",
    text: "text-amber-900 dark:text-amber-100",
    badge: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
  },
  low: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-900",
    text: "text-blue-900 dark:text-blue-100",
    badge: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
  },
};

export function RiskDashboard({ data }: Props) {
  const t = useT();
  const score = data.overall_score ?? 0;
  const level = data.risk_level ?? "low";
  const levelConfig = LEVEL_COLORS[level];
  const Icon = levelConfig.icon;

  const levelLabel = t(`riskLevel_${level}`);
  const basedOnText =
    data.industry_profile?.altman_applicable === false
      ? t("riskBasedOnNoAltman")
      : data.altman_z?.model === "z_double_prime"
        ? t("riskBasedOnZDoublePrime")
        : t("riskBasedOn");

  const dimLabels: Record<string, string> = {
    profitability: t("dimProfitability"),
    solvency: t("dimSolvency"),
    cash_flow: t("dimCashFlow"),
    revenue_quality: t("dimRevenueQuality"),
    valuation: t("dimValuation"),
  };

  const radarData = Object.entries(data.dimension_scores).map(([key, val]) => ({
    dimension: dimLabels[key] || key,
    value: val ?? 50,
    fullMark: 100,
  }));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-3xl p-8 bg-gradient-to-br ${levelConfig.bg} text-white shadow-lg`}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="flex justify-center">
            <ScoreGauge score={score} label={t("riskScoreLabel")} />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-6 h-6" />
              <span className="text-2xl font-bold">{levelLabel}</span>
            </div>
            <p className="text-white/90 text-base leading-relaxed">
              {data.summary}
            </p>
            <div className="mt-3 text-sm text-white/80">{basedOnText}</div>
          </div>
        </div>
      </motion.div>

      {data.industry_profile && (
        <IndustryModelCard profile={data.industry_profile} />
      )}

      {(data.model_confidence || (data.risk_drivers && data.risk_drivers.length > 0) || (data.mitigating_factors && data.mitigating_factors.length > 0)) && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {data.model_confidence && <ConfidenceCard confidence={data.model_confidence} />}
          {data.risk_drivers && data.risk_drivers.length > 0 && (
            <SignalListCard
              icon={<AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
              title={t("riskDriversTitle")}
              items={data.risk_drivers}
              tone="risk"
            />
          )}
          {data.mitigating_factors && data.mitigating_factors.length > 0 && (
            <SignalListCard
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              title={t("riskMitigantsTitle")}
              items={data.mitigating_factors}
              tone="mitigant"
            />
          )}
        </div>
      )}

      {data.stress_tests && data.stress_tests.length > 0 && (
        <StressTestPanel tests={data.stress_tests} />
      )}

      {data.red_flags.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {t("redFlagsTitle", { n: data.red_flags.length })}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.red_flags.map((flag, i) => {
              const s = SEVERITY_STYLES[flag.severity];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl border ${s.bg} ${s.border} p-5`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${s.badge}`}>
                      {flag.category}
                    </span>
                    {flag.metric !== undefined && (
                      <span className={`text-sm font-bold tabular-nums ${s.text}`}>
                        {flag.metric}
                      </span>
                    )}
                  </div>
                  <h5 className={`font-semibold ${s.text} mb-1`}>{flag.title}</h5>
                  <p className={`text-sm ${s.text} opacity-90`}>{flag.description}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {data.risk_scenarios && data.risk_scenarios.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-4"
        >
          <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {t("riskScenarioTitle")}
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("riskScenarioSubtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {data.risk_scenarios.map((scenario, i) => (
              <ScenarioCard key={scenario.id} scenario={scenario} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6"
        >
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t("radarTitle")}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            {t("radarSubtitle")}
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-3"
        >
          {data.altman_z && (
            <MetricCard
              icon={<Shield className="w-5 h-5" />}
              title={data.altman_z.model_name || t("metricAltman")}
              subtitle={
                data.altman_z.model === "z_double_prime"
                  ? t("metricAltmanZDoublePrimeSub")
                  : t("metricAltmanSub")
              }
              value={data.altman_z.score}
              level={data.altman_z.risk_level as "low" | "medium" | "high"}
              interpretation={data.altman_z.interpretation}
            />
          )}
          {data.beneish_m && (
            <MetricCard
              icon={<TrendingDown className="w-5 h-5" />}
              title={t("metricBeneish")}
              subtitle={t("metricBeneishSub")}
              value={data.beneish_m.score}
              level={data.beneish_m.risk_level as "low" | "medium" | "high"}
              interpretation={data.beneish_m.interpretation}
            />
          )}
          {data.cash_quality && (
            <MetricCard
              icon={<DollarSign className="w-5 h-5" />}
              title={t("metricCash")}
              subtitle={t("metricCashSub")}
              value={
                data.cash_quality.ratio !== null
                  ? `${data.cash_quality.ratio}x`
                  : "—"
              }
              level={data.cash_quality.risk_level as "low" | "medium" | "high"}
              interpretation={data.cash_quality.interpretation}
            />
          )}
          {data.receivables && (
            <MetricCard
              icon={<Activity className="w-5 h-5" />}
              title={t("metricAR")}
              subtitle={t("metricARSub")}
              value={`+${data.receivables.diff}%`}
              level={data.receivables.risk_level as "low" | "medium" | "high"}
              interpretation={data.receivables.interpretation}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function IndustryModelCard({
  profile,
}: {
  profile: NonNullable<RiskData["industry_profile"]>;
}) {
  const t = useT();
  const profileLabel = t(`industryProfile_${profile.type}`);
  const modelLabel = t(`riskModel_${profile.recommended_model}`);
  const note =
    profile.altman_applicable
      ? profile.altman_variant === "original"
        ? t("industryModelOriginalNote")
        : t("industryModelZDoublePrimeNote")
      : t("industryModelNotApplicableNote");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Route className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            {t("industryModelTitle")}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            {note}
          </p>
        </div>
        <div className="grid gap-2 text-sm md:min-w-72">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">{t("industryProfileLabel")}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 text-right">{profileLabel}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">{t("industryModelLabel")}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 text-right">{modelLabel}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">{t("industryConfidenceLabel")}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
              {Math.round(profile.confidence * 100)}%
            </span>
          </div>
        </div>
      </div>
      {profile.signals.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.signals.slice(0, 6).map((signal) => (
            <span
              key={signal}
              className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
            >
              {signal}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ConfidenceCard({
  confidence,
}: {
  confidence: NonNullable<RiskData["model_confidence"]>;
}) {
  const t = useT();
  const tone =
    confidence.level === "high"
      ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30"
      : confidence.level === "medium"
        ? "border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30"
        : "border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30";

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border ${tone} p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <Gauge className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          {t("modelConfidenceTitle")}
        </div>
        <span className="rounded-md bg-white/70 dark:bg-slate-900/70 px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {confidence.score}/100
        </span>
      </div>
      <div className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        {t(`confidence_${confidence.level}`)}
      </div>
      <div className="mt-3 space-y-2">
        {confidence.reasons.slice(0, 3).map((reason) => (
          <p key={reason} className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {reason}
          </p>
        ))}
      </div>
    </motion.article>
  );
}

function SignalListCard({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{ title: string; description: string; severity?: "high" | "medium" | "low"; metric?: string | number | null }>;
  tone: "risk" | "mitigant";
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
    >
      <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
        {icon}
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.slice(0, 4).map((item) => (
          <div key={`${title}-${item.title}`} className="border-l-2 border-slate-200 dark:border-slate-800 pl-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {item.title}
              </div>
              {item.metric !== undefined && item.metric !== null && (
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  tone === "risk"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                }`}>
                  {item.metric}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </motion.article>
  );
}

function StressTestPanel({
  tests,
}: {
  tests: NonNullable<RiskData["stress_tests"]>;
}) {
  const t = useT();
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
    >
      <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
        <Gauge className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        {t("stressTestsTitle")}
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {tests.map((test) => (
          <div key={test.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {test.title}
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {test.stressed_score}
              </span>
              <span className="pb-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                +{test.delta}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {test.summary}
            </p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function ScenarioCard({ scenario, index }: { scenario: RiskScenario; index: number }) {
  const t = useT();
  const levelStyle = {
    low: {
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
      ring: "border-emerald-200 dark:border-emerald-900",
      dot: "bg-emerald-500",
    },
    medium: {
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
      ring: "border-amber-200 dark:border-amber-900",
      dot: "bg-amber-500",
    },
    high: {
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
      ring: "border-rose-200 dark:border-rose-900",
      dot: "bg-rose-500",
    },
  }[scenario.risk_level];

  const topEvidence = scenario.evidence.slice(0, 3);
  const disclosureChecks = scenario.disclosure_checks.slice(0, 3);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index }}
      className={`rounded-2xl border bg-white dark:bg-slate-900 ${levelStyle.ring} p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${levelStyle.dot}`} />
            <h5 className="font-semibold text-slate-900 dark:text-slate-100">
              {scenario.title}
            </h5>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {scenario.summary}
          </p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${levelStyle.badge}`}>
          {scenario.score}/100
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {topEvidence.map((item) => (
          <div
            key={`${scenario.id}-${item.label}`}
            className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {item.label}
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {item.value}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {item.interpretation}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <ClipboardCheck className="w-4 h-4" />
            {t("riskDisclosureChecks")}
          </div>
          <div className="space-y-2">
            {disclosureChecks.map((check) => (
              <div key={`${scenario.id}-${check.section}`} className="text-xs">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {check.section}
                </div>
                <div className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  {check.focus}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <CircleHelp className="w-4 h-4" />
            {t("riskMissingData")}
          </div>
          {scenario.missing_data.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {scenario.missing_data.slice(0, 4).map((item) => (
                <span
                  key={`${scenario.id}-${item}`}
                  className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("riskNoMissingData")}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const radius = 70;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: 180, height: 180 }}>
      <svg width="180" height="180" className="-rotate-90">
        <circle
          cx="90"
          cy="90"
          r={radius}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={stroke}
          fill="transparent"
        />
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          stroke="white"
          strokeWidth={stroke}
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-bold tabular-nums">{score}</div>
        <div className="text-xs text-white/80 mt-1">{label}</div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  subtitle,
  value,
  level,
  interpretation,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: number | string;
  level: "low" | "medium" | "high";
  interpretation: string;
}) {
  const colors = {
    low: "border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30",
    medium: "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30",
    high: "border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30",
  };
  const dot = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-rose-500",
  };

  return (
    <div className={`rounded-2xl border ${colors[level]} p-4`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300">
            {icon}
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              {title}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dot[level]}`} />
          <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {value}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
        {interpretation}
      </p>
    </div>
  );
}
