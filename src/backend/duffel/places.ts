import { duffelGet, isDuffelConfigured } from "@/backend/duffel/client";

export type AirportSuggestion = { iata: string; name: string; city: string; country: string };

/** Small fallback so autocomplete works even when Duffel isn't configured. */
const LOCAL_AIRPORTS: AirportSuggestion[] = [
  { iata: "JFK", name: "John F. Kennedy Intl", city: "New York", country: "US" },
  { iata: "LGA", name: "LaGuardia", city: "New York", country: "US" },
  { iata: "EWR", name: "Newark Liberty Intl", city: "New York", country: "US" },
  { iata: "LAX", name: "Los Angeles Intl", city: "Los Angeles", country: "US" },
  { iata: "SFO", name: "San Francisco Intl", city: "San Francisco", country: "US" },
  { iata: "ORD", name: "O'Hare Intl", city: "Chicago", country: "US" },
  { iata: "MIA", name: "Miami Intl", city: "Miami", country: "US" },
  { iata: "BOS", name: "Logan Intl", city: "Boston", country: "US" },
  { iata: "SEA", name: "Seattle-Tacoma Intl", city: "Seattle", country: "US" },
  { iata: "ATL", name: "Hartsfield-Jackson", city: "Atlanta", country: "US" },
  { iata: "DFW", name: "Dallas/Fort Worth Intl", city: "Dallas", country: "US" },
  { iata: "DEN", name: "Denver Intl", city: "Denver", country: "US" },
  { iata: "LAS", name: "Harry Reid Intl", city: "Las Vegas", country: "US" },
  { iata: "AUS", name: "Austin-Bergstrom Intl", city: "Austin", country: "US" },
  { iata: "YYZ", name: "Toronto Pearson Intl", city: "Toronto", country: "CA" },
  { iata: "YVR", name: "Vancouver Intl", city: "Vancouver", country: "CA" },
  { iata: "LHR", name: "Heathrow", city: "London", country: "GB" },
  { iata: "LGW", name: "Gatwick", city: "London", country: "GB" },
  { iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "FR" },
  { iata: "ORY", name: "Orly", city: "Paris", country: "FR" },
  { iata: "AMS", name: "Schiphol", city: "Amsterdam", country: "NL" },
  { iata: "FRA", name: "Frankfurt", city: "Frankfurt", country: "DE" },
  { iata: "MUC", name: "Munich", city: "Munich", country: "DE" },
  { iata: "BER", name: "Berlin Brandenburg", city: "Berlin", country: "DE" },
  { iata: "MAD", name: "Adolfo Suárez Madrid–Barajas", city: "Madrid", country: "ES" },
  { iata: "BCN", name: "Barcelona–El Prat", city: "Barcelona", country: "ES" },
  { iata: "FCO", name: "Leonardo da Vinci–Fiumicino", city: "Rome", country: "IT" },
  { iata: "MXP", name: "Milan Malpensa", city: "Milan", country: "IT" },
  { iata: "LIS", name: "Humberto Delgado", city: "Lisbon", country: "PT" },
  { iata: "DUB", name: "Dublin", city: "Dublin", country: "IE" },
  { iata: "ZRH", name: "Zürich", city: "Zürich", country: "CH" },
  { iata: "VIE", name: "Vienna Intl", city: "Vienna", country: "AT" },
  { iata: "CPH", name: "Copenhagen", city: "Copenhagen", country: "DK" },
  { iata: "IST", name: "Istanbul", city: "Istanbul", country: "TR" },
  { iata: "DXB", name: "Dubai Intl", city: "Dubai", country: "AE" },
  { iata: "DOH", name: "Hamad Intl", city: "Doha", country: "QA" },
  { iata: "SIN", name: "Changi", city: "Singapore", country: "SG" },
  { iata: "HKG", name: "Hong Kong Intl", city: "Hong Kong", country: "HK" },
  { iata: "NRT", name: "Narita Intl", city: "Tokyo", country: "JP" },
  { iata: "HND", name: "Haneda", city: "Tokyo", country: "JP" },
  { iata: "ICN", name: "Incheon Intl", city: "Seoul", country: "KR" },
  { iata: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "AU" },
  { iata: "MEL", name: "Melbourne", city: "Melbourne", country: "AU" },
  { iata: "GRU", name: "São Paulo–Guarulhos", city: "São Paulo", country: "BR" },
  { iata: "MEX", name: "Mexico City Intl", city: "Mexico City", country: "MX" },
  { iata: "CUN", name: "Cancún Intl", city: "Cancún", country: "MX" },
  { iata: "BKK", name: "Suvarnabhumi", city: "Bangkok", country: "TH" },
  { iata: "DEL", name: "Indira Gandhi Intl", city: "Delhi", country: "IN" },
  { iata: "BOM", name: "Chhatrapati Shivaji", city: "Mumbai", country: "IN" },
];

function filterLocal(q: string): AirportSuggestion[] {
  const ql = q.toLowerCase();
  return LOCAL_AIRPORTS.filter(
    (a) => a.iata.toLowerCase().includes(ql) || a.name.toLowerCase().includes(ql) || a.city.toLowerCase().includes(ql)
  ).slice(0, 8);
}

type DuffelPlace = {
  type?: string;
  iata_code?: string | null;
  name?: string;
  city_name?: string | null;
  iata_country_code?: string | null;
};

/**
 * Airport suggestions for the flight search fields. Uses Duffel's native
 * /places/suggestions when configured; otherwise (or on error) falls back to a
 * small local airport list. Never uses SerpAPI.
 */
export async function searchDuffelAirports(query: string): Promise<AirportSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  if (isDuffelConfigured()) {
    try {
      const resp = await duffelGet<{ data?: DuffelPlace[] }>(`/places/suggestions?query=${encodeURIComponent(q)}`);
      const out: AirportSuggestion[] = [];
      for (const p of resp.data ?? []) {
        if (!p.iata_code) continue;
        out.push({
          iata: p.iata_code,
          name: p.name ?? p.iata_code,
          city: p.city_name ?? "",
          country: p.iata_country_code ?? "",
        });
      }
      if (out.length > 0) return out.slice(0, 8);
    } catch {
      // fall through to local fallback
    }
  }
  return filterLocal(q);
}
