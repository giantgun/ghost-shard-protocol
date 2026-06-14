"use client";

import { useGhost } from "@/lib/contexts/GhostContext";
import { Initialize } from "@/components/Initialize";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const { isInitialized } = useGhost();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {isInitialized ? <Dashboard /> : <Initialize />}
    </main>
  );
}
