"use client";

import { useEffect, useState } from "react";
import type { ProfileCity } from "@/shared/user-profile-page";
import {
  ProfileSectionLabel,
  profileCardClass,
  profilePillButtonClass,
} from "@/frontend/components/profile/profile-section-label";

const profileInputClass =
  "w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]";

export function ProfileCitiesSection({
  cities,
  editMode,
  isSelf,
  onSave,
}: {
  cities: ProfileCity[];
  editMode: boolean;
  isSelf: boolean;
  onSave: (cities: ProfileCity[]) => Promise<void>;
}) {
  const [local, setLocal] = useState(cities);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileCity> | null>(null);

  useEffect(() => setLocal(cities), [cities]);

  if (!isSelf && local.length === 0) return null;

  async function persist(next: ProfileCity[]) {
    setBusy(true);
    try {
      await onSave(next);
      setLocal(next);
    } finally {
      setBusy(false);
    }
  }

  function addCity() {
    if (local.length >= 24) return;
    setDraft({ city: "", country: "", note: "", order: local.length });
  }

  async function saveDraft() {
    if (!draft?.city?.trim()) return;
    const item: ProfileCity = {
      id: crypto.randomUUID(),
      city: draft.city.trim(),
      country: (draft.country ?? "").trim(),
      note: (draft.note ?? "").trim(),
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
    <section className="mt-10 pb-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ProfileSectionLabel>Cities you&apos;ve been to</ProfileSectionLabel>
        {editMode && local.length < 24 ? (
          <button
            type="button"
            disabled={busy}
            onClick={addCity}
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--sage)] hover:underline dark:text-[color:var(--sage-soft)]"
          >
            <span className="text-lg leading-none">+</span> Add a city
          </button>
        ) : null}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={addCity}
          className={`w-full border-dashed px-4 py-10 text-sm font-medium text-[color:var(--on-surface-variant)] transition hover:border-[color:var(--sage)]/55 hover:text-[color:var(--sage)] dark:text-[#9c9a96] dark:hover:text-[color:var(--sage-soft)] ${profileCardClass}`}
        >
          Add your first city
        </button>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {local.map((c, idx) => (
            <li key={c.id} className={`relative p-4 ${profileCardClass}`}>
              {editMode ? (
                <div className="absolute right-3 top-3 flex gap-2 text-xs text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">
                  <button type="button" onClick={() => move(idx, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(idx, 1)} aria-label="Move down">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-rose-600 dark:text-rose-400"
                    onClick={() => void persist(local.filter((x) => x.id !== c.id))}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <h3 className="pr-16 font-display text-lg font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                {c.city}
              </h3>
              {c.country ? (
                <p className="mt-0.5 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{c.country}</p>
              ) : null}
              {c.note ? (
                <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">&ldquo;{c.note}&rdquo;</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDraft(null)} aria-label="Close" />
          <div className={`relative w-full max-w-md p-6 ${profileCardClass}`}>
            <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Add city</h3>
            <div className="mt-4 space-y-3">
              <input
                className={profileInputClass}
                placeholder="City"
                value={draft.city ?? ""}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
              <input
                className={profileInputClass}
                placeholder="Country / region"
                value={draft.country ?? ""}
                onChange={(e) => setDraft({ ...draft, country: e.target.value })}
              />
              <input
                className={profileInputClass}
                placeholder="Short note (optional)"
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
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
