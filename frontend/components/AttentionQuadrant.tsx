"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Flame, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { AttentionSector } from "@/lib/api";
import { useT } from "@/lib/AppContext";

interface Props {
  data: AttentionSector[];
  loading?: boolean;
  onSelectSector?: (sector: AttentionSector) => void;
}

function computeVisuals(data: AttentionSector[]) {
  const valid = data.filter(
    (d) => d.attention_score !== null && d.volatility_score !== null
  );
  if (valid.length === 0) return [];

  const attentions = valid.map((d) => d.attention_score!);
  const volatilities = valid.map((d) => d.volatility_score!);
  const maxAtt = Math.max(...attentions);
  const minAtt = Math.min(...attentions);
  const maxVol = Math.max(...volatilities);
  const minVol = Math.min(...volatilities);

  const computeHeat = (d: AttentionSector) => {
    const att = d.attention_score!;
    const vol = d.volatility_score!;
    const aN = maxAtt > minAtt ? (att - minAtt) / (maxAtt - minAtt) : 0.5;
    const vN = maxVol > minVol ? (vol - minVol) / (maxVol - minVol) : 0.5;
    return aN * 0.6 + vN * 0.4;
  };

  const enriched = valid.map((d) => {
    const att = d.attention_score!;
    const vol = d.volatility_score!;
    const change = d.change_pct ?? 0;
    const aN = maxAtt > minAtt ? (att - minAtt) / (maxAtt - minAtt) : 0.5;
    const vN = maxVol > minVol ? (vol - minVol) / (maxVol - minVol) : 0.5;
    const heat = computeHeat(d);

    const minSize = 70;
    const maxSize = 180;
    const size = minSize + aN * (maxSize - minSize);

    let bgColor: string;
    let textColor: string;
    let glow: string;

    if (Math.abs(change) < 0.3) {
      bgColor = `rgba(148, 163, 184, ${0.15 + vN * 0.3})`;
      textColor = "text-slate-700 dark:text-slate-300";
      glow = "";
    } else if (change > 0) {
      const intensity = 0.3 + vN * 0.5;
      bgColor = `rgba(16, 185, 129, ${intensity})`;
      textColor = vN > 0.5 ? "text-white" : "text-emerald-900 dark:text-emerald-100";
      glow = vN > 0.7 ? "shadow-lg shadow-emerald-400/40" : "";
    } else {
      const intensity = 0.3 + vN * 0.5;
      bgColor = `rgba(239, 68, 68, ${intensity})`;
      textColor = vN > 0.5 ? "text-white" : "text-rose-900 dark:text-rose-100";
      glow = vN > 0.7 ? "shadow-lg shadow-rose-400/40" : "";
    }

    return {
      ...d,
      size,
      bgColor,
      textColor,
      glow,
      heat,
      isExtreme: heat > 0.75,
    };
  });

  enriched.sort((a, b) => b.heat - a.heat);
  return enriched;
}

export function AttentionQuadrant({ data, loading, onSelectSector }: Props) {
  const t = useT();
  const [hovered, setHovered] = useState<string | null>(null);
  const bubbles = useMemo(() => computeVisuals(data), [data]);

  if (loading) {
    return (
      <div className="rounded-3xl bg-slate-100 dark:bg-slate-800/40 h-[480px] animate-pulse" />
    );
  }

  if (bubbles.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-slate-400 dark:text-slate-500">
        {t("noData")}
      </div>
    );
  }

  const topHot = bubbles.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* 顶部：今日最热标签 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Flame className="w-4 h-4 text-orange-500" />
          <span className="font-medium">{t("todayHottest")}</span>
        </div>
        {topHot.map((b, i) => (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="px-3 py-1 rounded-full bg-gradient-to-r from-orange-100 to-rose-100 dark:from-orange-950/60 dark:to-rose-950/60 text-orange-900 dark:text-orange-100 text-xs font-medium border border-orange-200 dark:border-orange-900/50"
          >
            {b.label}
            {b.change_pct !== null && (
              <span className="ml-1 text-orange-700 dark:text-orange-300">
                {b.change_pct >= 0 ? "+" : ""}
                {b.change_pct.toFixed(2)}%
              </span>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* 简化的提示语 */}
      <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
        <p className="text-slate-500 dark:text-slate-400">
          {t("heatmapSubtitle")}
        </p>
        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>{t("legendUp")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>{t("legendDown")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span>{t("legendFlat")}</span>
          </div>
        </div>
      </div>

      {/* 气泡区：去掉外框 + 去掉 overflow-hidden 让 tooltip 不被裁 */}
      <div className="relative py-12 px-4">
        {/* 装饰性背景光晕（可选）*/}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-200/15 dark:bg-rose-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-200/15 dark:bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative flex flex-wrap items-center justify-center gap-5">
          {bubbles.map((bubble, i) => {
            const isHovered = hovered === bubble.label;
            const change = bubble.change_pct ?? 0;
            const isUp = change >= 0;

            return (
              <div key={bubble.label} className="relative">
                <motion.button
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: i * 0.04,
                    type: "spring",
                    damping: 15,
                    stiffness: 200,
                  }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  onMouseEnter={() => setHovered(bubble.label)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelectSector?.(bubble)}
                  className={`relative rounded-full flex flex-col items-center justify-center text-center font-medium transition-shadow ${bubble.glow} ${bubble.textColor} hover:shadow-xl cursor-pointer`}
                  style={{
                    width: bubble.size,
                    height: bubble.size,
                    backgroundColor: bubble.bgColor,
                    border:
                      bubble.isExtreme && isUp
                        ? "2px solid rgba(16, 185, 129, 0.6)"
                        : bubble.isExtreme && !isUp
                        ? "2px solid rgba(239, 68, 68, 0.6)"
                        : "1px solid rgba(255, 255, 255, 0.4)",
                  }}
                >
                  {bubble.isExtreme && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute -top-1 -right-1 w-4 h-4"
                    >
                      <Flame className="w-4 h-4 text-orange-500 fill-orange-400" />
                    </motion.div>
                  )}

                  <div
                    className="font-semibold leading-tight px-2"
                    style={{ fontSize: bubble.size > 130 ? "0.9rem" : "0.75rem" }}
                  >
                    {bubble.label.length > 16
                      ? bubble.label.slice(0, 14) + "..."
                      : bubble.label}
                  </div>
                  <div
                    className="flex items-center gap-0.5 mt-0.5 tabular-nums"
                    style={{ fontSize: bubble.size > 130 ? "0.8rem" : "0.7rem" }}
                  >
                    {isUp ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {isUp ? "+" : ""}
                    {change.toFixed(1)}%
                  </div>
                </motion.button>

                {/* Tooltip 提到外层，z-index 高，不会被裁 */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 5, scale: 0.95 }}
                      className="absolute z-50 left-1/2 -translate-x-1/2 mt-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl px-4 py-3 text-xs whitespace-nowrap shadow-2xl pointer-events-none border border-slate-700"
                      style={{
                        top: "100%",
                      }}
                    >
                      <div className="font-semibold mb-1.5 text-sm">
                        {bubble.label}
                      </div>
                      <div className="space-y-0.5 text-slate-300">
                        <div className="flex justify-between gap-4">
                          <span>Attention</span>
                          <span className="tabular-nums font-medium text-white">
                            {bubble.attention_score?.toFixed(2)}x
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Volatility</span>
                          <span className="tabular-nums font-medium text-white">
                            {bubble.volatility_score?.toFixed(2)}%
                          </span>
                        </div>
                        <div className="pt-1 mt-1 border-t border-slate-700 text-slate-400">
                          → click to view top 5
                        </div>
                      </div>
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 dark:bg-slate-800 rotate-45 border-l border-t border-slate-700" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-xs text-slate-400 dark:text-slate-500">
        {t("clickHint")}
      </div>
    </div>
  );
}
