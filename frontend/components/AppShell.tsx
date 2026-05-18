/**
 * Client-side shell — provides TopNav, SettingsDrawer, and FloatingChat globally.
 * Used inside the server component layout.tsx
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "./TopNav";
import { SettingsDrawer } from "./SettingsDrawer";
import { FloatingChat } from "./FloatingChat";
import { apiClient } from "@/lib/api";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const warmPrimaryMarkets = () => {
      if (cancelled) return;
      router.prefetch("/markets/cn");
      router.prefetch("/markets/hk");
      void apiClient.preloadPrimaryMarketData("cn");
      void apiClient.preloadPrimaryMarketData("hk");
    };

    const requestIdle = window.requestIdleCallback;
    if (typeof requestIdle === "function") {
      const idleId = requestIdle(warmPrimaryMarkets, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timer = globalThis.setTimeout(warmPrimaryMarkets, 300);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [router]);

  return (
    <>
      <TopNav onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <div className="pt-12">
        {children}
      </div>
      <FloatingChat onOpenSettings={() => setSettingsOpen(true)} />
    </>
  );
}
