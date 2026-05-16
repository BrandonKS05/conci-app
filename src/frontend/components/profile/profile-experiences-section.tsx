"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EXPERIENCE_CATEGORIES,
  type ExperienceCategory,
  type ProfileExperience,
} from "@/shared/user-profile-page";
import { ProfileScorePill } from "@/frontend/components/profile/profile-score-pill";

export function ProfileExperiencesSection({
  experiences,
  editMode,
  isSelf,
  onSave,
}: {
  experiences: ProfileExperience[];
  editMode: boolean;
  isSelf: boolean;
  onSave: (experiences: ProfileExperience[]) => Promise<void>;
}) {
  const [local, setLocal] = useState(experiences);
  const [filter, setFilter] = useState<ExperienceCategory | "All">("All");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileExperience> | null>(null);

  useEffect(() => setLocal(experiences), [experiences]);

  const filtered = useMemo(() => {
    const list = filter === "All" ? local : local.filter((e) => e.category === filter);
    return [...list].sort((a, b) => b.score - a.score);
  }, [local, filter]);

  const visible = showAll ? filtered : filtered.slice(0, 10);

  if (!isSelf && local.length === 0) return null;

  async function persist(next: ProfileExperience[]) {
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
    const item: ProfileExperience = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      location: (draft.location ?? "").trim(),
      score: typeof draft.score === "number" ? draft.score : 5,
      review: (draft.review ?? "").trim().slice(0, 140),
      category: (draft.category as ExperienceCategory) ?? "Food",
    };
    await persist([...local, item]);
    setDraft(null);
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            ✦
          </span>
          <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white">Top experiences</h2>
        </div>
        {editMode ? (
          <button type="button" onClick={() => setDraft({ score: 8, category: "Food" })} className="text-sm font-semibold text-[#2563EB]">
            + Rate experience
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["All", ...EXPERIENCE_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === cat ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={() => setDraft({ score: 8, category: "Food" })}
          className="w-full rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-sm font-medium text-neutral-600"
        >
          Rate your first experience
        </button>
      ) : (
        <ul className="space-y-3">
          {visible.map((e) => (
            <li key={e.id} className="flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
              <ProfileScorePill score={e.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-white">{e.name}</h3>
                    <p className="text-sm text-neutral-500">{e.location}</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-white/10">
                    {e.category}
                  </span>
                </div>
                {e.review ? <p className="mt-2 text-sm italic text-neutral-600 dark:text-neutral-400">&ldquo;{e.review}&rdquo;</p> : null}
                {editMode ? (
                  <button
                    type="button"
                    className="mt-2 text-xs text-rose-600"
                    onClick={() => void persist(local.filter((x) => x.id !== e.id))}
                  >
                    Remove
                  </button>
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
        <ExperienceModal draft={draft} setDraft={setDraft} busy={busy} onClose={() => setDraft(null)} onSave={() => void saveDraft()} />
      ) : null}
    </section>
  );
}

function ExperienceModal({
  draft,
  setDraft,
  busy,
  onClose,
  onSave,
}: {
  draft: Partial<ProfileExperience>;
  setDraft: (d: Partial<ProfileExperience>) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const score = typeof draft.score === "number" ? draft.score : 5;
  const reviewLen = (draft.review ?? "").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
        <h3 className="font-display text-lg font-semibold">Rate an experience</h3>
        <div className="mt-4 space-y-3">
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            placeholder="Experience name"
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            placeholder="Location"
            value={draft.location ?? ""}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
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
              placeholder="Short review"
              maxLength={140}
              rows={3}
              value={draft.review ?? ""}
              onChange={(e) => setDraft({ ...draft, review: e.target.value })}
            />
            <p className="text-right text-xs text-neutral-400">{reviewLen}/140</p>
          </div>
          <select
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
            value={draft.category ?? "Food"}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as ExperienceCategory })}
          >
            {EXPERIENCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
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
