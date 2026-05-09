/**
 * Apple-style hero section
 * Try a demo → /markets/us
 * Learn more → scroll to #features
 */

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useT } from "@/lib/AppContext";

interface Props {
  onLearnMore?: () => void;
}

export function Hero({ onLearnMore }: Props) {
  const t = useT();

  return (
    <section className="relative pt-32 pb-20 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="hero-title text-slate-900 dark:text-slate-50"
        >
          {t("heroTitle")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
          className="hero-subtitle mt-6 max-w-3xl mx-auto"
        >
          {t("heroSubtitle")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="mt-10 flex items-center justify-center gap-4 flex-wrap"
        >
          <Link href="/markets/us" className="btn-apple btn-apple-primary">
            {t("heroCTAPrimary")}
          </Link>
          <button onClick={onLearnMore} className="btn-apple btn-apple-secondary">
            {t("heroCTASecondary")}
          </button>
        </motion.div>

        {/* Reserved area for future hero visual / animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 mx-auto w-full max-w-4xl aspect-[16/9] rounded-3xl bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-blue-950/40 dark:to-slate-900 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center"
        >
          <p className="text-slate-400 dark:text-slate-600 text-sm">
            [Reserved for hero visual]
          </p>
        </motion.div>
      </div>
    </section>
  );
}
