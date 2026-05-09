import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/AppContext";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "fin-agent-pro · AI Financial Risk Detection",
  description:
    "AI-powered risk detection for the stocks you don't have time to analyze. US equities, China A-shares, and Hong Kong stocks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
