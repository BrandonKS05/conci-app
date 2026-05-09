"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlacePreview, PlaceSpotlight, SpotlightVenueKind } from "@/shared/place-preview";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";
import type { TripPlan } from "@/shared/trip-plan";
import type { TripRosterPerson } from "@/shared/trip-roster";
import { memberVoteKey } from "@/shared/collab-vote-keys";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import { parseCollabState } from "@/shared/collaboration";
import { voteKeysIntersectAliases } from "@/shared/collab-vote-keys";
import {
  inferSpotlightCategory,
  spotlightCategoryBadgeClass,
  spotlightCategoryLabel,
} from "@/shared/spotlight-category";

/** Resolve roster display names for spotlight vote keys (same logic as collaboration panel). */
function displayNamesForSpotlightVoters(keys: string[], roster: TripRosterPerson[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const person = roster.find((p) => voteKeysIntersectAliases([k], new Set(p.voteAliases)));
    const name = person?.displayName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

type BrowseRow = {
  places: PlacePreview[];
  queryUsed: string;
};

const PICKED_SECTIONS: { kind: SpotlightVenueKind; heading: string }[] = [
  { kind: "restaurant", heading: "Restaurants" },
  { kind: "hotel", heading: "Hotels" },
  { kind: "experience", heading: "Experiences" },
];

export function TripSpotlightsInteractive({
  tripId,
  plan,
  viewerUserId,
  initialSpotlightVotes,
  onPlanUpdated,
  onCollabBump,
  collabRefreshSignal = 0,
  isHost = false,
}: {
  tripId: string;
  plan: TripPlan;
  viewerUserId: string;
  initialSpotlightVotes?: Record<string, string[]>;
  onPlanUpdated: (next: TripPlan) => void;
  onCollabBump: () => void;
  /** Increment when collab may have changed (votes elsewhere on the page). */
  collabRefreshSignal?: number;
  isHost?: boolean;
}) {
  const spotlights = useMemo(() => plan.spotlights ?? [], [plan.spotlights]);
  const myKey = memberVoteKey(viewerUserId);

  const [votes, setVotes] = useState<Record<string, string[]>>(initialSpotlightVotes ?? {});
  const [voteRoster, setVoteRoster] = useState<TripRosterPerson[]>([]);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [browseBusy, setBrowseBusy] = useState<string | null>(null);
  const [replaceBusy, setReplaceBusy] = useState<string | null>(null);

  const [differentPageById, setDifferentPageById] = useState<Record<string, number>>({});
  const [morePageById, setMorePageById] = useState<Record<string, number>>({});
  const [excludeById, setExcludeById] = useState<Record<string, string[]>>({});
  const [browseRowById, setBrowseRowById] = useState<Record<string, BrowseRow | null>>({});

  useEffect(() => {
    setVotes(initialSpotlightVotes ?? {});
  }, [initialSpotlightVotes]);

  /** Keep tallies in sync for hosts / other tabs — collaboration GET returns latest spotlightVotes + roster. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/collab`, { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as { collab?: unknown; roster?: TripRosterPerson[] };
        if (!r.ok || cancelled) return;
        if (j.collab) {
          const c = parseCollabState(j.collab);
          setVotes(c.spotlightVotes ?? {});
        }
        if (Array.isArray(j.roster)) setVoteRoster(j.roster);
      } catch {
        //
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, collabRefreshSignal]);

  const pollCollab = useCallback(async () => {
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/collab`, { credentials: "include" });
      const j = (await r.json()) as { collab?: unknown; roster?: TripRosterPerson[] };
      if (!r.ok || !j.collab) return;
      const c = parseCollabState(j.collab);
      setVotes(c.spotlightVotes ?? {});
      if (Array.isArray(j.roster)) setVoteRoster(j.roster);
    } catch {
      //
    }
  }, [tripId]);

  useEffect(() => {
    const ms = isHost ? 8000 : 22000;
    const t = window.setInterval(() => {
      void pollCollab();
    }, ms);
    return () => window.clearInterval(t);
  }, [pollCollab, isHost]);

  const voteCount = useCallback(
    (sid: string) => (votes[sid] ?? []).length,
    [votes]
  );
  const iVoted = useCallback((sid: string) => (votes[sid] ?? []).includes(myKey), [votes, myKey]);

  const toggleVote = async (spotlightId: string) => {
    setVoteBusy(spotlightId);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/spotlights/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotlightId }),
      });
      const j = (await r.json()) as { collab?: unknown; error?: string };
      if (!r.ok) return;
      if (j.collab) {
        const c = parseCollabState(j.collab);
        setVotes(c.spotlightVotes ?? {});
      }
      onCollabBump();
    } finally {
      setVoteBusy(null);
    }
  };

  const mergeExclude = (sid: string, places: PlacePreview[]) => {
    const cur = new Set(excludeById[sid] ?? []);
    for (const s of spotlights) cur.add(s.mapsUrl);
    for (const p of places) cur.add(p.mapsUrl);
    setExcludeById((prev) => ({ ...prev, [sid]: [...cur] }));
  };

  const fetchBrowse = async (sid: string, mode: "different" | "more") => {
    setBrowseBusy(sid);
    try {
      const page =
        mode === "different"
          ? differentPageById[sid] ?? 0
          : morePageById[sid] ?? 0;
      const exclude = [...(excludeById[sid] ?? []), ...spotlights.map((s) => s.mapsUrl)];
      const r = await fetch(`/api/trip-plans/${tripId}/spotlights/browse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotlightId: sid, mode, page, excludeMapsUrls: exclude }),
      });
      const j = (await r.json()) as BrowseRow & { error?: string };
      if (!r.ok || !Array.isArray(j.places)) return;
      setBrowseRowById((prev) => ({ ...prev, [sid]: { places: j.places, queryUsed: j.queryUsed } }));
      mergeExclude(sid, j.places);
      if (mode === "different") {
        setDifferentPageById((prev) => ({ ...prev, [sid]: (prev[sid] ?? 0) + 1 }));
      } else {
        setMorePageById((prev) => ({ ...prev, [sid]: (prev[sid] ?? 0) + 1 }));
      }
    } finally {
      setBrowseBusy(null);
    }
  };

  const replaceWith = async (spotlightId: string, place: PlacePreview) => {
    setReplaceBusy(spotlightId);
    try {
      const r = await fetch(`/api/trip-plans/${tripId}/spotlights/replace`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotlightId,
          place: { ...place, sourceQuery: "Group pick" },
        }),
      });
      const j = (await r.json()) as { plan?: TripPlan; error?: string };
      if (!r.ok || !j.plan) return;
      onPlanUpdated(j.plan);
      setBrowseRowById((prev) => ({ ...prev, [spotlightId]: null }));
      setDifferentPageById((prev) => ({ ...prev, [spotlightId]: 0 }));
      setMorePageById((prev) => ({ ...prev, [spotlightId]: 0 }));
      setExcludeById((prev) => {
        const next = { ...prev };
        delete next[spotlightId];
        return next;
      });
      void pollCollab();
      onCollabBump();
    } finally {
      setReplaceBusy(null);
    }
  };

  const rows = useMemo(
    () =>
      spotlights.map((s) => ({
        s,
        id: spotlightStableIdFromMapsUrl(s.mapsUrl),
      })),
    [spotlights]
  );

  const groupedRows = useMemo(() => {
    const buckets: Record<SpotlightVenueKind, { s: PlaceSpotlight; id: string }[]> = {
      restaurant: [],
      hotel: [],
      experience: [],
    };
    for (const row of rows) {
      buckets[inferSpotlightCategory(row.s)].push(row);
    }
    return buckets;
  }, [rows]);

  if (!rows.length) return null;

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
          Picked places
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          Vote for favorites, or browse alternatives three at a time.
        </p>
      </div>

      <div className="space-y-10">
        {PICKED_SECTIONS.map(({ kind, heading }) => {
          const sectionRows = groupedRows[kind];
          if (!sectionRows.length) return null;
          return (
            <div key={kind}>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500">
                {heading}
              </h4>
              <ul className="space-y-6">
                {sectionRows.map(({ s, id }) => {
                  const browse = browseRowById[id];
                  const venueKind = inferSpotlightCategory(s);
                  return (
            <li key={id} className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-dm-elevated">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <a
                  href={s.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-left ring-1 ring-slate-200/50 dark:border-white/10 dark:bg-[#1a1a1a] dark:ring-white/[0.04]"
                >
                  {s.photoUrl ? (
                    <Image
                      src={s.photoUrl}
                      alt=""
                      width={112}
                      height={112}
                      unoptimized
                      className="h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-28"
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-slate-200 text-xs text-slate-500 dark:bg-white/10 sm:h-28 sm:w-28">
                      Map
                    </div>
                  )}
                  <div className="min-w-0 flex-1 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${spotlightCategoryBadgeClass(venueKind)}`}
                      >
                        {spotlightCategoryLabel(venueKind)}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-neutral-400">
                      {s.rating != null ? (
                        <span className="font-medium text-amber-700 dark:text-amber-400">{s.rating.toFixed(1)}</span>
                      ) : null}
                      {s.rating != null ? " ★" : null}
                      {s.reviewCount != null ? (
                        <span className="text-slate-500 dark:text-neutral-500"> · {s.reviewCount.toLocaleString()} reviews</span>
                      ) : null}
                      {s.priceRange ? <span> · {s.priceRange}</span> : null}
                    </p>
                    {s.address ? <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-neutral-400">{s.address}</p> : null}
                  </div>
                </a>

                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-40">
                  <button
                    type="button"
                    disabled={voteBusy === id}
                    onClick={() => void toggleVote(id)}
                    className={`rounded-xl px-3 py-2 text-sm transition ${
                      iVoted(id)
                        ? primaryFilledInteractive
                        : "border border-slate-300 bg-white font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#222] dark:text-[#ebe9e4] dark:hover:bg-white/5"
                    }`}
                  >
                    {voteBusy === id ? "…" : iVoted(id) ? `Voted · ${voteCount(id)}` : `Vote · ${voteCount(id)}`}
                  </button>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      disabled={browseBusy === id}
                      onClick={() => void fetchBrowse(id, "more")}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 hover:border-orange-400/50 dark:border-white/10 dark:bg-[#1e1e1e] dark:text-[#e4e2de]"
                    >
                      More
                    </button>
                  </div>
                </div>
              </div>

              {isHost && voteCount(id) > 0 ? (
                <div className="mt-3 rounded-xl border border-indigo-200/60 bg-indigo-50/50 px-3 py-2 dark:border-indigo-500/25 dark:bg-indigo-950/25">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300/90">
                    {voteCount(id)} vote{voteCount(id) === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-slate-700 dark:text-neutral-300">
                    {displayNamesForSpotlightVoters(votes[id] ?? [], voteRoster).join(", ") || "Votes recorded"}
                  </p>
                </div>
              ) : null}

              {browse?.places?.length ? (
                <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-4 dark:border-white/10">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-500">
                    Alternatives{browse.queryUsed ? ` · ${browse.queryUsed.slice(0, 72)}${browse.queryUsed.length > 72 ? "…" : ""}` : ""}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {browse.places.map((p, idx) => (
                      <div
                        key={`${p.mapsUrl}-${idx}`}
                        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#161616]"
                      >
                        {p.photoUrl ? (
                          <div className="relative h-24 w-full">
                            <Image src={p.photoUrl} alt="" fill sizes="200px" unoptimized className="object-cover" />
                          </div>
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-slate-100 text-[10px] text-slate-400 dark:bg-[#2a2a2a]">
                            Map
                          </div>
                        )}
                        <div className="flex flex-1 flex-col gap-1 p-2">
                          <p className="line-clamp-2 text-xs font-semibold text-slate-900 dark:text-white">{p.name}</p>
                          <p className="text-[10px] text-slate-600 dark:text-neutral-400">
                            {p.rating != null ? `${p.rating.toFixed(1)} ★` : ""}
                            {p.priceRange ? ` · ${p.priceRange}` : ""}
                          </p>
                          <button
                            type="button"
                            disabled={replaceBusy === id}
                            onClick={() => void replaceWith(id, p)}
                            className="mt-auto rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-[#ebe9e4] dark:text-[#141414]"
                          >
                            Use on card
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
