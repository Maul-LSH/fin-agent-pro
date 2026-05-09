"use client";

import { DCFCalculator } from "@/components/DCFCalculator";

export default function ValuationPage() {
  return (
    <main className="min-h-screen pt-20 pb-32 px-6">
      <div className="max-w-7xl mx-auto">
        <DCFCalculator />
      </div>
    </main>
  );
}
