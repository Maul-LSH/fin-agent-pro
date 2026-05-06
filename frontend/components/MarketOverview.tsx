"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { MarketIndex } from "@/lib/api";

interface Props {
  data: MarketIndex[];
  currencyPrefix?: string;
  loading?: boolean;
}

export function MarketOverview({ data, currencyPrefix = "", loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {data.map((item, i) => {
        const isUp = (item.change_pct ?? 0) >= 0;
        return (
          <motion.div
            key={item.ticker}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -4 }}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
              {item.label}
            </div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {item.price !== null
                ? `${currencyPrefix}${item.price.toLocaleString()}`
                : "—"}
            </div>
            {item.change_pct !== null && (
              <div
                className={`mt-2 flex items-center gap-1 text-sm font-medium ${
                  isUp
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isUp ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="tabular-nums">
                  {isUp ? "+" : ""}
                  {item.change_pct.toFixed(2)}%
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
