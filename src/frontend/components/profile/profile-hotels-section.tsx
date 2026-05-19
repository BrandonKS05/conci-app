"use client";

import { useEffect, useState } from "react";
import type { ProfileHotel, PriceRangeHotel } from "@/shared/user-profile-page";
import {
  ProfileSectionLabel,
  profileCardClass,
  profilePillButtonClass,
} from "@/frontend/components/profile/profile-section-label";

const profileInputClass =
  "w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]";

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500 dark:text-amber-400" aria-label={`${rating} stars`}>
      {"★".repeat(rating)}
      <span className="text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">{"★".repeat(5 - rating)}</span>
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
        <ProfileSectionLabel>Top visited hotels</ProfileSectionLabel>
        {editMode && local.length < 6 ? (
          <button
            type="button"
            disabled={busy}
            onClick={addHotel}
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--sage)] hover:underline dark:text-[color:var(--sage-soft)]"
          >
            <span className="text-lg leading-none">+</span> Add visited hotel
          </button>
        ) : null}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={addHotel}
          className={`w-full border-dashed px-4 py-10 text-sm font-medium text-[color:var(--on-surface-variant)] transition hover:border-[color:var(--sage)]/55 hover:text-[color:var(--sage)] dark:text-[#9c9a96] dark:hover:text-[color:var(--sage-soft)] ${profileCardClass}`}
        >
          Add your first visited hotel
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {local.map((h, idx) => (
            <article key={h.id} className={`relative p-4 ${profileCardClass}`}>
              {editMode ? (
                <div className="absolute right-3 top-3 flex flex-col gap-1">
                  <button
                    type="button"
                    aria-label="Move up"
                    onClick={() => move(idx, -1)}
                    className="text-[color:var(--on-surface-muted)] hover:text-[color:var(--on-surface)] dark:text-[#6b6965] dark:hover:text-[#ebe9e4]"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    onClick={() => move(idx, 1)}
                    className="text-[color:var(--on-surface-muted)] hover:text-[color:var(--on-surface)] dark:text-[#6b6965] dark:hover:text-[#ebe9e4]"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => void persist(local.filter((x) => x.id !== h.id))}
                    className="text-xs text-rose-600 dark:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <h3 className="pr-8 font-display text-lg font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                {h.name}
              </h3>
              <p className="mt-0.5 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{h.location}</p>
              <div className="mt-2 flex items-center gap-2">
                <StarRow rating={h.starRating} />
                {h.priceRange ? (
                  <span className="text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{h.priceRange}</span>
                ) : null}
              </div>
              {h.note ? (
                <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">&ldquo;{h.note}&rdquo;</p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDraft(null)} aria-label="Close" />
          <div className={`relative w-full max-w-md p-6 ${profileCardClass}`}>
            <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Add hotel</h3>
            <div className="mt-4 space-y-3">
              <input
                className={profileInputClass}
                placeholder="Hotel name"
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <input
                className={profileInputClass}
                placeholder="City / location"
                value={draft.location ?? ""}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
              <label className="block text-xs font-medium text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
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
                className={profileInputClass}
                placeholder="Personal note"
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
              <select
                className={profileInputClass}
                value={draft.priceRange ?? "$$"}
                onChange={(e) => setDraft({ ...draft, priceRange: e.target.value as PriceRangeHotel })}
              >
                <option value="$">$</option>
                <option value="$$">$$</option>
                <option value="$$$">$$$</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className={profilePillButtonClass}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDraft()}
                className="rounded-full bg-[color:var(--sage)] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
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
