/**
 * Client-side shell — provides TopNav, SettingsDrawer, and FloatingChat globally.
 * Used inside the server component layout.tsx
 */

"use client";

import { useEffect, useState } from "react";
import { TopNav } from "./TopNav";
import { SettingsDrawer } from "./SettingsDrawer";
import { FloatingChat } from "./FloatingChat";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

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
