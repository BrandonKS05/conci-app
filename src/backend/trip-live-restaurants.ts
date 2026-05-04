import { getRapidApiKey } from "@/backend/rapidapi-key";
import {
  getRapidApiOpenTableHost,
  getRapidApiOpenTableSearchPath,
} from "@/backend/env-api-keys";
import type { TripPlan } from "@/shared/trip-plan";
import type { RestaurantPick } from "@/shared/restaurants";

const VEYA_BASE = "https://opentable.veeya.me/api";
const YELP_RAPID_HOST = "yelp-business-api.p.rapidapi.com";

function firstDateIsoFromPlan(plan: TripPlan): string | undefined {
  for (const d of plan.dates.options) {
    const iso = d.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const t = Date.parse(d);
    if (!Number.isNaN(t)) {
      const x = new Date(t);
      if (!Number.isNaN(x.getTime())) return x.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

function partySize(plan: TripPlan): number {
  const n = plan.people.count;
  if (n == null || Number.isNaN(n)) return 2;
  return Math.max(1, Math.min(20, Math.round(n)));
}

function priceDotsFromLevel(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const k = Math.min(4, Math.max(1, Math.round(n)));
  return "$".repeat(k);
}

function parseCityCountry(plan: TripPlan): { city: string; country: string; state: string } {
  const loc = plan.location?.trim() || "";
  const parts = loc.split(",").map((s) => s.trim());
  const city = parts[0] || "New York";
  let state = "";
  if (parts.length >= 2 && /^[A-Z]{2}$/i.test(parts[1]!)) state = parts[1]!.toUpperCase();
  const country = /canada|uk|united kingdom|france|spain|mexico|japan|australia/i.test(loc) ? "CA" : "US";
  return { city, country: country === "CA" && /canada/i.test(loc) ? "CA" : "US", state };
}

function numRating(r: Record<string, unknown>): number | undefined {
  const keys = [
    "aggregate_rating",
    "average_rating",
    "review_rating_score",
    "rating",
    "stars",
    "review_rating",
  ];
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseFloat(v.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function reviewCount(r: Record<string, unknown>): number {
  const keys = ["reviews_total", "review_count", "reviews_count", "num_reviews"];
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function mapOpenTableRow(r: Record<string, unknown>, id: string): RestaurantPick {
  const name = String(r.name ?? "Restaurant").slice(0, 120);
  const city = String(r.city ?? "");
  const area = String(r.area ?? r.neighborhood ?? r.metro_name ?? "");
  const addr = String(r.address ?? r.street ?? "");
  const neighborhood = [area, addr, city].filter(Boolean).join(" · ") || city || "—";

  const rawReserve = r.reserve_url ?? r.mobile_reserve_url ?? r.reserveUrl ?? r.booking_url;
  const reserve =
    typeof rawReserve === "string" && rawReserve.startsWith("http")
      ? rawReserve.replace(/^http:\/\//, "https://")
      : `https://www.opentable.com/s?${new URLSearchParams({ name, location: city }).toString()}`;

  const priceNum = typeof r.price === "number" ? r.price : undefined;
  const priceBand =
    typeof r.price_band === "string" && r.price_band.trim()
      ? r.price_band.trim()
      : typeof r.price_range === "string" && r.price_range.trim()
        ? r.price_range.trim()
        : typeof r.price_display === "string" && r.price_display.trim()
          ? r.price_display.trim()
          : null;

  const dots = priceDotsFromLevel(priceNum);
  const priceRange = priceBand ? `${priceBand} (${dots})` : `${dots} · typical spend tier`;

  const rt = r.restaurant_type ?? r.primary_cuisine ?? (Array.isArray(r.cuisines) ? (r.cuisines as { name?: string }[])[0]?.name : undefined);
  const cuisineType = typeof rt === "string" ? rt : undefined;

  const ratingN = numRating(r);
  const rc = reviewCount(r);
  const ratingDisplay =
    ratingN != null && ratingN > 0
      ? `${ratingN.toFixed(1)} ★${rc ? ` (${rc} reviews)` : ""}`
      : rc > 0
        ? `${rc} reviews`
        : "Listed on OpenTable";

  return {
    id,
    name,
    neighborhood: neighborhood.slice(0, 160),
    ratingDisplay,
    priceRange,
    openTableUrl: reserve,
    cuisineType,
    reserveCtaLabel: "Reserve on OpenTable",
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

function hostHeaderValue(host: string): string {
  return host.replace(/^https?:\/\//i, "").split("/")[0]!;
}

type OtSearchParams = {
  city: string;
  country: string;
  state: string;
  name?: string;
  partySize: number;
  dateIso?: string;
};

async function searchOpenTableVeeya(params: OtSearchParams): Promise<Record<string, unknown>[]> {
  const qs = new URLSearchParams();
  qs.set("city", params.city);
  qs.set("country", params.country);
  if (params.state) qs.set("state", params.state);
  if (params.name?.trim()) qs.set("name", params.name.trim().slice(0, 80));
  qs.set("per_page", "25");
  qs.set("party_size", String(params.partySize));
  if (params.dateIso) qs.set("date", params.dateIso);
  const data = (await fetchJson(`${VEYA_BASE}/restaurants?${qs}`, {
    headers: { Accept: "application/json" },
  })) as { restaurants?: unknown };
  const list = Array.isArray(data.restaurants) ? data.restaurants : [];
  return list.filter((x): x is Record<string, unknown> => x && typeof x === "object");
}

async function searchOpenTableRapid(params: OtSearchParams): Promise<Record<string, unknown>[]> {
  const host = getRapidApiOpenTableHost();
  const key = getRapidApiKey();
  if (!host || !key) return [];

  const path = getRapidApiOpenTableSearchPath() || "/api/restaurants";
  const qs = new URLSearchParams();
  qs.set("city", params.city);
  qs.set("country", params.country);
  if (params.state) qs.set("state", params.state);
  if (params.name?.trim()) qs.set("name", params.name.trim().slice(0, 80));
  qs.set("per_page", "25");
  qs.set("party_size", String(params.partySize));
  qs.set("covers", String(params.partySize));
  qs.set("guests", String(params.partySize));
  if (params.dateIso) {
    qs.set("date", params.dateIso);
    qs.set("start_date", params.dateIso);
  }

  const cleanHost = host.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const url = `https://${cleanHost}${path.startsWith("/") ? path : `/${path}`}?${qs}`;
  const data = (await fetchJson(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": hostHeaderValue(host),
      Accept: "application/json",
    },
  })) as { restaurants?: unknown; data?: unknown };
  const raw = data.restaurants ?? data.data;
  const list = Array.isArray(raw) ? raw : [];
  return list.filter((x): x is Record<string, unknown> => x && typeof x === "object");
}

async function searchYelpRapid(location: string, term: string): Promise<Record<string, unknown>[]> {
  const key = getRapidApiKey();
  if (!key) return [];
  const qs = new URLSearchParams({
    location: location.slice(0, 120),
    term: term.slice(0, 80) || "restaurants",
    limit: "10",
  });
  const url = `https://${YELP_RAPID_HOST}/search?${qs}`;
  let res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": YELP_RAPID_HOST,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const alt = `https://${YELP_RAPID_HOST}/businesses/search?${qs}`;
    res = await fetch(alt, {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": YELP_RAPID_HOST,
        Accept: "application/json",
      },
    });
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { businesses?: unknown };
  const list = Array.isArray(data.businesses) ? data.businesses : [];
  return list.filter((x): x is Record<string, unknown> => x && typeof x === "object");
}

function mapYelpRow(r: Record<string, unknown>, id: string): RestaurantPick {
  const name = String(r.name ?? "Restaurant").slice(0, 120);
  const loc = r.location && typeof r.location === "object" ? (r.location as Record<string, unknown>) : {};
  const disp = Array.isArray(loc.display_address) ? (loc.display_address as string[]) : [];
  const neighborhood = disp.join(", ") || String(loc.city ?? "—");
  const rating = typeof r.rating === "number" ? r.rating.toFixed(1) : "—";
  const rc = typeof r.review_count === "number" ? r.review_count : 0;
  const price = typeof r.price === "string" ? r.price : "—";
  const url = typeof r.url === "string" ? r.url : `https://www.yelp.com/search?find_desc=${encodeURIComponent(name)}`;
  const cats = Array.isArray(r.categories) ? r.categories : [];
  const c0 = cats[0] && typeof cats[0] === "object" ? (cats[0] as { title?: string }).title : undefined;
  return {
    id,
    name,
    neighborhood: neighborhood.slice(0, 160),
    ratingDisplay: `${rating} ★ · Yelp (${rc} reviews)`,
    priceRange: `${price} · Yelp`,
    openTableUrl: url,
    cuisineType: typeof c0 === "string" ? c0 : undefined,
    reserveCtaLabel: "View on Yelp",
  };
}

function uniqueByName(rows: Record<string, unknown>[], limit: number): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const n = String(r.name ?? "").trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

async function resolveRowsForHint(
  base: OtSearchParams,
  hint: string | undefined,
  locationStr: string
): Promise<{ row?: Record<string, unknown>; yelpFallback?: RestaurantPick; err?: string }> {
  const p = { ...base, name: hint?.trim() || undefined };
  try {
    let rows = await searchOpenTableRapid(p).catch(() => []);
    if (!rows.length) rows = await searchOpenTableVeeya(p);
    const uniq = uniqueByName(rows, 5);
    const row = uniq[0];
    if (row) return { row };
    const yRows = await searchYelpRapid(locationStr, `${(hint ?? "restaurant").trim() || "restaurant"} restaurant`);
    if (yRows.length) return { yelpFallback: mapYelpRow(yRows[0]!, "") };
    return { err: hint ? `No match for “${hint.slice(0, 40)}”` : "No restaurants returned for this city." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Restaurant lookup failed";
    try {
      const yRows = await searchYelpRapid(locationStr, `${(hint ?? "restaurant").trim() || "restaurant"} restaurant`);
      if (yRows.length) return { yelpFallback: mapYelpRow(yRows[0]!, "") };
    } catch {
      /* ignore */
    }
    return { err: msg };
  }
}

/**
 * Up to three `RestaurantPick` rows for the trip destination.
 * Uses RapidAPI OpenTable host when configured, else Veeya public mirror, else Yelp on RapidAPI.
 * When venue poll hints exist, each hint refines search; otherwise returns top distinct city listings.
 */
export async function fetchLiveRestaurantsForPlan(plan: TripPlan, hints: string[]): Promise<{
  picks: RestaurantPick[];
  error: string | null;
}> {
  const locationStr = plan.location?.trim();
  if (!locationStr) return { picks: [], error: null };

  const { city, country, state } = parseCityCountry(plan);
  const ps = partySize(plan);
  const dateIso = firstDateIsoFromPlan(plan);
  const base: OtSearchParams = { city, country, state, partySize: ps, dateIso };

  const picks: RestaurantPick[] = [];
  const errors: string[] = [];

  const effectiveHints = hints.filter(Boolean).slice(0, 3);

  if (effectiveHints.length === 0) {
    try {
      let rows = await searchOpenTableRapid(base).catch(() => []);
      if (!rows.length) rows = await searchOpenTableVeeya(base);
      const top = uniqueByName(rows, 3);
      for (let i = 0; i < top.length; i += 1) {
        picks.push(mapOpenTableRow(top[i]!, `eat-${i}`));
      }
      if (!picks.length) {
        const yRows = await searchYelpRapid(locationStr, "restaurants dinner");
        for (let i = 0; i < Math.min(3, yRows.length); i += 1) {
          picks.push(mapYelpRow(yRows[i]!, `eat-${i}`));
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "City restaurant search failed");
    }
    return {
      picks,
      error: errors.length
        ? errors[0]!
        : picks.length
          ? null
          : "Could not load live restaurants (set RAPIDAPI_OPENTABLE_HOST + RAPIDAPI_KEY, or rely on public directory).",
    };
  }

  for (let i = 0; i < effectiveHints.length; i += 1) {
    const hint = effectiveHints[i]!;
    const id = `eat-${i}`;
    const res = await resolveRowsForHint(base, hint, locationStr);
    if (res.yelpFallback) {
      picks.push({ ...res.yelpFallback, id });
      continue;
    }
    if (res.row) {
      picks.push(mapOpenTableRow(res.row, id));
      continue;
    }
    if (res.err) errors.push(res.err);
  }

  return {
    picks,
    error: errors.length ? errors.slice(0, 2).join(" · ") : picks.length ? null : "Could not load live restaurants.",
  };
}
