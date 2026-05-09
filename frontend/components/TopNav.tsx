/**
 * Apple-style top navigation
 * - Brand on left
 * - Market switcher (US / CN / HK) — center-left, visible on ALL pages
 * - Quick links (Portfolio / Compare / Valuation) — center-right
 * - Settings icon — right
 *
 * Translucent backdrop blur, sticky to top.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { useApp, useT, type Market } from "@/lib/AppContext";

interface Props {
  onOpenSettings: () => void;
}

export function TopNav({ onOpenSettings }: Props) {
  const t = useT();
  const { market, setMarket } = useApp();
  const pathname = usePathname();

  const markets: { id: Market; label: string }[] = [
    { id: "us", label: t("navMarketUS") },
    { id: "cn", label: t("navMarketCN") },
    { id: "hk", label: t("navMarketHK") },
  ];

  const links = [
    { href: "/portfolio", label: t("navPortfolio") },
    { href: "/compare", label: t("navCompare") },
    { href: "/valuation", label: t("navValuation") },
  ];

  return (
    <nav className="nav-blur fixed top-0 left-0 right-0 z-50 border-b border-slate-200/60 dark:border-slate-800/60">
      <div className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50 hover:opacity-80 transition-opacity flex-shrink-0"
        >
          {t("brand")}
        </Link>

        {/* Market switcher — VISIBLE ON ALL PAGES, navigates to /markets/{id} */}
        <div className="hidden md:flex items-center gap-1">
          {markets.map((m) => {
            const active = market === m.id;
            return (
              <Link
                key={m.id}
                href={`/markets/${m.id}`}
                onClick={() => setMarket(m.id)}
                className={`px-3 py-1 text-[13px] rounded-full transition-all ${
                  active
                    ? "text-slate-900 dark:text-slate-50 bg-slate-200/60 dark:bg-slate-700/60"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {m.label}
              </Link>
            );
          })}
        </div>

        {/* Right cluster: feature links + settings */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1 text-[13px] rounded-full transition-colors ${
                  active
                    ? "text-slate-900 dark:text-slate-50 bg-slate-200/60 dark:bg-slate-700/60"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}

          <button
            onClick={onOpenSettings}
            aria-label={t("settingsTitle")}
            className="ml-2 p-1.5 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
