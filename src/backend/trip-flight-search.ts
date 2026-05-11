import { getSerpApiKey } from "@/backend/env-api-keys";
import type { TripPlan } from "@/shared/trip-plan";
import type { FlightLegRowDto, AirportSuggestionDto } from "@/shared/flight-search";

const SERP = "https://serpapi.com/search.json";

export async function serpSearchJson(engine: string, params: Record<string, string>): Promise<unknown> {
  const key = getSerpApiKey();
  if (!key) throw new Error("Missing SERPAPI_KEY");
  const qs = new URLSearchParams({ engine, ...params, api_key: key });
  const res = await fetch(`${SERP}?${qs}`);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SerpApi ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function formatDurationMinutes(total: number | undefined): string {
  if (total == null || Number.isNaN(total)) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type SerpAiportRef = { time?: string; id?: string; name?: string } | undefined;

function firstLeg(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const flights = record.flights;
  if (!Array.isArray(flights) || flights.length === 0) return undefined;
  const x = flights[0];
  return typeof x === "object" && x !== null ? (x as Record<string, unknown>) : undefined;
}

function lastLeg(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const flights = record.flights;
  if (!Array.isArray(flights) || flights.length === 0) return undefined;
  const x = flights[flights.length - 1];
  return typeof x === "object" && x !== null ? (x as Record<string, unknown>) : undefined;
}

function airportRefTime(ref: Record<string, unknown> | undefined, kind: "departure_airport" | "arrival_airport"): SerpAiportRef {
  if (!ref) return undefined;
  const a = ref[kind];
  if (typeof a === "object" && a !== null) return a as SerpAiportRef;
  return undefined;
}

function rowFromFlightOption(bf: Record<string, unknown>, index: number): FlightLegRowDto {
  const first = firstLeg(bf);
  const last = lastLeg(bf);
  const flightsArr = bf.flights;
  const nLegs = Array.isArray(flightsArr) ? flightsArr.length : 1;
  const stops = Math.max(0, nLegs - 1);

  const dep = airportRefTime(first, "departure_airport");
  const arr = airportRefTime(last, "arrival_airport");

  const airline =
    typeof first?.airline === "string"
      ? (first.airline as string)
      : nLegs > 1 && typeof bf.airline_logo === "string"
        ? "Multiple carriers"
        : "Airline TBD";

  const rawPrice =
    typeof bf.price === "string" ? bf.price : typeof bf.price === "number" ? String(bf.price) : "—";

  const durationMin =
    typeof bf.duration === "number" ? bf.duration : Number.parseInt(String(bf.duration ?? ""), 10);
  const duration = formatDurationMinutes(Number.isFinite(durationMin) ? durationMin : undefined);

  const bt = typeof bf.booking_token === "string" ? bf.booking_token : "";
  const id = bt.length > 8 ? `${bt.slice(0, 36)}:${index}` : `fl-${index}`;

  const rawLink = typeof bf.link === "string" && bf.link.startsWith("http") ? bf.link : "";
  let book = "https://www.google.com/travel/flights";
  if (rawLink) {
    try {
      const u = new URL(rawLink);
      const tfsFromLink = u.searchParams.get("tfs");
      const effectiveTfs = tfsFromLink && tfsFromLink.trim() ? tfsFromLink.trim() : bt;
      const isGoogleFlights = /(^|\.)google\.com$/i.test(u.hostname) && u.pathname.startsWith("/travel/flights");
      if (isGoogleFlights && effectiveTfs) {
        // Convert generic search-style Google Flights links into booking deep links.
        book = `https://www.google.com/travel/flights/booking?${new URLSearchParams({ tfs: effectiveTfs }).toString()}`;
      } else if (isGoogleFlights && !effectiveTfs) {
        // Avoid returning a blank Flights homepage if the row lacks a deep-link token.
        book = "https://www.google.com/travel/flights";
      } else {
        book = rawLink;
      }
    } catch {
      book = rawLink;
    }
  } else if (bt.length) {
    book = `https://www.google.com/travel/flights/booking?${new URLSearchParams({ tfs: bt }).toString()}`;
  }

  const logoFromFirst = typeof first?.airline_logo === "string" ? first.airline_logo : "";
  const logoFromTop = typeof bf.airline_logo === "string" ? bf.airline_logo : "";
  const airlineLogoUrl = logoFromFirst || logoFromTop || undefined;

  return {
    id,
    airline,
    airlineLogoUrl,
    departureTime: typeof dep?.time === "string" ? dep.time : "—",
    departureAirport: typeof dep?.id === "string" ? dep.id : typeof dep?.name === "string" ? dep.name : "—",
    arrivalTime: typeof arr?.time === "string" ? arr.time : "—",
    arrivalAirport: typeof arr?.id === "string" ? arr.id : typeof arr?.name === "string" ? arr.name : "—",
    duration,
    stops,
    price: rawPrice,
    bookUrl: book,
  };
}

/** Autocomplete airports / cities (Google Flights engine via SerpApi). */
export async function fetchFlightAirportSuggestions(query: string): Promise<AirportSuggestionDto[]> {
  const q = query.trim().slice(0, 96);
  if (!q || !getSerpApiKey()) return [];

  const j = (await serpSearchJson("google_flights_autocomplete", {
    q,
    hl: "en",
    gl: "us",
  })) as {
    suggestions?: unknown[];
  };

  const out: AirportSuggestionDto[] = [];
  const seen = new Set<string>();

  for (const s of j.suggestions ?? []) {
    if (typeof s !== "object" || s === null) continue;
    const rec = s as Record<string, unknown>;
    const airports = rec.airports;
    if (!Array.isArray(airports)) continue;
    for (const a of airports) {
      if (typeof a !== "object" || a === null) continue;
      const ar = a as Record<string, unknown>;
      const id = typeof ar.id === "string" ? ar.id.trim() : "";
      if (!id || seen.has(id)) continue;
      const name = typeof ar.name === "string" ? ar.name : id;
      const city =
        typeof ar.city === "string"
          ? ar.city
          : typeof rec.city === "string"
            ? (rec.city as string)
            : "";
      const subtitle = city ? `${city}${typeof ar.country === "string" ? ", " + (ar.country as string) : ""}` : undefined;
      seen.add(id);
      out.push({
        id,
        label: name,
        subtitle: subtitle || undefined,
      });
      if (out.length >= 12) return out;
    }
  }

  return out.slice(0, 12);
}

/** Resolve destination text to airport id — first autocomplete hit. */
export async function resolveDestinationAirportId(destinationText: string): Promise<string | null> {
  const s = destinationText.trim().split(",")[0]!.trim();
  if (!s) return null;
  const sug = await fetchFlightAirportSuggestions(s);
  return sug[0]?.id ?? null;
}

/** One-way leg search — full result list (caller paginates in UI). */
export async function searchFlightsOneWayLeg(args: {
  departureAirportId: string;
  arrivalAirportId: string;
  dateIso: string;
  /** SerpApi 1–4 */
  travelClass?: string;
  adults: number;
}): Promise<{ flights: FlightLegRowDto[]; error?: string }> {
  if (!getSerpApiKey()) {
    return { flights: [], error: "Add SERPAPI_KEY to enable flight search." };
  }

  const { departureAirportId, arrivalAirportId, dateIso, travelClass, adults } = args;
  const iso = /^(\d{4}-\d{2}-\d{2})$/.exec(dateIso)?.[1];
  if (!iso) return { flights: [], error: "Invalid date format." };

  try {
    const params: Record<string, string> = {
      departure_id: departureAirportId,
      arrival_id: arrivalAirportId,
      outbound_date: iso,
      type: "2",
      hl: "en",
      gl: "us",
      currency: "USD",
      adults: String(Math.max(1, Math.min(9, adults))),
    };
    if (travelClass && /^[1-4]$/.test(travelClass)) {
      params.travel_class = travelClass;
    }

    const j = (await serpSearchJson("google_flights", params)) as {
      best_flights?: unknown[];
      other_flights?: unknown[];
      error?: string;
    };

    if (typeof j.error === "string" && j.error) {
      return { flights: [], error: j.error };
    }

    const pool = [...(j.best_flights ?? []), ...(j.other_flights ?? [])].filter(
      (x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)
    );

    const flights = pool.slice(0, 60).map((row, idx) => rowFromFlightOption(row, idx));

    if (flights.length > 0 && pool.length > 0) {
      const sampleRaw = pool[0]!;
      const sample = {
        booking_token:
          typeof sampleRaw.booking_token === "string"
            ? `${sampleRaw.booking_token.slice(0, 40)}...`
            : null,
        link: typeof sampleRaw.link === "string" ? sampleRaw.link : null,
      };
      const sampleBuilt = flights[0]!;
      console.info("[flight-search] sample-booking-url", {
        route: `${departureAirportId}->${arrivalAirportId}`,
        dateIso: iso,
        raw: sample,
        generatedBookUrl: sampleBuilt.bookUrl,
      });
    } else {
      console.info("[flight-search] no-flight-results", {
        route: `${departureAirportId}->${arrivalAirportId}`,
        dateIso: iso,
      });
    }

    return {
      flights,
      error: flights.length ? undefined : "No flights returned for these inputs.",
    };
  } catch (e) {
    return {
      flights: [],
      error: e instanceof Error ? e.message : "Flight search failed.",
    };
  }
}

export function tripPlannerAdults(plan: TripPlan): number {
  return Math.max(1, Math.min(9, plan.people.count ?? 1));
}
