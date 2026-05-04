"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlacePreview } from "@/shared/place-preview";
import type { PlaceSpotlight } from "@/shared/place-preview";
import { normalizePlan, type TripPlan } from "@/shared/trip-plan";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import type { CardChatMessage } from "@/shared/collaboration";

export function TripCardChatWidget({
  tripId,
  spotlights,
  initialMessages,
  onPlanReplaced,
  onCollabBump,
}: {
  tripId: string;
  spotlights: PlaceSpotlight[];
  initialMessages: CardChatMessage[];
  onPlanReplaced: (next: TripPlan) => void;
  onCollabBump: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CardChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const sync = useCallback(async () => {
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/card-chat`, { credentials: "include" });
      const j = (await r.json()) as { messages?: CardChatMessage[] };
      if (r.ok && Array.isArray(j.messages)) setMessages(j.messages);
    } catch {
      //
    }
  }, [tripId]);

  useEffect(() => {
    void sync();
  }, [sync, tripId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const spotlightOptions = useMemo(
    () =>
      spotlights.map((s) => ({
        id: spotlightStableIdFromMapsUrl(s.mapsUrl),
        label: s.name,
      })),
    [spotlights]
  );

  const send = async () => {
    const t = draft.trim();
    if (!t || busy) return;
    setBusy(true);
    setDraft("");
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/card-chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const j = (await r.json()) as { messages?: CardChatMessage[]; plan?: unknown; error?: string };
      if (r.ok && Array.isArray(j.messages)) {
        setMessages(j.messages);
        if (j.plan && typeof j.plan === "object") {
          onPlanReplaced(normalizePlan(j.plan));
        }
        onCollabBump();
      }
    } finally {
      setBusy(false);
    }
  };

  const applyPlace = async (spotlightId: string, place: PlacePreview) => {
    setReplaceBusy(spotlightId);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/spotlights/replace`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotlightId,
          place: { ...place, sourceQuery: "Trip chat" },
        }),
      });
      const j = (await r.json()) as { plan?: TripPlan; error?: string };
      if (r.ok && j.plan) {
        onPlanReplaced(j.plan);
        void sync();
        onCollabBump();
      }
    } finally {
      setReplaceBusy(null);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex max-w-full flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {open ? (
        <div className="pointer-events-auto flex h-[min(420px,70vh)] w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1a1a]">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-white/10">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Trip chat</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              Close
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-neutral-500">
                Ask for tweaks like “more upscale dinner” or “cheaper hotel near downtown”.
              </p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[95%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-slate-200 text-slate-900 dark:bg-[#2c2c2c] dark:text-[#ebe9e4]"
                      : "bg-slate-100 text-slate-800 dark:bg-[#252525] dark:text-[#e4e2de]"
                  }`}
                >
                  {m.text}
                </div>
                {m.role === "assistant" && m.places?.length ? (
                  <div className="flex w-full max-w-[95%] flex-col gap-2">
                    {m.places.map((p, idx) => (
                      <div
                        key={`${m.id}-${p.mapsUrl}-${idx}`}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#161616]"
                      >
                        {p.photoUrl ? (
                          <div className="relative h-20 w-full">
                            <Image
                              src={p.photoUrl}
                              alt=""
                              fill
                              sizes="400px"
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-20 items-center justify-center bg-slate-100 text-[10px] text-slate-400 dark:bg-[#2a2a2a]">
                            Map
                          </div>
                        )}
                        <div className="space-y-1.5 p-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">{p.name}</p>
                          <p className="text-[10px] text-slate-600 dark:text-neutral-400">
                            {p.rating != null ? `${p.rating.toFixed(1)} ★` : ""}
                            {p.priceRange ? ` · ${p.priceRange}` : ""}
                          </p>
                          {spotlightOptions.length ? (
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-medium text-slate-500 dark:text-neutral-500">Replace</label>
                              <select
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-900 dark:border-white/10 dark:bg-[#222] dark:text-[#ebe9e4]"
                                defaultValue=""
                                disabled={replaceBusy !== null}
                                onChange={(ev) => {
                                  const sid = ev.target.value;
                                  ev.target.value = "";
                                  if (!sid) return;
                                  void applyPlace(sid, p);
                                }}
                              >
                                <option value="">Pick a slot…</option>
                                {spotlightOptions.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-slate-200 p-2 dark:border-white/10"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask the group assistant…"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-orange-400/50 dark:border-white/10 dark:bg-[#141414] dark:text-[#ebe9e4]"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-[#ebe9e4] dark:text-[#141414]"
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg text-white shadow-lg ring-2 ring-white/20 transition hover:bg-slate-800 dark:bg-[#ebe9e4] dark:text-[#141414] dark:hover:bg-white"
        aria-label={open ? "Close trip chat" : "Open trip chat"}
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
