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
          className="relative mt-14 mx-auto w-full max-w-6xl min-h-[420px] md:min-h-[560px]"
        >
          <div className="absolute inset-x-[-10%] top-[-8%] h-[82%] bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.16),transparent_58%)] blur-3xl" />
          <div className="absolute inset-x-[8%] top-[6%] h-px bg-gradient-to-r from-transparent via-slate-300/90 to-transparent dark:via-slate-700/80" />

          <motion.div
            animate={{ opacity: [0.65, 1, 0.65], scale: [1, 1.04, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-1/2 top-[8%] h-56 w-56 -translate-x-1/2 rounded-full bg-blue-400/20 blur-3xl"
          />

          <svg
            viewBox="0 0 1100 560"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label="Financial analysis landscape with known signals and uncertain territory"
          >
            <defs>
              <linearGradient id="signalStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.2" />
                <stop offset="35%" stopColor="#2563eb" stopOpacity="0.9" />
                <stop offset="68%" stopColor="#0f172a" stopOpacity="1" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.18" />
              </linearGradient>
              <filter id="signalGlow" x="-20%" y="-40%" width="140%" height="180%">
                <feGaussianBlur stdDeviation="12" />
              </filter>
            </defs>

            {[120, 185, 250, 315, 380].map((y) => (
              <line
                key={y}
                x1="36"
                y1={y}
                x2="1064"
                y2={y}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeWidth="1"
                strokeDasharray="5 14"
              />
            ))}

            <motion.path
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.18, 0.34, 0.18],
                d: [
                  "M40 328 L120 328 L155 320 L188 336 L220 328 L252 328 L284 290 L318 382 L352 254 L388 328 L450 328 L482 318 L514 340 L548 328 L600 328 L636 300 L670 362 L704 280 L738 328 L808 328 L842 316 L876 338 L910 328 L946 328 L980 292 L1012 368 L1062 328",
                  "M40 328 L120 328 L155 334 L188 316 L220 328 L252 328 L284 278 L318 396 L352 236 L388 328 L450 328 L482 342 L514 314 L548 328 L600 328 L636 286 L670 378 L704 262 L738 328 L808 328 L842 340 L876 314 L910 328 L946 328 L980 278 L1012 384 L1062 328",
                  "M40 328 L120 328 L155 320 L188 336 L220 328 L252 328 L284 290 L318 382 L352 254 L388 328 L450 328 L482 318 L514 340 L548 328 L600 328 L636 300 L670 362 L704 280 L738 328 L808 328 L842 316 L876 338 L910 328 L946 328 L980 292 L1012 368 L1062 328",
                ],
              }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#signalGlow)"
            />

            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: 1,
                opacity: 1,
                d: [
                  "M40 328 L120 328 L155 320 L188 336 L220 328 L252 328 L284 290 L318 382 L352 254 L388 328 L450 328 L482 318 L514 340 L548 328 L600 328 L636 300 L670 362 L704 280 L738 328 L808 328 L842 316 L876 338 L910 328 L946 328 L980 292 L1012 368 L1062 328",
                  "M40 328 L120 328 L155 334 L188 316 L220 328 L252 328 L284 278 L318 396 L352 236 L388 328 L450 328 L482 342 L514 314 L548 328 L600 328 L636 286 L670 378 L704 262 L738 328 L808 328 L842 340 L876 314 L910 328 L946 328 L980 278 L1012 384 L1062 328",
                  "M40 328 L120 328 L155 320 L188 336 L220 328 L252 328 L284 290 L318 382 L352 254 L388 328 L450 328 L482 318 L514 340 L548 328 L600 328 L636 300 L670 362 L704 280 L738 328 L808 328 L842 316 L876 338 L910 328 L946 328 L980 292 L1012 368 L1062 328",
                ],
              }}
              transition={{
                pathLength: { duration: 1.25, delay: 0.55, ease: "easeOut" },
                opacity: { duration: 1.25, delay: 0.55, ease: "easeOut" },
                d: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
              }}
              fill="none"
              stroke="url(#signalStroke)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {[
              { x: 284, y: 290, r: 8 },
              { x: 352, y: 254, r: 9 },
              { x: 636, y: 300, r: 8 },
              { x: 704, y: 280, r: 9 },
            ].map((node, i) => (
              <motion.g
                key={`${node.x}-${node.y}`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.8 + i * 0.12 }}
              >
                <circle cx={node.x} cy={node.y} r={node.r + 12} fill="#2563eb" opacity="0.12" />
                <circle cx={node.x} cy={node.y} r={node.r} fill="#2563eb" />
              </motion.g>
            ))}
          </svg>

          <div className="absolute left-0 top-[16%] hidden text-left md:block">
            <div className="text-xs uppercase tracking-[0.28em] text-blue-600/80 dark:text-blue-300/80">
              {t("heroVisualKnownLabel")}
            </div>
            <div className="mt-3 max-w-[17rem] text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t("heroVisualKnownBody")}
            </div>
          </div>

          <div className="absolute right-0 top-[16%] hidden max-w-[18rem] text-right md:block">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              {t("heroVisualUnknownLabel")}
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t("heroVisualUnknownBody")}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-8 flex justify-center">
            <div className="max-w-3xl text-center">
              <div className="text-sm text-blue-600 dark:text-blue-300">{t("heroVisualEyebrow")}</div>
              <div className="mt-3 text-3xl md:text-5xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                {t("heroVisualTitle")}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
