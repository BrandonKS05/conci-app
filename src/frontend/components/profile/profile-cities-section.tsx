"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ProfileCity } from "@/shared/user-profile-page";
import type { ProfileSearchResult } from "@/app/api/places/profile-search/route";
import {
  ProfileSectionLabel,
  profileCardClass,
  profilePillButtonClass,
} from "@/frontend/components/profile/profile-section-label";

const profileInputClass =
  "w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/10 dark:bg-[#222]/80 dark:text-[#ebe9e4]";

function Spinner() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--hairline)] border-t-[color:var(--sage)] dark:border-white/10 dark:border-t-[color:var(--sage-soft)]" />
    </div>
  );
}

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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(cities), [cities]);

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
          body: JSON.stringify({ q, mode: "city" }),
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
    if (local.length >= 24) return;
    setDraft({ city: "", country: "", note: "", order: local.length });
    setSearchQuery("");
    setSearchResults([]);
  }

  function pickResult(r: ProfileSearchResult) {
    // Split "City, Country" style addresses
    const parts = r.address ? r.address.split(",") : [];
    const country = parts.length > 1 ? parts[parts.length - 1]!.trim() : "";
    setDraft((d) => ({
      ...d,
      city: r.name,
      country,
      photoUrl: r.photoUrl,
    }));
    setSearchQuery(r.name);
    setSearchResults([]);
  }

  async function persist(next: ProfileCity[]) {
    setBusy(true);
    try {
      await onSave(next);
      setLocal(next);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft?.city?.trim()) return;
    const item: ProfileCity = {
      id: crypto.randomUUID(),
      city: draft.city.trim(),
      country: (draft.country ?? "").trim(),
      note: (draft.note ?? "").trim(),
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
    <section className="mt-10 pb-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ProfileSectionLabel>Cities you&apos;ve been to</ProfileSectionLabel>
        {editMode && local.length < 24 ? (
          <button
            type="button"
            disabled={busy}
            onClick={openDraft}
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--sage)] hover:underline dark:text-[color:var(--sage-soft)]"
          >
            <span className="text-lg leading-none">+</span> Add a city
          </button>
        ) : null}
      </div>

      {local.length === 0 && isSelf ? (
        <button
          type="button"
          onClick={openDraft}
          className={`w-full border-dashed px-4 py-10 text-sm font-medium text-[color:var(--on-surface-variant)] transition hover:border-[color:var(--sage)]/55 hover:text-[color:var(--sage)] dark:text-[#9c9a96] dark:hover:text-[color:var(--sage-soft)] ${profileCardClass}`}
        >
          Add your first city
        </button>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {local.map((c, idx) => (
            <li key={c.id} className={`relative overflow-hidden p-0 ${profileCardClass}`}>
              {c.photoUrl ? (
                <div className="relative h-20 w-full bg-[color:var(--surface-container-high)] dark:bg-[#222]">
                  <Image
                    src={c.photoUrl}
                    alt={c.city}
                    fill
                    className="object-cover"
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                </div>
              ) : null}
              <div className="p-3">
                {editMode ? (
                  <div className="absolute right-3 top-3 flex gap-2 text-xs text-[color:var(--on-surface-muted)] dark:text-[#6b6965]">
                    <button type="button" onClick={() => move(idx, -1)} aria-label="Move up">↑</button>
                    <button type="button" onClick={() => move(idx, 1)} aria-label="Move down">↓</button>
                    <button type="button" className="text-rose-600 dark:text-rose-400" onClick={() => void persist(local.filter((x) => x.id !== c.id))}>×</button>
                  </div>
                ) : null}
                <h3 className="pr-14 font-display text-base font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
                  {c.city}
                </h3>
                {c.country ? (
                  <p className="mt-0.5 text-xs text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">{c.country}</p>
                ) : null}
                {c.note ? (
                  <p className="mt-1.5 text-sm italic text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">&ldquo;{c.note}&rdquo;</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setDraft(null)} aria-label="Close" />
          <div className={`relative w-full max-w-md p-6 ${profileCardClass}`}>
            <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Add city</h3>

            <div className="mt-4 space-y-4">
              {/* Search input */}
              <div className="relative">
                <input
                  className={profileInputClass}
                  placeholder="Search city name…"
                  value={searchQuery}
                  autoFocus
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDraft((d) => ({ ...d, city: e.target.value, photoUrl: null }));
                  }}
                />
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

              {/* Photo preview after selection */}
              {draft.photoUrl ? (
                <div className="relative h-24 w-full overflow-hidden rounded-lg">
                  <Image src={draft.photoUrl} alt="" fill className="object-cover" unoptimized sizes="100%" />
                </div>
              ) : null}

              <input
                className={profileInputClass}
                placeholder="Short note (optional)"
                value={draft.note ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className={profilePillButtonClass}>Cancel</button>
              <button
                type="button"
                disabled={busy || !draft.city?.trim()}
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
