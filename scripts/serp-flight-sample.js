const fs = require("fs");

async function main() {
  const env = fs.readFileSync(".env.local", "utf8");
  const m = env.match(/^SERPAPI_KEY=(.*)$/m);
  if (!m) throw new Error("SERPAPI_KEY missing in .env.local");
  const key = m[1].trim().replace(/^"|"$/g, "");

  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: "PHX",
    arrival_id: "LAX",
    outbound_date: "2026-07-02",
    type: "2",
    hl: "en",
    gl: "us",
    currency: "USD",
    adults: "1",
    api_key: key,
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  const j = await res.json();
  const pool = [...(j.best_flights || []), ...(j.other_flights || [])];
  const first = pool[0];
  if (!first) {
    console.log(JSON.stringify({ error: j.error || "No flights returned" }, null, 2));
    return;
  }

  const sample = {
    booking_token: first.booking_token || null,
    link: first.link || null,
    price: first.price || null,
    flight_count: Array.isArray(first.flights) ? first.flights.length : null,
    first_flight:
      Array.isArray(first.flights) && first.flights[0]
        ? {
            airline: first.flights[0].airline,
            flight_number: first.flights[0].flight_number,
            departure_airport: first.flights[0].departure_airport,
            arrival_airport: first.flights[0].arrival_airport,
            airline_logo: first.flights[0].airline_logo,
          }
        : null,
  };
  console.log(JSON.stringify(sample, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

