"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { X } from "lucide-react";
import { apiClient, type Holding } from "@/lib/api";
import { useT } from "@/lib/AppContext";

interface Props {
  open: boolean;
  onClose: () => void;
  sectorName: string;
  etfTicker?: string;
  market: "us" | "cn";
}

export function SectorDetail({
  open,
  onClose,
  sectorName,
  etfTicker,
  market,
}: Props) {
  const t = useT();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [history, setHistory] = useState<{ date: string; close: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const fetchAll = async () => {
      try {
        if (market === "us" && etfTicker) {
          const h = await apiClient.getHoldings(etfTicker, 5);
          setHoldings(h);
        } else {
          setHoldings([]);
        }

        const identifier = market === "us" ? etfTicker || sectorName : sectorName;
        const hist = await apiClient.getSectorHistory(market, identifier, 90);
        setHistory(hist.map(([date, close]) => ({ date, close })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [open, sectorName, etfTicker, market]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/30 dark:bg-black/60 backdrop-blur-sm z-40"
          />

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-y-auto"
          >
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {sectorName}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {market === "us" ? t("usMarket") : t("cnMarket")}
                  {etfTicker && ` · ${etfTicker}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  {t("sectorHistory")}
                </h4>
                {loading ? (
                  <div className="h-56 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                ) : history.length > 0 ? (
                  <div className="h-56 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" className="dark:stroke-slate-700" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                          tickFormatter={(v) => v.slice(5)}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgb(15 23 42)",
                            border: "1px solid rgb(51 65 85)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "white",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="close"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-slate-400 dark:text-slate-500 text-sm">
                    {t("noData")}
                  </div>
                )}
              </div>

              {market === "us" && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                    {t("topHoldings")}
                  </h4>
                  {loading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse"
                        />
                      ))}
                    </div>
                  ) : holdings.length > 0 ? (
                    <div className="space-y-2">
                      {holdings.map((h, i) => (
                        <motion.div
                          key={h.ticker}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 cursor-pointer transition-colors"
                        >
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {h.ticker}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                              {h.name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                              ${h.price?.toFixed(2) ?? "—"}
                            </div>
                            {h.change_pct !== null && (
                              <div
                                className={`text-xs tabular-nums ${
                                  h.change_pct >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {h.change_pct >= 0 ? "+" : ""}
                                {h.change_pct.toFixed(2)}% · {h.weight.toFixed(1)}%
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 dark:text-slate-500 text-sm">
                      {t("noData")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
