"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CabinClass, FlightLegRowDto } from "@/shared/flight-search";
import { CABIN_OPTIONS } from "@/shared/flight-search";

const PAGE_SIZE = 10;

type Leg = "outbound" | "return";

type OutboundSummary = {
  airline: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price: string;
  bookUrl: string;
};

function stopsLabel(stops: number): string {
  if (stops <= 0) return "Nonstop";
  return `${stops} stop${stops === 1 ? "" : "s"}`;
}

function formatPrice(price: string): string {
  const p = price.trim();
  if (!p) return "$—";
  return p.startsWith("$") ? p : `$${p}`;
}

function airlineMonogram(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "FL";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function FlightLogo({ flight }: { flight: FlightLegRowDto }) {
  const [logoFailed, setLogoFailed] = useState(false);
  if (flight.airlineLogoUrl && !logoFailed) {
    return (
      <img
        src={flight.airlineLogoUrl}
        alt={`${flight.airline} logo`}
        className="h-10 w-10 rounded-md border border-slate-200 object-cover dark:border-white/15"
        onError={() => setLogoFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-neutral-200">
      {airlineMonogram(flight.airline)}
    </div>
  );
}

export function TripHostFlightsPage(props: {
  tripId: string;
  leg: Leg;
  originId: string;
  originLabel: string;
  cabinClass: CabinClass;
  destinationLabel: string;
  startIso: string;
  endIso: string;
  flights: FlightLegRowDto[];
  error?: string | null;
  outboundSummary: OutboundSummary | null;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FlightLegRowDto | null>(null);

  const totalPages = Math.max(1, Math.ceil(props.flights.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const i = (page - 1) * PAGE_SIZE;
    return props.flights.slice(i, i + PAGE_SIZE);
  }, [props.flights, page]);

  const header = props.leg === "outbound" ? "Recommended departing flights" : "Recommended return flights";
  const cabinLabel = CABIN_OPTIONS.find((x) => x.value === props.cabinClass)?.label ?? "Economy";
  const dateLabel = props.leg === "outbound" ? props.startIso : props.endIso;

  return (
    <div className="min-h-screen bg-slate-50 py-6 text-slate-900 dark:bg-dm-page dark:text-neutral-100 sm:py-8">
      <div className="mx-auto w-full max-w-6xl px-4">
        <Link
          href={`/trip/${props.tripId}/setup`}
          className="inline-flex items-center text-sm font-medium text-slate-600 underline-offset-2 hover:underline dark:text-neutral-400"
        >
          ← Back to trip setup
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{header}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
          {props.originLabel} → {props.destinationLabel} · {dateLabel} · {cabinLabel}
        </p>

        {props.outboundSummary ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
            <p className="font-semibold">Selected outbound flight</p>
            <p className="mt-1">
              {props.outboundSummary.airline} · {props.outboundSummary.departureTime} → {props.outboundSummary.arrivalTime} ·{" "}
              {props.outboundSummary.duration} · {formatPrice(props.outboundSummary.price)}
            </p>
          </div>
        ) : null}

        {props.error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
            {props.error}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {pageRows.map((f) => {
            const selectedRow = selected?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelected(f)}
                className={`w-full overflow-hidden rounded-2xl border text-left transition ${
                  selectedRow
                    ? "border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-dm-elevated"
                }`}
              >
                <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_auto] md:items-start">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <FlightLogo flight={f} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[22px] font-bold leading-none tracking-tight text-slate-900 dark:text-white">
                          <span>{f.departureTime}</span>
                          <span className="text-slate-400 dark:text-neutral-600">→</span>
                          <span>{f.arrivalTime}</span>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-700 dark:text-neutral-300">
                          {f.departureAirport} → {f.arrivalAirport}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-neutral-500">{f.airline}</p>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 md:px-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-neutral-300">
                      <span className="whitespace-nowrap">{f.duration}</span>
                      <span className="h-px flex-1 bg-emerald-500/70 dark:bg-emerald-400/60" />
                      <span className="whitespace-nowrap text-emerald-700 dark:text-emerald-300">{stopsLabel(f.stops)}</span>
                    </div>
                  </div>

                  <div className="text-right md:min-w-[132px]">
                    <p className="text-[34px] font-bold leading-none tracking-tight text-slate-900 dark:text-white">{formatPrice(f.price)}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-neutral-500">Roundtrip per traveler</p>
                  </div>
                </div>
                <div className="border-t border-slate-200/80 px-4 py-2 text-right dark:border-white/10">
                  <span className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-neutral-400">
                    Flight details
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-neutral-400">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-white/5"
            >
              Previous
            </button>
            <span className="text-xs tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:hover:bg-white/5"
            >
              Next
            </button>
          </div>
        ) : null}

        {props.leg === "outbound" ? (
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const q = new URLSearchParams({
                originId: props.originId,
                originLabel: props.originLabel,
                cabinClass: props.cabinClass,
                leg: "return",
                outAirline: selected.airline,
                outDeparture: selected.departureTime,
                outArrival: selected.arrivalTime,
                outDuration: selected.duration,
                outPrice: selected.price,
                outBookUrl: selected.bookUrl,
              });
              router.push(`/trip/${props.tripId}/setup/flights?${q.toString()}`);
            }}
            className="mt-5 rounded-xl border border-teal-600/80 bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:border-white/10 dark:disabled:bg-white/10 dark:disabled:text-neutral-500"
          >
            Next
          </button>
        ) : null}

        {props.leg === "return" && props.outboundSummary && selected ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
            <p className="font-semibold">Round-trip summary</p>
            <p className="mt-1">
              Out: {props.outboundSummary.airline}, {props.outboundSummary.departureTime} → {props.outboundSummary.arrivalTime} (
              {formatPrice(props.outboundSummary.price)})
            </p>
            <p>
              Back: {selected.airline}, {selected.departureTime} → {selected.arrivalTime} ({formatPrice(selected.price)})
            </p>
            <p className="mt-2 flex flex-wrap gap-3">
              <a
                href={selected.bookUrl || props.outboundSummary.bookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
              >
                Book
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

