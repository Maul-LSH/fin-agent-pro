/**
 * FeatureSection — Apple-style scroll narrative section
 * Title + body + CTA button + visual placeholder
 *
 * Alternates layout: even index = visual on right, odd = visual on left
 */

"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

interface Props {
  /** Lucide icon component to render in placeholder */
  icon: LucideIcon;
  /** Tailwind text color class for the icon, e.g. "text-blue-500" */
  iconColor?: string;
  /** Tailwind background gradient classes for placeholder */
  bgClass?: string;
  /** Section eyebrow / category label */
  eyebrow: string;
  /** Main title */
  title: string;
  /** Body paragraph */
  body: string;
  /** CTA button label */
  ctaLabel?: string;
  /** Either: target href OR an onClick handler */
  ctaHref?: string;
  ctaOnClick?: () => void;
  /** Whether to flip layout (visual on left) */
  reversed?: boolean;
  visualKind?: "market" | "heatmap" | "ai" | "compare" | "portfolio" | "dcf";
}

export function FeatureSection({
  icon: Icon,
  iconColor = "text-blue-500",
  bgClass = "from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900",
  eyebrow,
  title,
  body,
  ctaLabel,
  ctaHref,
  ctaOnClick,
  reversed = false,
  visualKind = "market",
}: Props) {
  const visual = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      className={`relative min-h-[520px] md:min-h-[680px] overflow-hidden bg-gradient-to-br ${bgClass} flex items-center justify-center`}
    >
      <FeatureVisual kind={visualKind} icon={Icon} iconColor={iconColor} />
    </motion.div>
  );

  const text = (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col justify-center px-6 py-20 md:px-16 lg:px-24"
    >
      <p className="text-[13px] font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3">
        {eyebrow}
      </p>
      <h2 className="section-title text-slate-900 dark:text-slate-50 mb-5">
        {title}
      </h2>
      <p className="section-subtitle leading-relaxed">{body}</p>

      {ctaLabel && (
        <div className="mt-8">
          {ctaHref ? (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1 text-[17px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            {ctaLabel}
            <ArrowRight className="w-4 h-4 mt-px" />
          </Link>
          ) : (
          <button
            onClick={ctaOnClick}
            className="inline-flex items-center gap-1 text-[17px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            {ctaLabel}
            <ArrowRight className="w-4 h-4 mt-px" />
          </button>
          )}
        </div>
      )}
    </motion.div>
  );

  return (
    <section className="min-h-screen">
      <div className="grid md:grid-cols-2 min-h-screen">
        {reversed ? (
          <>
            {visual}
            {text}
          </>
        ) : (
          <>
            {text}
            {visual}
          </>
        )}
      </div>
    </section>
  );
}

function FeatureVisual({
  kind,
  icon: Icon,
  iconColor,
}: {
  kind: NonNullable<Props["visualKind"]>;
  icon: LucideIcon;
  iconColor: string;
}) {
  if (kind === "heatmap") {
    const bubbles = [
      ["AI", 164, "bg-emerald-500/80", "left-[14%] top-[18%]"],
      ["Energy", 118, "bg-rose-500/75", "right-[14%] top-[22%]"],
      ["Banks", 136, "bg-blue-500/75", "left-[30%] bottom-[16%]"],
      ["Chips", 104, "bg-amber-500/80", "right-[28%] bottom-[22%]"],
      ["Cloud", 86, "bg-slate-500/60", "left-[58%] top-[48%]"],
    ] as const;
    return (
      <div className="absolute inset-0">
        {bubbles.map(([label, size, color, pos], i) => (
          <motion.div
            key={label}
            animate={{ y: [0, i % 2 ? 14 : -14, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
            className={`absolute ${pos} ${color} rounded-full text-white flex items-center justify-center font-semibold shadow-2xl`}
            style={{ width: size, height: size }}
          >
            {label}
          </motion.div>
        ))}
      </div>
    );
  }

  if (kind === "ai") {
    return (
      <div className="w-full max-w-xl px-8">
        <div className="rounded-[2rem] bg-white/90 dark:bg-slate-950/85 shadow-2xl p-6 space-y-4">
          {["Analyze Tesla margins", "Check cash-flow quality", "Find red flags"].map((text, i) => (
            <motion.div
              key={text}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.18 }}
              className="rounded-2xl bg-slate-100 dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-200"
            >
              {text}
            </motion.div>
          ))}
          <div className="h-28 rounded-2xl bg-blue-600 text-white p-4 text-sm leading-6">
            Risk summary generated with liquidity, solvency, cash quality, and valuation context.
          </div>
        </div>
      </div>
    );
  }

  if (kind === "compare") {
    return (
      <div className="w-full max-w-2xl px-8 grid grid-cols-3 gap-3">
        {["AAPL", "MSFT", "NVDA"].map((name, i) => (
          <motion.div
            key={name}
            animate={{ y: [0, i === 1 ? -18 : 12, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="rounded-[1.75rem] bg-white/90 dark:bg-slate-950/85 p-5 shadow-xl"
          >
            <div className="font-bold text-slate-900 dark:text-slate-100">{name}</div>
            <div className="mt-6 space-y-3">
              <div className="h-2 rounded-full bg-blue-500" />
              <div className="h-2 rounded-full bg-emerald-500 w-4/5" />
              <div className="h-2 rounded-full bg-amber-500 w-2/3" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (kind === "portfolio") {
    return (
      <div className="relative w-80 h-80">
        <div className="absolute inset-0 rounded-full border-[42px] border-blue-500" />
        <div className="absolute inset-8 rounded-full border-[42px] border-emerald-500 border-l-transparent rotate-45" />
        <div className="absolute inset-20 rounded-full bg-white/90 dark:bg-slate-950/90 shadow-xl flex items-center justify-center text-center">
          <div>
            <div className="text-4xl font-bold text-slate-900 dark:text-slate-100">72</div>
            <div className="text-xs text-slate-500">risk score</div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "dcf") {
    return (
      <div className="w-full max-w-xl px-8">
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-[2rem] bg-slate-950 text-white p-6 shadow-2xl"
        >
          <div className="text-sm text-slate-400">Intrinsic value</div>
          <div className="text-5xl font-bold mt-2">$248.30</div>
          <div className="mt-6 h-28 flex items-end gap-3">
            {[42, 56, 68, 76, 88, 96].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-xl bg-rose-500" style={{ height: `${h}%` }} />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl px-8">
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="rounded-[2rem] bg-slate-950 text-white shadow-2xl p-6"
      >
        <div className="flex items-center justify-between text-sm text-slate-400 mb-8">
          <span>Market Pulse</span>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="h-64 flex items-end gap-2">
          {[48, 62, 58, 74, 68, 86, 92, 80, 96, 104, 112, 108].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              whileInView={{ height: h * 1.7 }}
              transition={{ delay: i * 0.04 }}
              className="flex-1 rounded-t-lg bg-blue-500"
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
