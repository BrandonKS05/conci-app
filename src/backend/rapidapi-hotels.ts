import type { TripPlan } from "@/shared/trip-plan";
import type { HotelPick } from "@/shared/hotels";
import {
  getRapidApiKey,
  getRapidApiKeyDiagnostics,
  isRapidApiHotelsConfigured,
} from "@/backend/rapidapi-key";

/** RapidAPI Booking.com scraper hub: https://rapidapi.com/DataCrawler/api/booking-com15 */
const RAPID_HOST = "booking-com15.p.rapidapi.com";
const BASE = `https://${RAPID_HOST}`;

export { isRapidApiHotelsConfigured };

function rapidHeaders(): Record<string, string> {
  const key = getRapidApiKey();
  if (!key) {
    throw new Error("RAPIDAPI_KEY is not set.");
  }
  return {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": RAPID_HOST,
  };
}

function headersForLog(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  const k = out["X-RapidAPI-Key"];
  if (k) {
    out["X-RapidAPI-Key"] = k.length <= 4 ? "***" : `***…${k.slice(-4)} (length=${k.length})`;
  }
  return out;
}

function responseHeadersObject(res: Response): Record<string, string> {
  const o: Record<string, string> = {};
  res.headers.forEach((val, key) => {
    o[key] = val;
  });
  return o;
}

const LOG_PREFIX = "[rapidapi-hotels]";
const MAX_RAW_BODY_LOG_CHARS = 500_000;

async function rapidGet(path: string, query: Record<string, string | number | undefined>): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    qs.set(k, String(v));
  }
  const url = `${BASE}${path}?${qs.toString()}`;
  const keyDiag = getRapidApiKeyDiagnostics();
  const requestHeaders = rapidHeaders();

  console.info(`${LOG_PREFIX} RapidAPI outgoing request`, {
    method: "GET",
    requestUrl: url,
    host: RAPID_HOST,
    path,
    queryParams: Object.fromEntries(qs.entries()),
    requestHeadersRedacted: headersForLog(requestHeaders),
    rapidApiKeyPresent: keyDiag.present,
    docsHint: "https://rapidapi.com/DataCrawler/api/booking-com15 — host booking-com15.p.rapidapi.com",
  });

  let res: Response;
  try {
    res = await fetch(url, { headers: requestHeaders, cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`${LOG_PREFIX} fetch failed (network / TLS)`, { url, path, message, stack });
    throw new Error(`RapidAPI network error for ${path}: ${message}`);
  }

  const text = await res.text();
  const truncated = text.length > MAX_RAW_BODY_LOG_CHARS;
  const rawBodyForLog = truncated ? `${text.slice(0, MAX_RAW_BODY_LOG_CHARS)}… [truncated]` : text;

  console.info(`${LOG_PREFIX} RapidAPI raw response (before JSON.parse)`, {
    path,
    requestUrl: url,
    responseStatus: res.status,
    responseStatusText: res.statusText,
    responseOk: res.ok,
    responseHeaders: responseHeadersObject(res),
    rawBodyCharLength: text.length,
    rawBodyTruncatedForLog: truncated,
    rawBodyFull: rawBodyForLog,
  });

  if (!res.ok) {
    console.error(`${LOG_PREFIX} RapidAPI HTTP error`, { path, requestUrl: url, status: res.status });
    throw new Error(`RapidAPI GET ${path} (${res.status}): ${text.slice(0, 1200)}`);
  }

  if (!text.trim()) {
    console.error(`${LOG_PREFIX} empty response body`, { path, requestUrl: url });
    throw new Error(`RapidAPI ${path}: empty response body (expected JSON).`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (parseErr) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(`${LOG_PREFIX} JSON.parse failed`, { path, parseErrorMessage: parseMsg });
    throw new Error(`RapidAPI ${path}: response was not JSON (${parseMsg}).`);
  }
}

function fmtYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inferStayDates(plan: TripPlan): { checkIn: string; checkOut: string } {
  for (const opt of plan.dates.options) {
    const iso = opt.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
    if (iso && iso.length >= 2) {
      return { checkIn: iso[0]!, checkOut: iso[1]! };
    }
  }
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 21);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  return { checkIn: fmtYmd(checkIn), checkOut: fmtYmd(checkOut) };
}

function adultsFromPlan(plan: TripPlan): number {
  const n = plan.people.count ?? plan.people.names.length;
  if (typeof n === "number" && n >= 1 && n <= 9) return n;
  return 2;
}

/** Pick first CITY-style row if labels exist; otherwise first usable dest id. */
function extractDestIdFromDestinationSearch(body: unknown, preferredLabel: string): string | null {
  const root = body as Record<string, unknown>;
  const data = root.data;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(root.results)
      ? (root.results as unknown[])
      : [];
  let fallback: string | null = null;

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const type = typeof o.search_type === "string" ? o.search_type : typeof o.type === "string" ? o.type : "";
    const rid = o.dest_id ?? o.destId ?? o.destination_id;
    const id =
      typeof rid === "number"
        ? String(rid)
        : typeof rid === "string" && rid.length > 0
          ? rid
          : null;
    if (!id) continue;
    const label =
      typeof o.name === "string"
        ? o.name
        : typeof o.label === "string"
          ? o.label
          : typeof o.city_name === "string"
            ? o.city_name
            : "";
    if (!fallback) fallback = id;
    const cityLower = preferredLabel.toLowerCase();
    const isCityLike = type === "" || /^CITY/i.test(type) || type === "-1"; // Booking uses numeric types sometimes
    if (isCityLike && label.toLowerCase().includes(cityLower.slice(0, Math.min(cityLower.length, 12)))) return id;
    if (isCityLike && cityLower.includes(label.toLowerCase().slice(0, 10)) && label.length > 2) return id;
  }
  return fallback;
}

function extractHotelsArray(body: unknown): Record<string, unknown>[] {
  const root = body as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    for (const k of ["hotels", "result", "results", "data"] as const) {
      const arr = d[k];
      if (Array.isArray(arr)) return arr as Record<string, unknown>[];
    }
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray(root.hotels)) return root.hotels as Record<string, unknown>[];
  return [];
}

function num(x: unknown): number {
  if (typeof x === "number" && !Number.isNaN(x)) return x;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Map Booking-com15 searchHotels row → HotelPick (defensive paths). */
function mapBookingHotelRow(
  raw: Record<string, unknown>,
  cityLabel: string,
  checkIn: string,
  checkOut: string,
  adults: number
): HotelPick | null {
  const nested = ((raw.property as Record<string, unknown> | undefined) ?? raw) as Record<string, unknown>;
  const name =
    (typeof nested.name === "string" && nested.name) ||
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.hotel_name === "string" && raw.hotel_name) ||
    "";
  if (!name.trim()) return null;

  const idRaw = nested.hotel_id ?? nested.id ?? raw.hotel_id ?? raw.id ?? name;
  const id = String(idRaw);

  let review = num(nested.reviewScore ?? nested.review_score ?? raw.reviewScore ?? raw.review_score);
  if (review > 11) review = review / 10; /* sometimes scaled */
  const ratingParts: string[] = [];
  const stars = nested.propertyClass ?? nested.class ?? nested.starRating;
  if (stars != null && String(stars).trim()) ratingParts.push(`${stars}★ property`);
  if (review > 0) ratingParts.push(`${review.toFixed(1)}/10 guest score`);

  const label = typeof nested.reviewScoreWord === "string" ? nested.reviewScoreWord.trim() : "";
  if (label) ratingParts.push(label);
  const rating = ratingParts.length ? ratingParts.join(" · ") : undefined;

  const pb = raw.priceBreakdown as Record<string, unknown> | undefined;
  const gross = pb?.grossPrice as Record<string, unknown> | undefined;
  const priceVal =
    gross?.value ??
    gross?.amount ??
    (typeof nested.minTotalPrice === "number" ? nested.minTotalPrice : raw.price_display);
  let nights = 2;
  const tIn = new Date(`${checkIn}T12:00:00Z`).getTime();
  const tOut = new Date(`${checkOut}T12:00:00Z`).getTime();
  if (Number.isFinite(tIn) && Number.isFinite(tOut)) {
    nights = Math.max(1, Math.round((tOut - tIn) / 86_400_000) || 1);
  }

  let priceHint = "Price from provider";
  if (priceVal !== undefined && priceVal !== null) {
    const total = num(priceVal);
    if (total > 0) {
      const nightly = Math.round(total / nights);
      priceHint = `~$${nightly}/night · $${Math.round(total)} total (${nights} night${nights === 1 ? "" : "s"})`;
    }
  }

  let bookingUrl =
    (typeof nested.url === "string" && nested.url.startsWith("http") && nested.url) ||
    (typeof raw.url === "string" && raw.url.startsWith("http") && raw.url) ||
    (typeof nested.link === "string" && nested.link.startsWith("http") && nested.link) ||
    (typeof nested.booking_url === "string" && nested.booking_url.startsWith("http") && nested.booking_url);

  if (!bookingUrl && typeof nested.deep_link_url === "string" && nested.deep_link_url.startsWith("http"))
    bookingUrl = nested.deep_link_url;

  if (!bookingUrl) {
    bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(cityLabel)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${adults}`;
  }

  const area =
    (typeof nested.city === "string" && nested.city) ||
    (typeof nested.city_trans === "string" && nested.city_trans) ||
    (typeof nested.distance_to_cc === "string" && nested.distance_to_cc) ||
    cityLabel;

  return {
    id,
    name,
    area,
    rating,
    priceHint,
    bookingUrl,
  };
}

async function bookingSearchDestination(query: string): Promise<string | null> {
  const body = await rapidGet("/api/v1/hotels/searchDestination", { query });
  return extractDestIdFromDestinationSearch(body, query.trim());
}

async function bookingSearchHotels(
  destId: string,
  checkIn: string,
  checkOut: string,
  adults: number
): Promise<Record<string, unknown>[]> {
  const body = await rapidGet("/api/v1/hotels/searchHotels", {
    dest_id: destId,
    search_type: "CITY",
    arrival_date: checkIn,
    departure_date: checkOut,
    adults,
    currency_code: "USD",
    room_qty: 1,
    languagecode: "en-us",
  });
  return extractHotelsArray(body);
}

/**
 * RapidAPI Booking.com (booking-com15): searchDestination → searchHotels.
 * Returns top 3 picks with Booking.com links.
 */
export async function searchHotelsForTrip(plan: TripPlan): Promise<HotelPick[]> {
  const city =
    plan.location?.trim().split(",")[0]?.trim() ||
    plan.title?.trim() ||
    "";
  if (city.length < 2) {
    throw new Error("Add a clearer city or location on the plan to search hotels.");
  }

  const destId = await bookingSearchDestination(city);
  if (!destId) {
    throw new Error(`No destination found for “${city}”. Try a larger nearby city.`);
  }

  const { checkIn, checkOut } = inferStayDates(plan);
  const adults = adultsFromPlan(plan);

  const rows = await bookingSearchHotels(destId, checkIn, checkOut, adults);

  type Scored = { pick: HotelPick; review: number; price: number };
  const mapped: Scored[] = [];

  for (const row of rows) {
    const pick = mapBookingHotelRow(row, city, checkIn, checkOut, adults);
    if (!pick) continue;

    const prop =
      (((row as Record<string, unknown>).property as Record<string, unknown>) ?? row) as Record<string, unknown>;
    const review = num(prop.reviewScore ?? prop.review_score ?? (row as Record<string, unknown>).reviewScore);

    const pb = (row as Record<string, unknown>).priceBreakdown as Record<string, unknown> | undefined;
    const gross = pb?.grossPrice as Record<string, unknown> | undefined;
    const price = num(gross?.value ?? gross?.amount);

    mapped.push({ pick, review, price });
  }

  mapped.sort((a, b) => {
    if (b.review !== a.review) return b.review - a.review;
    const ap = a.price > 0 ? a.price : Number.POSITIVE_INFINITY;
    const bp = b.price > 0 ? b.price : Number.POSITIVE_INFINITY;
    return ap - bp;
  });

  const top = mapped.slice(0, 3).map((m) => m.pick);

  if (top.length === 0) {
    throw new Error("No hotels returned for this destination and dates. Try different dates or another city.");
  }

  return top;
}
