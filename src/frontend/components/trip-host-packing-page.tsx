"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";

type Props = { tripId: string; initialPlan: TripPlan };

export function TripHostPackingPage({ tripId, initialPlan }: Props) {
  const [plan, setPlan] = useState(initialPlan);
  const [text, setText] = useState(() => initialPlan.hostSetup?.packingList ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const title = initialPlan.title?.trim() || "Trip";

  useEffect(() => {
    setText(plan.hostSetup?.packingList ?? "");
  }, [plan.hostSetup?.packingList]);

  const save = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/host-setup`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostSetup: { packingList: text },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { plan?: TripPlan; error?: string };
      if (!res.ok) {
        setErr(j.error || "Could not save.");
        return;
      }
      if (j.plan) setPlan(j.plan);
    } catch {
      setErr("Could not save.");
    } finally {
      setBusy(false);
    }
  }, [tripId, text]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/trip/${tripId}/setup`}
        className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
      >
        ← Back to trip setup
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-white">Packing list</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
        {title} — list what the group should pack. You can edit this anytime before publishing.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder="Rain jacket, chargers, sunscreen, comfortable shoes…"
        className="mt-6 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100"
      />
      {err ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{err}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-4 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save packing list"}
      </button>
    </div>
  );
}
