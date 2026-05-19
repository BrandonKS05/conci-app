"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TripPlan } from "@/shared/trip-plan";
import { appendPackingListBlocks } from "@/shared/packing-list-import";

type Props = { tripId: string; initialPlan: TripPlan; isHost: boolean };

const FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.txt,.md,.csv,.json,text/plain,application/json";

export function TripHostPackingPage({ tripId, initialPlan, isHost }: Props) {
  const [plan, setPlan] = useState(initialPlan);
  const [text, setText] = useState(() => initialPlan.hostSetup?.packingList ?? "");
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const onPickFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setImportBusy(true);
      setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/trip-plans/${tripId}/packing-import`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const j = (await res.json().catch(() => ({}))) as { packingList?: string; error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : "Could not import file.");
          return;
        }
        const incoming = typeof j.packingList === "string" ? j.packingList : "";
        setText((prev) => appendPackingListBlocks(prev, incoming));
      } catch {
        setErr("Could not import file.");
      } finally {
        setImportBusy(false);
      }
    },
    [tripId]
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/trip/${tripId}/setup`}
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to trip setup
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-[color:var(--on-surface)] dark:text-white">Packing list</h1>
      <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-400">
        {isHost
          ? `${title} — list what the group should pack. You can edit this anytime before publishing.`
          : `${title} — the host controls this shared packing list.`}
      </p>

      {!isHost ? (
        <div className="mt-5 rounded-2xl border border-[color:var(--hairline)] bg-white p-5 text-sm text-[color:var(--on-surface)] shadow-sm dark:border-white/10 dark:bg-dm-card dark:text-neutral-100">
          {text.trim() ? (
            <pre className="whitespace-pre-wrap font-sans leading-6">{text}</pre>
          ) : (
            <p className="text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              No packing list has been shared yet.
            </p>
          )}
        </div>
      ) : null}

      {!isHost ? null : (
        <>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept={FILE_ACCEPT}
            onChange={(e) => void onFileChange(e)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importBusy || busy}
              onClick={onPickFile}
              className="rounded-xl border border-zinc-400/60 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-500/40 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              {importBusy ? "Reading file…" : "Upload file or photo"}
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              Text (.txt, .md, .csv) or an image of a list — items are merged into the box below.
            </span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder="Rain jacket, chargers, sunscreen, comfortable shoes…"
            className="mt-4 w-full resize-y rounded-2xl border border-[color:var(--hairline)] bg-white px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:placeholder:text-zinc-500"
          />
          {err ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{err}</p> : null}
          <button
            type="button"
            disabled={busy || importBusy}
            onClick={() => void save()}
            className="mt-4 rounded-xl border border-zinc-500/35 bg-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:border-zinc-500/40 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            {busy ? "Saving…" : "Save packing list"}
          </button>
        </>
      )}
    </div>
  );
}
