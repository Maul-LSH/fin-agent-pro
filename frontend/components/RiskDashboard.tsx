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
  risk_level: "low" | "medium" | "high" | null;
  summary: string;
  altman_z?: { score: number; interpretation: string; risk_level: string } | null;
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
}

interface Props {
  data: RiskData;
}

const LEVEL_COLORS = {
  low: { bg: "from-emerald-500 to-green-600", icon: ShieldCheck },
  medium: { bg: "from-amber-500 to-orange-600", icon: Shield },
  high: { bg: "from-rose-500 to-red-600", icon: AlertTriangle },
};

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

  const levelLabel =
    level === "high" ? t("riskHigh") : level === "medium" ? t("riskMedium") : t("riskLow");

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
            <div className="mt-3 text-sm text-white/80">{t("riskBasedOn")}</div>
          </div>
        </div>
      </motion.div>

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
              title={t("metricAltman")}
              subtitle={t("metricAltmanSub")}
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
