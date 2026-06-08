import { getSerpApiKey } from "@/backend/env-api-keys";
import type { TripPlan } from "@/shared/trip-plan";
import type { LiveFlightCard } from "@/shared/trip-live-recommendations";

const SERP = "https://serpapi.com/search.json";

function optionToIso(d: string): string | undefined {
  const iso = d.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const t = Date.parse(d);
  if (!Number.isNaN(t)) {
    const x = new Date(t);
    if (!Number.isNaN(x.getTime())) return x.toISOString().slice(0, 10);
  }
  return undefined;
}

function firstOutboundIso(plan: TripPlan): string | undefined {
  for (const d of plan.dates.options) {
    const iso = optionToIso(d);
    if (iso) return iso;
  }
  return undefined;
}

/** Second distinct date option for round-trip SerpApi searches. */
function secondReturnIso(plan: TripPlan, outbound: string | undefined): string | undefined {
  const seen = new Set<string>();
  if (outbound) seen.add(outbound);
  for (const d of plan.dates.options) {
    const iso = optionToIso(d);
    if (!iso) continue;
    if (seen.has(iso)) continue;
    return iso;
  }
  return undefined;
}

async function serpGet(params: Record<string, string>): Promise<unknown> {
  const key = getSerpApiKey();
  if (!key) throw new Error("Missing SERPAPI_KEY");
  const qs = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`${SERP}?${qs}`);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SerpApi ${res.status}: ${t.slice(0, 160)}`);
  }
  return res.json();
}

async function flightsAutocomplete(q: string): Promise<string | undefined> {
  const j = (await serpGet({
    engine: "google_flights_autocomplete",
    q: q.slice(0, 80),
    hl: "en",
    gl: "us",
  })) as {
    suggestions?: { airports?: { id?: string }[]; id?: string }[];
  };
  const s0 = j.suggestions?.[0];
  const airport = s0?.airports?.[0]?.id;
  if (airport) return airport;
  const id = s0?.id;
  if (typeof id === "string" && id.length) return id;
  return undefined;
}

function formatDurationMinutes(total: number | undefined): string {
  if (total == null || Number.isNaN(total)) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function firstLegAirline(flight: { flights?: { airline?: string }[] }): string {
  const f = flight.flights?.[0];
  return typeof f?.airline === "string" ? f.airline : "Airline TBD";
}

function firstLegDeparture(flight: { flights?: { departure_airport?: { time?: string } }[] }): string {
  const t = flight.flights?.[0]?.departure_airport?.time;
  return typeof t === "string" ? t : "—";
}

export async function fetchSerpGoogleFlights(plan: TripPlan): Promise<{
  flights: LiveFlightCard[];
  bookBaseUrl: string | null;
  error: string | null;
}> {
  const key = getSerpApiKey();
  const depCity = plan.departureCity?.trim();
  const dest = plan.location?.trim();
  if (!key) return { flights: [], bookBaseUrl: null, error: "Add SERPAPI_KEY to search flights." };
  if (!depCity || !dest) {
    return { flights: [], bookBaseUrl: null, error: null };
  }

  try {
    const depId = await flightsAutocomplete(depCity);
    const arrId = await flightsAutocomplete(dest.split(",")[0]!.trim());
    if (!depId || !arrId) {
      return {
        flights: [],
        bookBaseUrl: "https://www.google.com/travel/flights",
        error: "Could not resolve airports for flight search. Try a clearer city or airport name.",
      };
    }

    const outbound = firstOutboundIso(plan);
    const returnIso = secondReturnIso(plan, outbound);
    /** SerpApi: type `1` = round trip (requires return_date); type `2` = one-way. Default API type is round trip. */
    const hasRoundTripDates = Boolean(outbound && returnIso);
    const adults = Math.max(1, Math.min(9, plan.people.count ?? 1));
    const params: Record<string, string> = {
      engine: "google_flights",
      departure_id: depId,
      arrival_id: arrId,
      currency: "USD",
      hl: "en",
      gl: "us",
      adults: String(adults),
    };
    if (hasRoundTripDates) {
      params.type = "1";
      params.outbound_date = outbound!;
      params.return_date = returnIso!;
    } else {
      params.type = "2";
      if (outbound) params.outbound_date = outbound;
    }

    const j = (await serpGet(params)) as {
      best_flights?: unknown[];
      other_flights?: unknown[];
      search_metadata?: { google_flights_url?: string };
    };

    const pool = [...(j.best_flights ?? []), ...(j.other_flights ?? [])].filter(
      (x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)
    );

    const headcount = Math.max(1, plan.people.count ?? 1);

    const flights: LiveFlightCard[] = pool.slice(0, 3).map((bf) => {
      const rawPrice = typeof bf.price === "string" ? bf.price : String(bf.price ?? "—");
      const num = Number.parseFloat(rawPrice.replace(/[^0-9.]/g, ""));
      const per =
        !Number.isNaN(num) && num > 0
          ? `Inspiration estimate ~$${Math.round(num / headcount)}/person (party of ${headcount})`
          : `${rawPrice} · shown on Google Flights`;
      const dur = formatDurationMinutes(
        typeof bf.duration === "number" ? bf.duration : Number.parseInt(String(bf.duration ?? ""), 10)
      );
      const book =
        typeof bf.link === "string" && bf.link.startsWith("http")
          ? bf.link
          : typeof bf.booking_token === "string"
            ? `https://www.google.com/travel/flights?${new URLSearchParams({ tfs: bf.booking_token }).toString()}`
            : j.search_metadata?.google_flights_url ?? "https://www.google.com/travel/flights";
      return {
        airline: firstLegAirline(bf as { flights?: { airline?: string }[] }),
        pricePerPerson: per,
        departureTime: firstLegDeparture(bf as { flights?: { departure_airport?: { time?: string } }[] }),
        duration: dur,
        bookOnGoogleFlightsUrl: book,
        bookingStatus: "inspiration",
      };
    });

    return {
      flights,
      bookBaseUrl: j.search_metadata?.google_flights_url ?? "https://www.google.com/travel/flights",
      error: flights.length ? null : "No flight results returned for this search.",
    };
  } catch (e) {
    return {
      flights: [],
      bookBaseUrl: "https://www.google.com/travel/flights",
      error: e instanceof Error ? e.message : "Flight search failed.",
    };
  }
}
