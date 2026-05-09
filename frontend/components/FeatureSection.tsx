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
  ctaLabel: string;
  /** Either: target href OR an onClick handler */
  ctaHref?: string;
  ctaOnClick?: () => void;
  /** Whether to flip layout (visual on left) */
  reversed?: boolean;
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
}: Props) {
  const visual = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      className={`aspect-[4/3] rounded-3xl bg-gradient-to-br ${bgClass} border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center`}
    >
      {/* Placeholder for future image / animation */}
      <Icon className={`w-32 h-32 ${iconColor} opacity-30`} strokeWidth={1.2} />
    </motion.div>
  );

  const text = (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col justify-center"
    >
      <p className="text-[13px] font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3">
        {eyebrow}
      </p>
      <h2 className="section-title text-slate-900 dark:text-slate-50 mb-5">
        {title}
      </h2>
      <p className="section-subtitle leading-relaxed">{body}</p>

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
    </motion.div>
  );

  return (
    <section className="py-24 md:py-32 px-6">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 md:gap-20">
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
