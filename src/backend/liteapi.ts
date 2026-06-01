import { getLiteApiKey, isLiteApiConfigured } from "@/backend/env-api-keys";
import type {
  LiteApiHotelResult,
  LiteApiRate,
  LiteApiPrebookResult,
  LiteApiBookingRecord,
  LiteApiBookingGuest,
  LiteApiCancellationPolicy,
} from "@/shared/liteapi";

export { isLiteApiConfigured };

const BASE_URL = "https://api.liteapi.travel/v3.0";
const LOG = "[liteapi]";

function liteApiHeaders(): Record<string, string> {
  const key = getLiteApiKey();
  if (!key) throw new Error("LITEAPI_API_KEY is not set.");
  return {
    "X-Api-Key": key,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function liteGet(path: string, query: Record<string, string | number | undefined>): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    qs.set(k, String(v));
  }
  const url = `${BASE_URL}${path}?${qs.toString()}`;

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

  if (!res.ok) {
    throw new Error(`LiteAPI GET ${path} (${res.status}): ${text.slice(0, 800)}`);
  }
  if (!text.trim()) throw new Error(`LiteAPI ${path}: empty response.`);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`LiteAPI ${path}: response was not JSON.`);
  }
}

async function litePost(path: string, body: unknown): Promise<unknown> {
  const url = `${BASE_URL}${path}`;

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

  if (!res.ok) {
    throw new Error(`LiteAPI POST ${path} (${res.status}): ${text.slice(0, 800)}`);
  }
  if (!text.trim()) throw new Error(`LiteAPI ${path}: empty response.`);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`LiteAPI ${path}: response was not JSON.`);
  }
}

// ─── Response normalisers ──────────────────────────────────────────────────

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

function parseCancellationPolicies(raw: unknown): LiteApiCancellationPolicy[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    const o = (p as Record<string, unknown>) ?? {};
    return {
      cancelByDate: str(o.cancelByDate || o.cancelBy || o.deadline) || null,
      refundable: o.refundable === true || o.type === "FREE_CANCELLATION",
      description: str(o.description || o.condition) || null,
    };
  });
}

function parseRate(raw: unknown): LiteApiRate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rateId = str(o.rateId || o.id);
  if (!rateId) return null;

  const retail = (o.retailRate as Record<string, unknown>) ?? {};
  const totalArr = Array.isArray(retail.total) ? (retail.total as unknown[]) : [];

  return {
    rateId,
    name: str(o.name || o.rateName || o.boardName),
    boardType: str(o.boardType || o.boardName || o.mealPlan) || null,
    retailRate: {
      total: totalArr.map((t) => {
        const tc = (t as Record<string, unknown>) ?? {};
        return { amount: num(tc.amount || tc.value), currency: str(tc.currency) };
      }),
      baseRate: null,
      taxes: null,
    },
    cancellationPolicies: parseCancellationPolicies(o.cancellationPolicies || o.cancellation),
    rooms: Array.isArray(o.rooms)
      ? (o.rooms as unknown[]).map((r) => {
          const ro = (r as Record<string, unknown>) ?? {};
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

function normaliseHotelResult(raw: unknown): LiteApiHotelResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const hotelId = str(o.hotelId || o.id);
  const name = str(o.name || o.hotelName);
  if (!hotelId || !name) return null;

  const addr = (o.address as Record<string, unknown>) ?? {};
  const photos = Array.isArray(o.photos)
    ? (o.photos as unknown[]).map((p) => ({ url: str((p as Record<string, unknown>).url ?? p) })).filter((p) => p.url)
    : [];

  const rawRates = Array.isArray(o.rates) ? (o.rates as unknown[]) : [];
  const rates = rawRates.map(parseRate).filter((r): r is LiteApiRate => r !== null);
  const cheapestRate = rates.length > 0
    ? rates.reduce((best, r) => {
        const bAmt = best.retailRate.total[0]?.amount ?? Infinity;
        const rAmt = r.retailRate.total[0]?.amount ?? Infinity;
        return rAmt < bAmt ? r : best;
      })
    : null;

  return {
    hotelId,
    name,
    rating: typeof o.starRating === "number" ? o.starRating : typeof o.rating === "number" ? o.rating : null,
    reviewScore: num(o.reviewScore || o.guestScore) || null,
    reviewCount: typeof o.reviewCount === "number" ? o.reviewCount : null,
    address: {
      country: str(addr.country),
      countryCode: str(addr.countryCode),
      state: str(addr.state) || null,
      city: str(addr.city || addr.cityName),
      street: str(addr.street || addr.addressLine1) || null,
      zip: str(addr.zip || addr.postalCode) || null,
      latitude: typeof addr.latitude === "number" ? addr.latitude : null,
      longitude: typeof addr.longitude === "number" ? addr.longitude : null,
    },
    photos,
    description: str(o.description) || null,
    amenities: Array.isArray(o.amenities) ? (o.amenities as unknown[]).map(str).filter(Boolean) : [],
    checkInTime: str(o.checkInTime || o.checkIn) || null,
    checkOutTime: str(o.checkOutTime || o.checkOut) || null,
    cheapestRate,
    rates,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type LiteApiSearchParams = {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number[];
  currency?: string;
  limit?: number;
};

export async function searchLiteApiHotels(params: LiteApiSearchParams): Promise<LiteApiHotelResult[]> {
  const body = await liteGet("/hotels/rates", {
    destination: params.destination,
    checkin: params.checkInDate,
    checkout: params.checkOutDate,
    adults: params.adults,
    children: params.children?.join(",") ?? "",
    currency: params.currency ?? "USD",
    limit: params.limit ?? 20,
  });

  const root = body as Record<string, unknown>;
  const dataArr: unknown[] = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.hotels)
      ? root.hotels
      : Array.isArray(root.results)
        ? root.results
        : [];

  const results = dataArr
    .map(normaliseHotelResult)
    .filter((h): h is LiteApiHotelResult => h !== null)
    .slice(0, params.limit ?? 20);

  console.info(`${LOG} searchHotels`, {
    destination: params.destination,
    checkIn: params.checkInDate,
    checkOut: params.checkOutDate,
    rawCount: dataArr.length,
    parsedCount: results.length,
  });

  return results;
}

export async function prebookLiteApiRate(rateId: string): Promise<LiteApiPrebookResult> {
  const body = await litePost("/rates/prebook", { rateId, usePaymentSdk: true });

  const root = body as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;

  const prebookId = str(data.prebookId || data.id);
  if (!prebookId) throw new Error("LiteAPI prebook returned no prebookId.");

  const total = (data.retailRate as Record<string, unknown> | undefined)?.total;
  const firstTotal = Array.isArray(total) ? (total[0] as Record<string, unknown>) : null;

  return {
    prebookId,
    hotelId: str(data.hotelId),
    rateId: str(data.rateId || rateId),
    price: num(firstTotal?.amount ?? data.price ?? data.totalAmount),
    currency: str(firstTotal?.currency ?? data.currency ?? "USD"),
    cancellationPolicies: parseCancellationPolicies(data.cancellationPolicies),
    priceChanged: data.priceChanged === true,
    cancellationChanged: data.cancellationChanged === true,
  };
}

export type LiteApiBookParams = {
  prebookId: string;
  rateId: string;
  hotelId: string;
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  guest: LiteApiBookingGuest;
  clientReference?: string;
  markup?: number;
};

export async function bookLiteApiRate(params: LiteApiBookParams): Promise<LiteApiBookingRecord> {
  const payload: Record<string, unknown> = {
    prebookId: params.prebookId,
    guestInfo: {
      guestFirstName: params.guest.firstName,
      guestLastName: params.guest.lastName,
      guestEmail: params.guest.email,
      ...(params.guest.phone ? { guestPhone: params.guest.phone } : {}),
    },
    payment: { method: "STRIPE_TOKEN" },
    ...(params.markup != null ? { markup: params.markup } : {}),
    ...(params.clientReference ? { clientReference: params.clientReference } : {}),
  };

  const body = await litePost("/rates/book", payload);
  const root = body as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;

  const bookingId = str(data.bookingId || data.id);
  const status = str(data.status || "CONFIRMED").toUpperCase() as LiteApiBookingRecord["status"];

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
