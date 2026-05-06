"use client";

import { motion } from "framer-motion";
import type { Sector } from "@/lib/api";
import { useT } from "@/lib/AppContext";

interface Props {
  data: Sector[];
  showInflow?: boolean;
  onSelect?: (sector: Sector) => void;
}

export function SectorTable({ data, showInflow = false, onSelect }: Props) {
  const t = useT();

  if (!data || data.length === 0) {
    return (
      <div className="text-center text-slate-400 dark:text-slate-500 py-12">
        {t("noData")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="grid grid-cols-12 gap-4 px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
        <div className="col-span-5">{t("sectorCol")}</div>
        <div className="col-span-2 text-right">{t("priceCol")}</div>
        <div className="col-span-2 text-right">{t("changeCol")}</div>
        {showInflow && <div className="col-span-3 text-right">{t("inflowCol")}</div>}
        {!showInflow && <div className="col-span-3 text-right">{t("actionCol")}</div>}
      </div>

      {data.map((item, i) => {
        const change = item.change_pct ?? 0;
        const isUp = change >= 0;
        const id = item.ticker || item.code || item.label;

        return (
          <motion.div
            key={id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i * 0.02, 0.5) }}
            whileHover={{ backgroundColor: "rgb(248 250 252 / 0.5)" }}
            onClick={() => onSelect?.(item)}
            className="grid grid-cols-12 gap-4 px-5 py-3 items-center cursor-pointer border-b border-slate-50 dark:border-slate-800/50 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <div className="col-span-5 flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isUp ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {item.label}
              </span>
            </div>
            <div className="col-span-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
              {item.price !== null ? item.price.toFixed(2) : "—"}
            </div>
            <div
              className={`col-span-2 text-right tabular-nums font-medium ${
                isUp
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {item.change_pct !== null
                ? `${isUp ? "+" : ""}${change.toFixed(2)}%`
                : "—"}
            </div>
            {showInflow ? (
              <div
                className={`col-span-3 text-right tabular-nums font-medium ${
                  (item.main_inflow_yi ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {item.main_inflow_yi !== null && item.main_inflow_yi !== undefined
                  ? `${(item.main_inflow_yi ?? 0) >= 0 ? "+" : ""}${item.main_inflow_yi.toFixed(2)}`
                  : "—"}
              </div>
            ) : (
              <div className="col-span-3 text-right">
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {t("viewDetail")}
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
