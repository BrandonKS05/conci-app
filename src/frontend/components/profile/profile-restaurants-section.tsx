"use client";

import { useEffect, useMemo, useState } from "react";
import type { PriceRangeRestaurant, ProfileRestaurant } from "@/shared/user-profile-page";
import { ProfileScorePill } from "@/frontend/components/profile/profile-score-pill";

export function ProfileRestaurantsSection({
  restaurants,
  editMode,
  isSelf,
  onSave,
}: {
  restaurants: ProfileRestaurant[];
  editMode: boolean;
  isSelf: boolean;
  onSave: (restaurants: ProfileRestaurant[]) => Promise<void>;
}) {
  const [local, setLocal] = useState(restaurants);
  const [filter, setFilter] = useState("All");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileRestaurant> | null>(null);

  useEffect(() => setLocal(restaurants), [restaurants]);

  const cuisines = useMemo(() => {
    const set = new Set<string>();
    for (const r of local) if (r.cuisine.trim()) set.add(r.cuisine.trim());
    return ["All", ...[...set].sort()];
  }, [local]);

  const filtered = useMemo(() => {
    const list = filter === "All" ? local : local.filter((r) => r.cuisine === filter);
    return [...list].sort((a, b) => b.score - a.score);
  }, [local, filter]);

  const visible = showAll ? filtered : filtered.slice(0, 10);

  if (!isSelf && local.length === 0) return null;

  async function persist(next: ProfileRestaurant[]) {
    setBusy(true);
    try {
      await onSave(next);
      setLocal(next);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft?.name?.trim()) return;
    const item: ProfileRestaurant = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      neighborhood: (draft.neighborhood ?? "").trim(),
      city: (draft.city ?? "").trim(),
      cuisine: (draft.cuisine ?? "").trim(),
      score: typeof draft.score === "number" ? draft.score : 5,
      note: (draft.note ?? "").trim().slice(0, 140),
      priceRange: (draft.priceRange as PriceRangeRestaurant) ?? "$$",
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
    <section className="mt-10 pb-16">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            🍽
          </span>
          <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white">Top restaurants</h2>
        </div>
        {editMode ? (
          <button type="button" onClick={() => setDraft({ score: 8, priceRange: "$$" })} className="text-sm font-semibold text-[#2563EB]">
            + Add a restaurant
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {cuisines.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === c ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-600 dark:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={() => setDraft({ score: 8, priceRange: "$$" })}
          className="w-full rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-sm font-medium text-neutral-600"
        >
          Add your first restaurant
        </button>
      ) : (
        <ul className="space-y-3">
          {visible.map((r, idx) => (
            <li key={r.id} className="flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
              <ProfileScorePill score={r.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-white">{r.name}</h3>
                    <p className="text-sm text-neutral-500">
                      {[r.neighborhood, r.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.cuisine ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold dark:bg-white/10">{r.cuisine}</span>
                    ) : null}
                    <span className="text-sm text-neutral-500">{r.priceRange}</span>
                  </div>
                </div>
                {r.note ? <p className="mt-2 text-sm italic text-neutral-600">&ldquo;{r.note}&rdquo;</p> : null}
                {editMode ? (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button type="button" onClick={() => move(idx, -1)}>
                      ↑
                    </button>
                    <button type="button" onClick={() => move(idx, 1)}>
                      ↓
                    </button>
                    <button type="button" className="text-rose-600" onClick={() => void persist(local.filter((x) => x.id !== r.id))}>
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > 10 && !showAll ? (
        <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-sm font-semibold text-[#2563EB]">
          Show more
        </button>
      ) : null}

      {draft ? (
        <RestaurantModal draft={draft} setDraft={setDraft} busy={busy} onClose={() => setDraft(null)} onSave={() => void saveDraft()} />
      ) : null}
    </section>
  );
}

function RestaurantModal({
  draft,
  setDraft,
  busy,
  onClose,
  onSave,
}: {
  draft: Partial<ProfileRestaurant>;
  setDraft: (d: Partial<ProfileRestaurant>) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const score = typeof draft.score === "number" ? draft.score : 5;
  const noteLen = (draft.note ?? "").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
        <h3 className="font-display text-lg font-semibold">Add restaurant</h3>
        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            placeholder="Restaurant name"
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              placeholder="Neighborhood"
              value={draft.neighborhood ?? ""}
              onChange={(e) => setDraft({ ...draft, neighborhood: e.target.value })}
            />
            <input
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              placeholder="City"
              value={draft.city ?? ""}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            />
          </div>
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            placeholder="Cuisine (e.g. Ramen)"
            value={draft.cuisine ?? ""}
            onChange={(e) => setDraft({ ...draft, cuisine: e.target.value })}
          />
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Score</span>
              <span className="text-3xl font-bold tabular-nums">{score.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={score}
              onChange={(e) => setDraft({ ...draft, score: Number(e.target.value) })}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              placeholder="One-line note"
              maxLength={140}
              rows={2}
              value={draft.note ?? ""}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
            <p className="text-right text-xs text-neutral-400">{noteLen}/140</p>
          </div>
          <select
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            value={draft.priceRange ?? "$$"}
            onChange={(e) => setDraft({ ...draft, priceRange: e.target.value as PriceRangeRestaurant })}
          >
            <option value="$">$</option>
            <option value="$$">$$</option>
            <option value="$$$">$$$</option>
            <option value="$$$$">$$$$</option>
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onSave} className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
