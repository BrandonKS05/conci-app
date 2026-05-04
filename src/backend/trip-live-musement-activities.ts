/**
 * Optional RapidAPI activities product (e.g. Musement) — same RAPIDAPI_KEY.
 * Configure RAPIDAPI_MUSEMENT_HOST + RAPIDAPI_MUSEMENT_PATH from the playground, or RAPIDAPI_ACTIVITIES_*.
 */
import { getRapidApiKey } from "@/backend/rapidapi-key";
import {
  getRapidApiActivitiesHost,
  getRapidApiActivitiesPath,
  getRapidApiMusementHost,
  getRapidApiMusementPath,
} from "@/backend/env-api-keys";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";

function hostHeader(host: string): string {
  return host.replace(/^https?:\/\//i, "").split("/")[0]!;
}

function destinationCity(plan: TripPlan): string {
  const loc = plan.location?.trim();
  if (loc?.length) return loc.split(",")[0]!.trim();
  return plan.title?.trim() || "";
}

function experienceKeywords(plan: TripPlan): string[] {
  const raw: string[] = [];
  if (Array.isArray(plan.vibe)) raw.push(...plan.vibe);
  const polls = plan.polls;
  if (polls?.vibePick?.length) raw.push(...polls.vibePick);
  if (polls?.activities?.length) raw.push(...polls.activities);
  const tokens = new Set<string>();
  for (const s of raw) {
    const t = s.trim().toLowerCase();
    if (!t) continue;
    tokens.add(t);
    for (const part of t.split(/[^a-z0-9]+/i)) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  return [...tokens];
}

function extractArray(root: unknown): Record<string, unknown>[] {
  if (!root || typeof root !== "object") return [];
  const o = root as Record<string, unknown>;
  for (const key of ["data", "results", "items", "activities", "products", "attractions"]) {
    const v = o[key];
    if (Array.isArray(v)) {
      return v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x));
    }
  }
  return [];
}

function scoreRow(row: Record<string, unknown>, keywords: string[]): number {
  if (!keywords.length) return 0;
  const hay = JSON.stringify(row).toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length >= 3 && hay.includes(kw)) score += 1;
  }
  return score;
}

function numRating(row: Record<string, unknown>): number {
  for (const k of ["rating", "average_rating", "review_rating", "stars"]) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseFloat(v.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function mapRow(row: Record<string, unknown>, dest: string): LiveExperienceCard {
  const name = String(row.name ?? row.title ?? "Activity").slice(0, 160);
  const price =
    typeof row.price === "string"
      ? row.price
      : typeof row.from_price === "number"
        ? `From ${row.from_price} / person`
        : typeof row.min_price === "string"
          ? row.min_price
          : "See listing for price";
  const r = numRating(row);
  const rating = r > 0 ? `${r.toFixed(1)} ★` : "—";
  const dur =
    typeof row.duration === "string" && row.duration.trim()
      ? row.duration.trim()
      : typeof row.duration_minutes === "number"
        ? `${row.duration_minutes} min`
        : "—";
  const linkKeys = ["booking_url", "url", "web_url", "link", "deeplink"];
  let bookingUrl = "";
  for (const k of linkKeys) {
    const v = row[k];
    if (typeof v === "string" && v.startsWith("http")) {
      bookingUrl = v;
      break;
    }
  }
  if (!bookingUrl) {
    bookingUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${dest}`.trim())}`;
  }
  return {
    name,
    pricePerPerson: String(price).slice(0, 100),
    rating,
    duration: dur.slice(0, 80),
    bookingUrl,
  };
}

export async function fetchMusementOrActivitiesRapid(plan: TripPlan): Promise<{
  items: LiveExperienceCard[];
  error: string | null;
}> {
  const key = getRapidApiKey();
  const museH = getRapidApiMusementHost();
  const actH = getRapidApiActivitiesHost();
  const host = museH ?? actH;
  const path = museH
    ? (getRapidApiMusementPath() ?? "/search")
    : actH
      ? (getRapidApiActivitiesPath() ?? "/search")
      : "/search";

  if (!key || !host) {
    return { items: [], error: null };
  }

  const dest = destinationCity(plan);
  if (!dest) return { items: [], error: null };

  const kw = experienceKeywords(plan);
  const q = [dest, ...kw.slice(0, 4)].filter(Boolean).join(" ").slice(0, 200);
  const qs = new URLSearchParams();
  qs.set("q", q);
  qs.set("query", q);
  qs.set("search", q);
  qs.set("keyword", q.slice(0, 120));
  qs.set("location", dest);

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `https://${hostHeader(host)}${cleanPath}?${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": hostHeader(host),
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { items: [], error: `${res.status}: ${text.slice(0, 160)}` };
    }
    const parsed = JSON.parse(text) as unknown;
    const rows = extractArray(parsed);
    const scored = rows.map((row) => ({
      row,
      score: scoreRow(row, kw),
      ratingN: numRating(row),
    }));
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.ratingN - a.ratingN;
    });
    const items = scored.slice(0, 3).map(({ row }) => mapRow(row, dest));
    return {
      items,
      error: items.length ? null : "Musement/activities API returned no rows for this query.",
    };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : "Musement/activities request failed.",
    };
  }
}
