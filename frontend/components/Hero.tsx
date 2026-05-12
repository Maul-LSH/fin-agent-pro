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
    <section className="relative min-h-screen pt-32 pb-10 px-6 overflow-hidden">
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

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 mx-auto w-full max-w-6xl min-h-[420px] md:min-h-[520px] rounded-[2rem] bg-slate-950 overflow-hidden shadow-2xl relative"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.32),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.82))]" />
          <div className="absolute inset-x-8 bottom-8 top-10 grid grid-cols-12 gap-3 items-end">
            {[42, 58, 52, 70, 66, 84, 78, 96, 88, 110, 104, 122].map((height, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height }}
                transition={{ duration: 0.8, delay: 0.5 + i * 0.04 }}
                className="rounded-t-xl bg-blue-500/80 shadow-lg shadow-blue-500/20"
              />
            ))}
          </div>
          <motion.div
            animate={{ x: ["-5%", "5%", "-5%"] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-10 right-10 top-24 h-40"
          >
            <svg viewBox="0 0 900 180" className="w-full h-full" role="img" aria-label="Market trend line">
              <path
                d="M0 130 C120 88 180 124 270 82 C390 24 460 92 560 56 C690 8 760 54 900 20"
                fill="none"
                stroke="white"
                strokeWidth="7"
                strokeLinecap="round"
              />
            </svg>
          </motion.div>
          <div className="absolute left-8 bottom-8 text-left text-white">
            <div className="text-sm text-blue-200">Live risk lens</div>
            <div className="text-3xl md:text-5xl font-semibold mt-1">Markets, fundamentals, AI.</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
