"use client";

import { useEffect, useState } from "react";
import type { ProfileHotel, PriceRangeHotel } from "@/shared/user-profile-page";

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} stars`}>
      {"★".repeat(rating)}
      <span className="text-neutral-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ProfileHotelsSection({
  hotels,
  editMode,
  isSelf,
  onSave,
}: {
  hotels: ProfileHotel[];
  editMode: boolean;
  isSelf: boolean;
  onSave: (hotels: ProfileHotel[]) => Promise<void>;
}) {
  const [local, setLocal] = useState(hotels);

  useEffect(() => setLocal(hotels), [hotels]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileHotel> | null>(null);

  if (!isSelf && local.length === 0) return null;

  async function persist(next: ProfileHotel[]) {
    setBusy(true);
    try {
      await onSave(next);
      setLocal(next);
    } finally {
      setBusy(false);
    }
  }

  function addHotel() {
    if (local.length >= 6) return;
    setDraft({ name: "", location: "", starRating: 4, note: "", priceRange: "$$", order: local.length });
  }

  async function saveDraft() {
    if (!draft?.name?.trim()) return;
    const item: ProfileHotel = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      location: (draft.location ?? "").trim(),
      starRating: draft.starRating ?? 4,
      note: (draft.note ?? "").trim(),
      priceRange: draft.priceRange as PriceRangeHotel | undefined,
      order: local.length,
    };
    await persist([...local, item]);
    setDraft(null);
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= local.length) return;
    const next = [...local];
    const [a, b] = [next[idx]!, next[j]!];
    next[idx] = { ...b, order: idx };
    next[j] = { ...a, order: j };
    void persist(next);
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 16V6l6-3 6 3v10" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white">Top hotel recommendations</h2>
        </div>
        {editMode && local.length < 6 ? (
          <button
            type="button"
            disabled={busy}
            onClick={addHotel}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline"
          >
            <span className="text-lg leading-none">+</span> Add a hotel
          </button>
        ) : null}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={addHotel}
          className="w-full rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-sm font-medium text-neutral-600 hover:border-[#2563EB] hover:text-[#2563EB] dark:border-white/15"
        >
          Add your first hotel recommendation
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {local.map((h, idx) => (
            <article key={h.id} className="relative rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
              {editMode ? (
                <div className="absolute right-3 top-3 flex flex-col gap-1">
                  <button type="button" aria-label="Move up" onClick={() => move(idx, -1)} className="text-neutral-400 hover:text-neutral-700">
                    ↑
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => move(idx, 1)} className="text-neutral-400 hover:text-neutral-700">
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => void persist(local.filter((x) => x.id !== h.id))}
                    className="text-xs text-rose-600"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <h3 className="pr-8 font-semibold text-neutral-900 dark:text-white">{h.name}</h3>
              <p className="mt-0.5 text-sm text-neutral-500">{h.location}</p>
              <div className="mt-2 flex items-center gap-2">
                <StarRow rating={h.starRating} />
                {h.priceRange ? <span className="text-sm text-neutral-500">{h.priceRange}</span> : null}
              </div>
              {h.note ? <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">&ldquo;{h.note}&rdquo;</p> : null}
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDraft(null)} aria-label="Close" />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h3 className="font-display text-lg font-semibold">Add hotel</h3>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
                placeholder="Hotel name"
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
                placeholder="City / location"
                value={draft.location ?? ""}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
              <label className="block text-xs font-medium text-neutral-500">
                Stars
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={draft.starRating ?? 4}
                  onChange={(e) => setDraft({ ...draft, starRating: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </label>
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
                placeholder="Personal note"
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
              <select
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
                value={draft.priceRange ?? "$$"}
                onChange={(e) => setDraft({ ...draft, priceRange: e.target.value as PriceRangeHotel })}
              >
                <option value="$">$</option>
                <option value="$$">$$</option>
                <option value="$$$">$$$</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDraft()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
