import { getRapidApiKey } from "@/backend/rapidapi-key";
import {
  getRapidApiTravelInfoHost,
  getRapidApiTravelInfoPath,
  getRapidApiTripadvisorHost,
  getRapidApiTripadvisorSearchPath,
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

function buildSearchQuery(plan: TripPlan): string {
  const city = destinationCity(plan);
  const kw = experienceKeywords(plan).slice(0, 6);
  const tail = kw.length ? ` ${kw.join(" ")}` : "";
  return `${city} things to do${tail}`.trim().slice(0, 200);
}

function extractArray(root: unknown): Record<string, unknown>[] {
  if (!root || typeof root !== "object") return [];
  const o = root as Record<string, unknown>;
  for (const key of ["data", "results", "locations", "items", "searchResults", "attractions", "activities"]) {
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
  const keys = ["rating", "bubble_rating", "review_rating", "average_rating", "combinedAverageRating"];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseFloat(v.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function priceLabel(row: Record<string, unknown>): string {
  const keys = ["price", "price_string", "price_range", "price_level", "offer_text", "from_price", "min_price"];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 80);
    if (typeof v === "number" && Number.isFinite(v)) return `From ${v}`;
  }
  const offers = row.offers;
  if (Array.isArray(offers) && offers[0] && typeof offers[0] === "object") {
    const o = offers[0] as Record<string, unknown>;
    const p = o.price ?? o.display_price ?? o.label;
    if (typeof p === "string" && p.trim()) return p.trim().slice(0, 80);
  }
  return "See Tripadvisor for pricing";
}

function bookingUrl(row: Record<string, unknown>, fallbackQuery: string): string {
  const keys = ["web_url", "website", "url", "link", "booking_url", "tripadvisor_url"];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  const id = row.location_id ?? row.locationId ?? row.id;
  if (typeof id === "string" || typeof id === "number") {
    return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(String(id))}`;
  }
  return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(fallbackQuery)}`;
}

function mapRow(row: Record<string, unknown>, fallbackQuery: string): LiveExperienceCard {
  const name = String(row.name ?? row.title ?? row.location_name ?? "Experience").slice(0, 160);
  const r = numRating(row);
  const rating = r > 0 ? `${r.toFixed(1)} ★` : "—";
  return {
    name,
    pricePerPerson: priceLabel(row),
    rating,
    duration: "—",
    bookingUrl: bookingUrl(row, `${name} ${fallbackQuery}`.trim()),
  };
}

async function rapidGetJson(host: string, path: string, qs: URLSearchParams): Promise<unknown> {
  const key = getRapidApiKey();
  if (!key) throw new Error("Missing RAPIDAPI_KEY");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `https://${hostHeader(host)}${cleanPath}?${qs}`;
  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": hostHeader(host),
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid JSON from activities provider");
  }
}

async function searchTripadvisor(query: string): Promise<Record<string, unknown>[]> {
  const host = getRapidApiTripadvisorHost();
  const configured = getRapidApiTripadvisorSearchPath();
  const qs = new URLSearchParams();
  qs.set("searchQuery", query);
  qs.set("category", "attractions");
  qs.set("language", "en");
  qs.set("lang", "en_US");

  const paths = [...new Set([configured, "/attractions/search", "/locations/search", "/search"])].filter(
    (p) => p.startsWith("/")
  );

  for (const path of paths) {
    try {
      const parsed = await rapidGetJson(host, path, qs);
      const rows = extractArray(parsed);
      if (rows.length) return rows;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/\b404\b/i.test(msg) && !/does not exist/i.test(msg)) throw e;
    }
  }
  return [];
}

/** Optional second provider when Tripadvisor returns nothing (configure host/path from RapidAPI “Travel Info” product). */
async function searchTravelInfoBackup(query: string): Promise<Record<string, unknown>[]> {
  const host = getRapidApiTravelInfoHost();
  if (!host) return [];
  const path = getRapidApiTravelInfoPath();
  const qs = new URLSearchParams();
  qs.set("q", query);
  qs.set("query", query);
  qs.set("keyword", query.slice(0, 120));
  try {
    const parsed = await rapidGetJson(host, path, qs);
    return extractArray(parsed);
  } catch {
    return [];
  }
}

export async function fetchTripadvisorExperiences(plan: TripPlan): Promise<{
  items: LiveExperienceCard[];
  error: string | null;
}> {
  const key = getRapidApiKey();
  if (!key) {
    return { items: [], error: "Add RAPIDAPI_KEY to load experiences (Tripadvisor on RapidAPI)." };
  }

  const dest = destinationCity(plan);
  if (!dest) {
    return { items: [], error: "Set a destination on the plan for activity search." };
  }

  const query = buildSearchQuery(plan);
  const keywords = experienceKeywords(plan);

  try {
    let rows = await searchTripadvisor(query);
    if (!rows.length) {
      rows = await searchTripadvisor(`${dest} tours activities`);
    }
    if (!rows.length) {
      rows = await searchTravelInfoBackup(query);
    }

    const scored = rows.map((row) => ({
      row,
      score: scoreRow(row, keywords),
      ratingN: numRating(row),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.ratingN - a.ratingN;
    });

    const items = scored.slice(0, 3).map(({ row }) => mapRow(row, dest));
    return {
      items,
      error: items.length ? null : "No attractions or activities returned for this search.",
    };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : "Tripadvisor experiences request failed.",
    };
  }
}
