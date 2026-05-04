"use client";

import { useState } from "react";
import { GlassCard, SectionTitle } from "@/frontend/components/cards";
import { getSupabaseClient } from "@/frontend/supabase/client";

type TestResult = {
  status: "idle" | "ready" | "missing-config" | "connected" | "error";
  message: string;
};

export function SupabaseTestPanel() {
  const [result, setResult] = useState<TestResult>({
    status: "idle",
    message: "Click the button to initialize the Supabase client and run a connection check.",
  });

  async function runTest() {
    const client = getSupabaseClient();

    if (!client) {
      setResult({
        status: "missing-config",
        message:
          "Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload this page.",
      });
      return;
    }

    setResult({
      status: "ready",
      message: "Client created. Running a lightweight connection check...",
    });

    try {
      const { error, count } = await client
        .from("requests")
        .select("id", { head: true, count: "exact" })
        .limit(1);

      console.log("Conci Supabase test: requests table check", { count, error });

      setResult({
        status: "connected",
        message: "Supabase client initialized and reached the requests table successfully.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Supabase connection error.";
      console.error("Conci Supabase test error:", error);
      setResult({
        status: "error",
        message,
      });
    }
  }

  return (
    <GlassCard className="p-6 sm:p-7">
      <SectionTitle
        title="Supabase connection test"
        description="No auth yet. This checks that the client can initialize and reach the Supabase backend."
      />
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600 dark:text-neutral-400">{result.message}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runTest}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-slate-950 via-slate-900 to-brand-700 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(15,23,42,0.22)]"
          >
            Run connection test
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
