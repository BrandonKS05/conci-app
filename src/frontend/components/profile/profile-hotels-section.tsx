"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ProfileHotel, PriceRangeHotel } from "@/shared/user-profile-page";
import type { ProfileSearchResult } from "@/app/api/places/profile-search/route";
import {
  ProfileSectionLabel,
  profileCardClass,
  profilePillButtonClass,
} from "@/frontend/components/profile/profile-section-label";

const profileInputClass =
  "w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]";

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-[color:var(--sage)]/15 px-1.5 text-xs font-bold tabular-nums text-[color:var(--sage)] dark:bg-[color:var(--sage-soft)]/15 dark:text-[color:var(--sage-soft)]">
      {rank.toFixed(1)}
    </span>
  );
}

function RankPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [raw, setRaw] = useState(value.toFixed(1));

  function commit(s: string) {
    const n = parseFloat(s);
    if (isNaN(n)) { setRaw(value.toFixed(1)); return; }
    const clamped = Math.min(10, Math.max(1, Math.round(n * 10) / 10));
    onChange(clamped);
    setRaw(clamped.toFixed(1));
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
        Your ranking (1 = best, 10 = worst)
      </p>
      <input
        type="number"
        min={1}
        max={10}
        step={0.1}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className="w-24 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm font-semibold text-[color:var(--on-surface)] tabular-nums dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]"
      />
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--hairline)] border-t-[color:var(--sage)] dark:border-white/10 dark:border-t-[color:var(--sage-soft)]" />
    </div>
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
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileHotel> | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(hotels), [hotels]);

  // Fire search after user stops typing (400 ms debounce, min 2 chars)
  useEffect(() => {
    if (!draft) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/profile-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, mode: "hotel" }),
        });
        const json = (await res.json()) as { places: ProfileSearchResult[] };
        setSearchResults(json.places ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, draft]);

  function openDraft() {
    if (local.length >= 10) return;
    setDraft({ name: "", location: "", starRating: 5, note: "", priceRange: "$$", order: local.length });
    setSearchQuery("");
    setSearchResults([]);
  }

  function pickResult(r: ProfileSearchResult) {
    setDraft((d) => ({
      ...d,
      name: r.name,
      location: r.address,
      photoUrl: r.photoUrl,
    }));
    setSearchQuery(r.name);
    setSearchResults([]);
  }

  async function persist(next: ProfileHotel[]) {
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
    const item: ProfileHotel = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      location: (draft.location ?? "").trim(),
      starRating: draft.starRating ?? 5,
      note: (draft.note ?? "").trim(),
      priceRange: draft.priceRange as PriceRangeHotel | undefined,
      order: local.length,
      photoUrl: draft.photoUrl ?? null,
    };
    await persist([...local, item]);
    setDraft(null);
    setSearchQuery("");
    setSearchResults([]);
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

  if (!isSelf && local.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ProfileSectionLabel>Top visited hotels</ProfileSectionLabel>
        {editMode && local.length < 10 ? (
          <button
            type="button"
            disabled={busy}
            onClick={openDraft}
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--sage)] hover:underline dark:text-[color:var(--sage-soft)]"
          >
            <span className="text-lg leading-none">+</span> Add hotel
          </button>
        ) : null}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={openDraft}
          className={`w-full border-dashed px-4 py-10 text-sm font-medium text-[color:var(--on-surface-variant)] transition hover:border-[color:var(--sage)]/55 hover:text-[color:var(--sage)] dark:text-[#9c9a96] dark:hover:text-[color:var(--sage-soft)] ${profileCardClass}`}
        >
          Add your first visited hotel
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {local.map((h, idx) => (
            <article key={h.id} className={`relative overflow-hidden p-0 ${profileCardClass}`}>
              {h.photoUrl ? (
                <div className="relative h-28 w-full bg-[color:var(--surface-container-high)] dark:bg-[#222]">
                  <Image
                    src={h.photoUrl}
                    alt={h.name}
                    fill
                    className="object-cover"
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                </div>
              ) : null}
              <div className="p-4">
                {editMode ? (
                  <div className="absolute right-3 top-3 flex flex-col gap-1">
                    <button type="button" aria-label="Move up" onClick={() => move(idx, -1)} className="text-[color:var(--on-surface-muted)] hover:text-[color:var(--on-surface)] dark:text-[#6b6965] dark:hover:text-[#ebe9e4]">↑</button>
                    <button type="button" aria-label="Move down" onClick={() => move(idx, 1)} className="text-[color:var(--on-surface-muted)] hover:text-[color:var(--on-surface)] dark:text-[#6b6965] dark:hover:text-[#ebe9e4]">↓</button>
                    <button type="button" aria-label="Remove" onClick={() => void persist(local.filter((x) => x.id !== h.id))} className="text-xs text-rose-600 dark:text-rose-400">×</button>
                  </div>
                ) : null}
                <div className="flex items-start gap-2.5 pr-8">
                  <RankBadge rank={h.starRating} />
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold leading-snug tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                      {h.name}
                    </h3>
                    {h.location ? (
                      <p className="mt-0.5 truncate text-sm text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{h.location}</p>
                    ) : null}
                  </div>
                </div>
                {h.priceRange ? (
                  <p className="mt-1.5 text-xs text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">{h.priceRange}</p>
                ) : null}
                {h.note ? (
                  <p className="mt-2 text-sm italic text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">&ldquo;{h.note}&rdquo;</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDraft(null)} aria-label="Close" />
          <div className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto p-6 ${profileCardClass}`}>
            <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Add hotel</h3>

            <div className="mt-4 space-y-4">
              {/* Search input */}
              <div className="relative">
                <input
                  className={profileInputClass}
                  placeholder="Search hotel name…"
                  value={searchQuery}
                  autoFocus
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDraft((d) => ({ ...d, name: e.target.value, photoUrl: null }));
                  }}
                />
                {/* Results dropdown */}
                {searching ? (
                  <Spinner />
                ) : searchResults.length > 0 ? (
                  <ul className="mt-1 overflow-hidden rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] shadow-lg dark:border-white/10 dark:bg-dm-card">
                    {searchResults.map((r, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => pickResult(r)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[color:var(--surface-container-low)] dark:hover:bg-white/5"
                        >
                          {r.photoUrl ? (
                            <Image
                              src={r.photoUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="h-10 w-10 shrink-0 rounded object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="h-10 w-10 shrink-0 rounded bg-[color:var(--surface-container-high)] dark:bg-white/8" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{r.name}</p>
                            {r.address ? (
                              <p className="truncate text-xs text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{r.address}</p>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {/* Show selected photo preview */}
              {draft.photoUrl ? (
                <div className="relative h-24 w-full overflow-hidden rounded-lg">
                  <Image src={draft.photoUrl} alt="" fill className="object-cover" unoptimized sizes="100%" />
                </div>
              ) : null}

              <RankPicker
                value={draft.starRating ?? 5}
                onChange={(n) => setDraft((d) => ({ ...d, starRating: n }))}
              />

              <input
                className={profileInputClass}
                placeholder="Personal note (optional)"
                value={draft.note ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />

              <select
                className={profileInputClass}
                value={draft.priceRange ?? "$$"}
                onChange={(e) => setDraft((d) => ({ ...d, priceRange: e.target.value as PriceRangeHotel }))}
              >
                <option value="$">$ — Budget</option>
                <option value="$$">$$ — Mid-range</option>
                <option value="$$$">$$$ — Luxury</option>
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className={profilePillButtonClass}>Cancel</button>
              <button
                type="button"
                disabled={busy || !draft.name?.trim()}
                onClick={() => void saveDraft()}
                className="rounded-full bg-[color:var(--sage)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
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
