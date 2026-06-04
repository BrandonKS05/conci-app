import {
  getLiteApiKey,
  isLiteApiConfigured,
  getLiteApiEnvironment,
  getLiteApiMarginPct,
  getGooglePlacesApiKey,
} from "@/backend/env-api-keys";
import type {
  LiteApiHotelResult,
  LiteApiRate,
  LiteApiPrebookResult,
  LiteApiBookingRecord,
  LiteApiBookingGuest,
  LiteApiCancellationPolicy,
  LiteApiEnvironment,
} from "@/shared/liteapi";

export { isLiteApiConfigured };

/** Search, hotel content, and static data live on the data host (all free). */
const DATA_BASE = "https://api.liteapi.travel/v3.0";
/** Prebook and book live on the booking host — NOT api.liteapi.travel. */
const BOOK_BASE = "https://book.liteapi.travel/v3.0";
const LOG = "[liteapi]";

function liteApiHeaders(): Record<string, string> {
  const key = getLiteApiKey();
  if (!key) throw new Error("LITEAPI_API_KEY is not set.");
  return {
    "X-API-Key": key,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function liteGet(base: string, path: string, query: Record<string, string | number | undefined>): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    qs.set(k, String(v));
  }
  const url = `${base}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: liteApiHeaders(), cache: "no-store" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} GET network error`, { path, msg });
    throw new Error(`LiteAPI network error: ${msg}`);
  }

  const text = await res.text();
  console.info(`${LOG} GET ${path}`, { status: res.status, bodyLen: text.length });

  if (!res.ok) throw new Error(`LiteAPI GET ${path} (${res.status}): ${text.slice(0, 800)}`);
  if (!text.trim()) throw new Error(`LiteAPI ${path}: empty response.`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`LiteAPI ${path}: response was not JSON.`);
  }
}

async function litePost(base: string, path: string, body: unknown): Promise<unknown> {
  const url = `${base}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: liteApiHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} POST network error`, { path, msg });
    throw new Error(`LiteAPI network error: ${msg}`);
  }

  const text = await res.text();
  console.info(`${LOG} POST ${path}`, { status: res.status, bodyLen: text.length });

  if (!res.ok) throw new Error(`LiteAPI POST ${path} (${res.status}): ${text.slice(0, 800)}`);
  if (!text.trim()) throw new Error(`LiteAPI ${path}: empty response.`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`LiteAPI ${path}: response was not JSON.`);
  }
}

// ─── Geocoding (Google Places — never LiteAPI /data/places) ─────────────────

async function geocodeDestination(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const googleApiKey = getGooglePlacesApiKey();
  if (!googleApiKey) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: query }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{ location?: { latitude: number; longitude: number } }>;
    };
    return data.places?.[0]?.location ?? null;
  } catch {
    return null;
  }
}

// ─── Primitives ─────────────────────────────────────────────────────────────

function num(x: unknown): number {
  if (typeof x === "number" && !Number.isNaN(x)) return x;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}

function parseCancellationPolicies(raw: unknown): LiteApiCancellationPolicy[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    const o = asRecord(p);
    return {
      cancelByDate: str(o.cancelByDate || o.cancelBy || o.deadline) || null,
      refundable: o.refundable === true || o.type === "FREE_CANCELLATION",
      description: str(o.description || o.condition) || null,
    };
  });
}

function parseRate(raw: unknown): LiteApiRate | null {
  const o = asRecord(raw);
  // In v3, a rate's offer identifier is `rateId` (also accepted as `offerId` upstream).
  const rateId = str(o.rateId || o.offerId || o.id);
  if (!rateId) return null;

  const retail = asRecord(o.retailRate);
  const totalArr = Array.isArray(retail.total) ? (retail.total as unknown[]) : [];

  return {
    rateId,
    name: str(o.name || o.rateName || o.boardName),
    boardType: str(o.boardType || o.boardName || o.mealPlan) || null,
    retailRate: {
      total: totalArr.map((t) => {
        const tc = asRecord(t);
        return { amount: num(tc.amount ?? tc.value), currency: str(tc.currency) };
      }),
      baseRate: null,
      taxes: null,
    },
    cancellationPolicies: parseCancellationPolicies(o.cancellationPolicies || o.cancellation),
    rooms: Array.isArray(o.rooms)
      ? (o.rooms as unknown[]).map((r) => {
          const ro = asRecord(r);
          return {
            name: str(ro.name || ro.type),
            description: str(ro.description) || null,
            maxOccupancy: typeof ro.maxOccupancy === "number" ? ro.maxOccupancy : null,
            bedTypes: str(ro.bedTypes || ro.beds) || null,
          };
        })
      : [],
  };
}

/** Flatten v3 `roomTypes[].rates[]` (with fallback to a flat `rates[]`). */
function collectRates(hotelData: Record<string, unknown>): LiteApiRate[] {
  const out: LiteApiRate[] = [];
  const roomTypes = Array.isArray(hotelData.roomTypes) ? (hotelData.roomTypes as unknown[]) : [];
  for (const rt of roomTypes) {
    const rtRates = Array.isArray(asRecord(rt).rates) ? (asRecord(rt).rates as unknown[]) : [];
    for (const r of rtRates) {
      const parsed = parseRate(r);
      if (parsed) out.push(parsed);
    }
  }
  if (out.length === 0 && Array.isArray(hotelData.rates)) {
    for (const r of hotelData.rates as unknown[]) {
      const parsed = parseRate(r);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function cheapestOf(rates: LiteApiRate[]): LiteApiRate | null {
  if (rates.length === 0) return null;
  return rates.reduce((best, r) => {
    const b = best.retailRate.total[0]?.amount ?? Infinity;
    const c = r.retailRate.total[0]?.amount ?? Infinity;
    return c < b ? r : best;
  });
}

/** Merge hotel content (from the parallel `hotels[]` map or embedded `hotel`) with its rates. */
function buildHotelResult(content: Record<string, unknown>, rates: LiteApiRate[]): LiteApiHotelResult | null {
  const hotelId = str(content.hotelId || content.id);
  const name = str(content.name || content.hotelName);
  if (!hotelId || !name) return null;

  const addr = asRecord(content.address);
  const photos = Array.isArray(content.photos)
    ? (content.photos as unknown[]).map((p) => ({ url: str(asRecord(p).url ?? p) })).filter((p) => p.url)
    : [str(content.main_photo || content.thumbnail)].filter(Boolean).map((url) => ({ url }));

  return {
    hotelId,
    name,
    rating:
      typeof content.starRating === "number"
        ? content.starRating
        : typeof content.stars === "number"
          ? content.stars
          : typeof content.rating === "number"
            ? content.rating
            : null,
    reviewScore: num(content.reviewScore ?? content.guestScore ?? content.rating) || null,
    reviewCount: typeof content.reviewCount === "number" ? content.reviewCount : null,
    address: {
      country: str(addr.country || content.country),
      countryCode: str(addr.countryCode || content.countryCode),
      state: str(addr.state) || null,
      city: str(addr.city || addr.cityName || content.city),
      street: str(addr.street || addr.addressLine1 || content.address) || null,
      zip: str(addr.zip || addr.postalCode) || null,
      latitude: typeof addr.latitude === "number" ? addr.latitude : typeof content.latitude === "number" ? content.latitude : null,
      longitude: typeof addr.longitude === "number" ? addr.longitude : typeof content.longitude === "number" ? content.longitude : null,
    },
    photos,
    description: str(content.description || content.hotelDescription) || null,
    amenities: Array.isArray(content.amenities) ? (content.amenities as unknown[]).map(str).filter(Boolean) : [],
    checkInTime: str(content.checkInTime || content.checkIn) || null,
    checkOutTime: str(content.checkOutTime || content.checkOut) || null,
    cheapestRate: cheapestOf(rates),
    rates,
    ...extractVibeMeta(content),
  };
}

/** aiSearch responses carry tags/persona/style/story/location_type — fold them into vibe metadata. */
function extractVibeMeta(content: Record<string, unknown>): { vibeTags?: string[]; vibeText?: string } {
  const tags = Array.isArray(content.tags) ? (content.tags as unknown[]).map(str).filter(Boolean) : [];
  const locType = str(content.location_type || content.locationType);
  const allTags = locType ? [...tags, locType] : tags;
  const textParts = [content.persona, content.style, content.story].map(str).filter(Boolean);
  const out: { vibeTags?: string[]; vibeText?: string } = {};
  if (allTags.length) out.vibeTags = allTags;
  if (textParts.length) out.vibeText = textParts.join(" · ");
  return out;
}

function parseRatesResponse(body: unknown): LiteApiHotelResult[] {
  const root = asRecord(body);
  const dataArr: unknown[] = Array.isArray(root.data) ? root.data : [];

  // Content can arrive as a parallel `hotels[]` array keyed by id, or embedded per data row.
  const contentById = new Map<string, Record<string, unknown>>();
  const hotelsArr = Array.isArray(root.hotels) ? (root.hotels as unknown[]) : [];
  for (const h of hotelsArr) {
    const ho = asRecord(h);
    const id = str(ho.id || ho.hotelId);
    if (id) contentById.set(id, ho);
  }

  const results: LiteApiHotelResult[] = [];
  for (const row of dataArr) {
    const ro = asRecord(row);
    const hotelId = str(ro.hotelId || ro.id);
    if (!hotelId) continue;
    const rates = collectRates(ro);
    const content = contentById.get(hotelId) ?? asRecord(ro.hotel) ?? ro;
    // Ensure the id is present on the content record for buildHotelResult.
    const merged = { ...content, hotelId };
    const built = buildHotelResult(merged, rates);
    if (built) results.push(built);
  }
  return results;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export type LiteApiSearchParams = {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number[];
  currency?: string;
  guestNationality?: string;
  limit?: number;
};

function buildRatesBody(params: LiteApiSearchParams, coords: { latitude: number; longitude: number }) {
  return {
    occupancies: [{ adults: Math.max(1, params.adults), ...(params.children?.length ? { children: params.children } : {}) }],
    currency: params.currency ?? "USD",
    guestNationality: params.guestNationality ?? "US",
    checkin: params.checkInDate,
    checkout: params.checkOutDate,
    latitude: coords.latitude,
    longitude: coords.longitude,
    roomMapping: true,
    maxRatesPerHotel: 1,
    includeHotelData: true,
    margin: getLiteApiMarginPct(),
    limit: params.limit ?? 25,
  };
}

/** Full rates search (free). Prices come from retailRate.total — never a price-index endpoint. */
export async function searchLiteApiHotels(params: LiteApiSearchParams): Promise<LiteApiHotelResult[]> {
  const coords = await geocodeDestination(params.destination);
  if (!coords) {
    throw new Error(`Could not geocode "${params.destination}". Ensure GOOGLE_PLACES_API_KEY is configured.`);
  }

  const body = await litePost(DATA_BASE, "/hotels/rates", buildRatesBody(params, coords));
  const results = parseRatesResponse(body).slice(0, params.limit ?? 25);

  console.info(`${LOG} searchHotels`, {
    destination: params.destination,
    checkIn: params.checkInDate,
    checkOut: params.checkOutDate,
    parsedCount: results.length,
  });
  return results;
}

/**
 * Vibe/natural-language search (free) — same /hotels/rates endpoint with an
 * `aiSearch` query instead of coordinates. Returns AI-ranked hotels with
 * persona/style/story/tags. No geocode needed; aiSearch resolves the location.
 */
export type LiteApiAiSearchParams = {
  aiSearch: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  currency?: string;
  guestNationality?: string;
  limit?: number;
};

export async function aiSearchLiteApiHotels(params: LiteApiAiSearchParams): Promise<LiteApiHotelResult[]> {
  const body = {
    aiSearch: params.aiSearch,
    occupancies: [{ adults: Math.max(1, params.adults) }],
    currency: params.currency ?? "USD",
    guestNationality: params.guestNationality ?? "US",
    checkin: params.checkInDate,
    checkout: params.checkOutDate,
    roomMapping: true,
    maxRatesPerHotel: 1,
    includeHotelData: true,
    margin: getLiteApiMarginPct(),
    limit: params.limit ?? 20,
  };
  const resp = await litePost(DATA_BASE, "/hotels/rates", body);
  // Preserve AI ranking order from the response.
  const results = parseRatesResponse(resp).slice(0, params.limit ?? 20);
  console.info(`${LOG} aiSearch`, { q: params.aiSearch.slice(0, 80), parsedCount: results.length });
  return results;
}

/** Cheapest-per-hotel (free) for list views where full rate detail isn't needed yet. */
export async function minRatesLiteApiHotels(params: LiteApiSearchParams): Promise<LiteApiHotelResult[]> {
  const coords = await geocodeDestination(params.destination);
  if (!coords) {
    throw new Error(`Could not geocode "${params.destination}". Ensure GOOGLE_PLACES_API_KEY is configured.`);
  }
  const body = await litePost(DATA_BASE, "/hotels/min-rates", buildRatesBody(params, coords));
  return parseRatesResponse(body).slice(0, params.limit ?? 25);
}

/** Static hotel content (free) — images, description, facilities, location. */
export async function getLiteApiHotelDetails(hotelId: string): Promise<LiteApiHotelResult | null> {
  const body = await liteGet(DATA_BASE, "/data/hotel", { hotelId, timeout: 4 });
  const root = asRecord(body);
  const content = asRecord(root.data ?? root);
  return buildHotelResult({ ...content, hotelId: str(content.id || content.hotelId || hotelId) }, []);
}

// ─── Prebook (booking host) ──────────────────────────────────────────────────

export async function prebookLiteApiRate(offerId: string): Promise<LiteApiPrebookResult> {
  const environment: LiteApiEnvironment = getLiteApiEnvironment();
  const body = await litePost(BOOK_BASE, "/rates/prebook", { offerId, usePaymentSdk: true });

  const root = asRecord(body);
  const data = asRecord(root.data ?? root);

  const prebookId = str(data.prebookId || data.id);
  if (!prebookId) throw new Error("LiteAPI prebook returned no prebookId.");

  const total = asRecord(data.retailRate).total;
  const firstTotal = Array.isArray(total) ? asRecord(total[0]) : {};

  return {
    prebookId,
    hotelId: str(data.hotelId),
    rateId: str(data.rateId || data.offerId || offerId),
    price: num(firstTotal.amount ?? data.price ?? data.totalAmount),
    currency: str(firstTotal.currency ?? data.currency ?? "USD"),
    cancellationPolicies: parseCancellationPolicies(data.cancellationPolicies),
    priceChanged: data.priceChanged === true || data.priceDifference != null,
    cancellationChanged: data.cancellationChanged === true,
    transactionId: str(data.transactionId || data.transaction_id) || null,
    secretKey: str(data.secretKey || data.secret_key) || null,
    environment,
  };
}

// ─── Book (booking host) ──────────────────────────────────────────────────────

export type LiteApiBookParams = {
  prebookId: string;
  /** From prebook — required to settle payment via the SDK transaction. */
  transactionId: string;
  rateId: string;
  hotelId: string;
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  guest: LiteApiBookingGuest;
  clientReference?: string;
};

export async function bookLiteApiRate(params: LiteApiBookParams): Promise<LiteApiBookingRecord> {
  if (!params.transactionId) {
    throw new Error("LiteAPI book requires a transactionId from the Payment SDK prebook step.");
  }

  const payload: Record<string, unknown> = {
    prebookId: params.prebookId,
    holder: {
      firstName: params.guest.firstName,
      lastName: params.guest.lastName,
      email: params.guest.email,
      ...(params.guest.phone ? { phone: params.guest.phone } : {}),
    },
    guests: [
      {
        occupancyNumber: 1,
        firstName: params.guest.firstName,
        lastName: params.guest.lastName,
        email: params.guest.email,
      },
    ],
    payment: { method: "TRANSACTION_ID", transactionId: params.transactionId },
    ...(params.clientReference ? { clientReference: params.clientReference } : {}),
  };

  const body = await litePost(BOOK_BASE, "/rates/book", payload);
  const root = asRecord(body);
  const data = asRecord(root.data ?? root);

  const bookingId = str(data.bookingId || data.id);
  const status = (str(data.status || "CONFIRMED").toUpperCase() as LiteApiBookingRecord["status"]) || "CONFIRMED";

  return {
    provider: "liteapi",
    bookingId,
    clientReference: str(data.clientReference ?? params.clientReference ?? ""),
    status,
    hotelId: params.hotelId,
    hotelName: params.hotelName,
    rateId: params.rateId,
    prebookId: params.prebookId,
    totalAmount: num(data.totalAmount ?? data.price ?? 0),
    currency: str(data.currency ?? "USD"),
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    bookedAt: new Date().toISOString(),
    cancellationPolicies: parseCancellationPolicies(data.cancellationPolicies),
    leadGuest: params.guest,
  };
}
