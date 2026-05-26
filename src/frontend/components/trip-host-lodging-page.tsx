"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppTopNav } from "@/frontend/components/app-top-nav";
import {
  mockHotelResultToPlace,
  type MockHotelAmenityIcon,
  type MockHotelBrowseResult,
} from "@/shared/mock-hotel-search";
import type { LodgingSearchApiResponse } from "@/shared/lodging-search";
import {
  applyHostLodgingSegment,
  upsertLodgingActivitiesInGeneratedItinerary,
  type HostLodgingType,
  type TripPlan,
} from "@/shared/trip-plan";
import type { PlaceSpotlight } from "@/shared/place-preview";
import { DuffelLodgingBookingDrawer } from "@/frontend/components/duffel-lodging-booking-drawer";

type StayTab = "all" | "hotels" | "homes";
type SortKey = "recommended" | "price_low" | "price_high" | "rating";

const POPULAR_FILTERS = [
  { id: "breakfast", label: "Breakfast included" },
] as const;

type ManualStayDraft = {
  name: string;
  lodgingType: HostLodgingType;
  address: string;
  bookingUrl: string;
  notes: string;
};

const MANUAL_STAY_TYPE_OPTIONS: { value: HostLodgingType; label: string }[] = [
  { value: "hotel", label: "Hotel" },
  { value: "airbnb", label: "Airbnb / home" },
  { value: "villa", label: "Villa" },
  { value: "hostel", label: "Hostel" },
  { value: "resort", label: "Resort" },
  { value: "other", label: "Other stay" },
];

function formatSearchDateRange(checkIn: string, checkOut: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

function AmenityIcon({ kind }: { kind: MockHotelAmenityIcon }) {
  const common = "h-4 w-4 shrink-0 text-neutral-600";
  switch (kind) {
    case "pool":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      );
    case "hot_tub":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 14h16M6 10v4M10 8v6M14 9v5M18 11v3" />
        </svg>
      );
    case "wifi":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
        </svg>
      );
    case "gym":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 9v6M18 9v6M9 12h6M4 10h2v4H4zM18 10h2v4h-2z" />
        </svg>
      );
    case "breakfast":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 10h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2zM8 6v4M16 6v4" />
        </svg>
      );
    case "shuttle":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 6h16v8H4zM6 18h2M16 18h2M8 14h8" />
        </svg>
      );
    default:
      return null;
  }
}

function HotelCardImage({ hotel }: { hotel: MockHotelBrowseResult }) {
  return (
    <div className="relative w-full shrink-0 sm:w-[200px]">
      {hotel.imageUrl ? (
        <div className="relative aspect-[16/10] w-full bg-neutral-100 sm:aspect-auto sm:h-[168px] dark:bg-neutral-800">
          <Image src={hotel.imageUrl} alt={hotel.name} fill className="object-cover" sizes="200px" unoptimized />
        </div>
      ) : (
        <LodgingCardPhotoGradient hotel={hotel} />
      )}
      {hotel.vipAccess ? (
        <span className="absolute left-0 top-0 w-full bg-black/55 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
          VIP Access
        </span>
      ) : null}
      {hotel.isAd ? (
        <span className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          Ad
        </span>
      ) : null}
    </div>
  );
}

function LodgingCardPhotoGradient({ hotel }: { hotel: MockHotelBrowseResult }) {
  return (
    <div
      className="aspect-[16/10] w-full sm:aspect-auto sm:h-[168px]"
      style={{ background: `linear-gradient(135deg, ${hotel.gradientFrom}, ${hotel.gradientTo})` }}
    />
  );
}

function HotelCardDetails({
  hotel,
  onSelect,
  selecting,
}: {
  hotel: MockHotelBrowseResult;
  onSelect: () => void;
  selecting: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5">
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-display text-lg font-semibold leading-snug text-neutral-900 dark:text-white">{hotel.name}</h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{hotel.distanceLabel}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          {hotel.amenities.map((a) => (
            <span key={a.label} className="inline-flex items-center gap-1 text-xs text-neutral-700">
              <AmenityIcon kind={a.icon} />
              {a.label}
            </span>
          ))}
        </div>
        {hotel.dealHighlight ? (
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {hotel.dealHighlight}
          </p>
        ) : null}
        <p className="text-sm leading-relaxed text-neutral-500">{hotel.description}</p>
        {hotel.urgencyText ? <p className="text-sm font-medium text-rose-600">{hotel.urgencyText}</p> : null}
        <button
          type="button"
          disabled={selecting}
          onClick={onSelect}
          className="mt-2 rounded-full bg-[#2563EB] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          {selecting ? "Adding…" : "Add to trip"}
        </button>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-3 sm:min-w-[140px]">
        <div className="text-right">
          <p className="text-lg font-bold text-neutral-900">~${hotel.nightlyUsd} nightly</p>
          <p className="text-sm text-neutral-700">${hotel.totalUsd} total</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg bg-emerald-800 px-1 text-sm font-bold text-white">
            {hotel.reviewScore.toFixed(1)}
          </span>
          <div className="text-right text-sm">
            <p className="font-bold text-neutral-900">{hotel.reviewLabel}</p>
            <p className="text-neutral-600">{hotel.reviewCount.toLocaleString()} reviews</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HotelResultCard({
  hotel,
  onSelect,
  selecting,
}: {
  hotel: MockHotelBrowseResult;
  onSelect: () => void;
  selecting: boolean;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-white shadow-[var(--shadow-ambient-sm)] transition hover:border-[color:var(--hairline-strong)] hover:shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-[#1a1a1a] dark:hover:border-white/15 sm:flex-row">
      <HotelCardImage hotel={hotel} />
      <HotelCardDetails hotel={hotel} onSelect={onSelect} selecting={selecting} />
    </article>
  );
}

export function TripHostLodgingPage(props: {
  tripId: string;
  initialPlan: TripPlan;
  isHost: boolean;
  tripRange: { startIso: string; endIso: string };
  initialDestination: string;
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  initialRooms: number;
  initialLodgingType: HostLodgingType;
  initialSegmentId?: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(props.initialPlan);
  const [destination, setDestination] = useState(props.initialDestination);
  const [checkIn] = useState(props.initialCheckIn);
  const [checkOut] = useState(props.initialCheckOut);
  const [guests] = useState(props.initialGuests);
  const [rooms] = useState(props.initialRooms);
  const [lodgingType] = useState<HostLodgingType>(props.initialLodgingType);
  const [stayTab, setStayTab] = useState<StayTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [results, setResults] = useState<MockHotelBrowseResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDetail, setSearchDetail] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [propertyNameQuery, setPropertyNameQuery] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [manualStay, setManualStay] = useState<ManualStayDraft>({
    name: "",
    lodgingType: props.initialLodgingType,
    address: "",
    bookingUrl: "",
    notes: "",
  });
  const [manualError, setManualError] = useState<string | null>(null);
  const [duffelDrawerOpen, setDuffelDrawerOpen] = useState(false);

  const runSearch = useCallback(async () => {
    const dest = destination.trim();
    setLoading(true);
    setSearchError(null);
    setSearchDetail(null);

    if (dest.length < 2) {
      setSearchError(
        dest.length === 0
          ? "Enter a destination before searching."
          : `Destination "${dest}" is too short — use a full city name (e.g. Los Angeles, CA).`
      );
      setResults([]);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({
      destination: dest,
      checkIn,
      checkOut,
      guests: String(guests),
      rooms: String(rooms),
      lodgingType,
    });
    const url = `/api/trip-plans/${props.tripId}/lodging/search?${params.toString()}`;

    console.info("[lodging-search] API request", {
      url,
      fullUrl: typeof window !== "undefined" ? `${window.location.origin}${url}` : url,
      destination: dest,
      checkIn,
      checkOut,
      guests,
      rooms,
      lodgingType,
    });

    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const raw = (await res.json().catch(() => ({}))) as LodgingSearchApiResponse;

      console.info("[lodging-search] API response", {
        status: res.status,
        ok: res.ok,
        raw,
        hotelCount: raw.hotels?.length ?? 0,
        meta: raw.meta,
        error: raw.error,
        detail: raw.detail,
      });

      if (!res.ok) {
        setSearchError(raw.error || `Search failed (${res.status}).`);
        setSearchDetail(raw.detail ?? null);
        setResults([]);
        return;
      }

      const hotels = raw.hotels ?? [];
      setResults(hotels);

      if (hotels.length === 0) {
        setSearchError(raw.error || "No properties returned for this search.");
        setSearchDetail(
          raw.detail ??
            "Try a different destination or date range, or add the stay manually."
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Search failed.";
      console.error("[lodging-search] fetch error", e);
      setSearchError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [destination, checkIn, checkOut, guests, rooms, lodgingType, props.tripId]);

  useEffect(() => {
    if (props.initialDestination.trim().length >= 2) {
      void runSearch();
    } else {
      setLoading(false);
      setSearchError("Enter a destination above (full city name), then press Search.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount with server-provided destination
  }, []);

  const filteredResults = useMemo(() => {
    let rows = [...results];
    if (stayTab === "hotels") rows = rows.filter((r) => r.propertyKind === "hotel");
    if (stayTab === "homes") rows = rows.filter((r) => r.propertyKind === "home");
    const q = propertyNameQuery.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    const minParsed = priceMin.trim() === "" ? 0 : Number(priceMin);
    const maxParsed = priceMax.trim() === "" ? Infinity : Number(priceMax);
    const min = Number.isFinite(minParsed) ? minParsed : 0;
    const max = Number.isFinite(maxParsed) ? maxParsed : Infinity;
    rows = rows.filter((r) => r.nightlyUsd >= min && r.nightlyUsd <= max);
    if (selectedFilters.has("breakfast")) rows = rows.filter((r) => r.dealHighlight?.toLowerCase().includes("breakfast"));
    switch (sortKey) {
      case "price_low":
        rows.sort((a, b) => a.nightlyUsd - b.nightlyUsd);
        break;
      case "price_high":
        rows.sort((a, b) => b.nightlyUsd - a.nightlyUsd);
        break;
      case "rating":
        rows.sort((a, b) => b.reviewScore - a.reviewScore);
        break;
      default:
        break;
    }
    return rows;
  }, [results, stayTab, propertyNameQuery, priceMin, priceMax, selectedFilters, sortKey]);

  const toggleFilter = (id: string) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitHotel = useCallback(
    async (hotel: MockHotelBrowseResult) => {
      if (!props.isHost) return;
      setSelectingId(hotel.id);
      setSaveMessage(null);
      const place = mockHotelResultToPlace(hotel, destination);
      const { hotelStays, hotel: hotelPlace } = applyHostLodgingSegment(
        plan.hostSetup?.hotelStays,
        props.tripRange.startIso,
        props.tripRange.endIso,
        checkIn,
        checkOut,
        place,
        {
          destinationCity: destination,
          guestCount: guests,
          roomCount: rooms,
          userSelected: true,
          lodgingType: hotel.lodgingType,
          bookingUrl: hotel.bookingUrl ?? undefined,
        }
      );
      const gi = plan.generatedItinerary
        ? upsertLodgingActivitiesInGeneratedItinerary(
            plan.generatedItinerary,
            checkIn,
            checkOut,
            place.name,
            [destination, place.address].filter(Boolean).join(" · ") || place.address || "",
            hotel.bookingUrl
          )
        : undefined;
      try {
        const res = await fetch(`/api/trip-plans/${props.tripId}/host-setup`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hostSetup: { hotelStays, hotel: hotelPlace },
            ...(gi !== undefined ? { generatedItinerary: gi } : {}),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { plan?: TripPlan; error?: string };
        if (!res.ok) {
          setSaveMessage(j.error || "Could not save stay.");
          return;
        }
        if (j.plan) setPlan(j.plan);
        setSaveMessage(`Added ${hotel.name} to your trip.`);
        setTimeout(() => router.push(`/trip/${props.tripId}/setup#sec-lodging`), 1200);
      } catch {
        setSaveMessage("Could not save stay.");
      } finally {
        setSelectingId(null);
      }
    },
    [props.isHost, props.tripId, props.tripRange, plan, destination, checkIn, checkOut, guests, rooms, router]
  );

  const travelersLabel = `${guests} traveler${guests === 1 ? "" : "s"}, ${rooms} room${rooms === 1 ? "" : "s"}`;
  const dateLabel = formatSearchDateRange(checkIn, checkOut);

  const commitManualStay = useCallback(async () => {
    if (!props.isHost) return;
    const name = manualStay.name.trim();
    if (!name) {
      setManualError("Add the stay name.");
      return;
    }

    const bookingUrl = manualStay.bookingUrl.trim();
    if (bookingUrl && !/^https?:\/\//i.test(bookingUrl)) {
      setManualError("Use a full booking link that starts with http:// or https://.");
      return;
    }

    setManualError(null);
    setSelectingId("manual");
    setSaveMessage(null);

    const address = manualStay.address.trim();
    const detail = [destination.trim(), address].filter(Boolean).join(" · ");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [name, address || destination.trim()].filter(Boolean).join(" ")
    )}`;
    const place: PlaceSpotlight = {
      name,
      mapsUrl,
      spotlightCategory: "hotel",
      ...(address ? { address } : {}),
    };
    const { hotelStays, hotel: hotelPlace } = applyHostLodgingSegment(
      plan.hostSetup?.hotelStays,
      props.tripRange.startIso,
      props.tripRange.endIso,
      checkIn,
      checkOut,
      place,
      {
        destinationCity: destination,
        guestCount: guests,
        roomCount: rooms,
        userSelected: true,
        lodgingType: manualStay.lodgingType,
        bookingUrl: bookingUrl || undefined,
        notes: manualStay.notes,
      }
    );
    const gi = plan.generatedItinerary
      ? upsertLodgingActivitiesInGeneratedItinerary(
          plan.generatedItinerary,
          checkIn,
          checkOut,
          name,
          detail || name,
          bookingUrl || undefined
        )
      : undefined;

    try {
      const res = await fetch(`/api/trip-plans/${props.tripId}/host-setup`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostSetup: { hotelStays, hotel: hotelPlace },
          ...(gi !== undefined ? { generatedItinerary: gi } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { plan?: TripPlan; error?: string };
      if (!res.ok) {
        setManualError(j.error || "Could not save stay.");
        return;
      }
      if (j.plan) setPlan(j.plan);
      setSaveMessage(`Added ${name} to your trip.`);
      setManualStay({
        name: "",
        lodgingType: props.initialLodgingType,
        address: "",
        bookingUrl: "",
        notes: "",
      });
      setTimeout(() => router.push(`/trip/${props.tripId}/setup#sec-lodging`), 1200);
    } catch {
      setManualError("Could not save stay.");
    } finally {
      setSelectingId(null);
    }
  }, [
    checkIn,
    checkOut,
    destination,
    guests,
    manualStay,
    plan,
    props.initialLodgingType,
    props.isHost,
    props.tripId,
    props.tripRange,
    rooms,
    router,
  ]);

  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <AppTopNav />

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6">
          <Link
            href={`/trip/${props.tripId}/setup#sec-lodging`}
            className="text-sm font-medium text-[#2563EB] hover:underline dark:text-[#60A5FA]"
          >
            ← Back to trip setup
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight dark:text-white sm:text-4xl">Find lodging</h1>
              <p className="mt-1 text-sm text-[color:var(--on-surface-muted)]">
                {destination.trim() || "Your trip"} · {dateLabel} · {travelersLabel}
              </p>
            </div>
            {props.isHost && (
              <button
                type="button"
                onClick={() => setDuffelDrawerOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-[#1c1c17] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-[#1a1a1a] dark:hover:bg-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
                Book with Conci
              </button>
            )}
          </div>
        </div>

        <SearchBar
          destination={destination}
          setDestination={setDestination}
          dateLabel={dateLabel}
          travelersLabel={travelersLabel}
          onSearch={() => void runSearch()}
        />

        {props.isHost ? (
          <ManualStayCard
            draft={manualStay}
            setDraft={setManualStay}
            dateLabel={dateLabel}
            busy={selectingId === "manual"}
            error={manualError}
            onSave={() => void commitManualStay()}
          />
        ) : null}

        {saveMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {saveMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
          <LeftSidebar
            propertyNameQuery={propertyNameQuery}
            setPropertyNameQuery={setPropertyNameQuery}
            selectedFilters={selectedFilters}
            toggleFilter={toggleFilter}
            priceMin={priceMin}
            priceMax={priceMax}
            setPriceMin={setPriceMin}
            setPriceMax={setPriceMax}
          />

          <main className="min-w-0 space-y-4">
            <ResultsTabs stayTab={stayTab} setStayTab={setStayTab} count={filteredResults.length} sortKey={sortKey} setSortKey={setSortKey} />
            <PromoBanner />
            {searchError ? (
              <SearchErrorBanner
                error={searchError}
                detail={searchDetail}
              />
            ) : null}
            {loading ? (
              <LodgingResultsSkeleton />
            ) : (
              <ul className="space-y-4">
                {filteredResults.map((hotel) => (
                  <li key={hotel.id}>
                    <HotelResultCard
                      hotel={hotel}
                      onSelect={() => void commitHotel(hotel)}
                      selecting={selectingId === hotel.id}
                    />
                  </li>
                ))}
                {!filteredResults.length && results.length > 0 ? (
                  <li className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-950">
                    <p className="font-semibold">No properties match your filters</p>
                    <p className="mt-1 text-amber-900/90">
                      {results.length} propert{results.length === 1 ? "y" : "ies"} from search — try clearing filters or widening the price range.
                    </p>
                  </li>
                ) : null}
              </ul>
            )}
          </main>
        </div>
      </div>

      {props.isHost && (
        <DuffelLodgingBookingDrawer
          open={duffelDrawerOpen}
          onClose={() => setDuffelDrawerOpen(false)}
          tripId={props.tripId}
          initialDestination={destination}
          initialCheckIn={checkIn}
          initialCheckOut={checkOut}
          initialGuests={guests}
          initialRooms={rooms}
          onBookingComplete={() => {
            setDuffelDrawerOpen(false);
            setSaveMessage("Booking confirmed and saved to your trip.");
            setTimeout(() => router.push(`/trip/${props.tripId}/setup#sec-lodging`), 2000);
          }}
        />
      )}
    </div>
  );
}

function ManualStayCard({
  draft,
  setDraft,
  dateLabel,
  busy,
  error,
  onSave,
}: {
  draft: ManualStayDraft;
  setDraft: (next: ManualStayDraft) => void;
  dateLabel: string;
  busy: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const update = <K extends keyof ManualStayDraft,>(key: K, value: ManualStayDraft[K]) => {
    setDraft({ ...draft, [key]: value });
  };

  return (
    <section className="mt-4 rounded-2xl border border-[color:var(--hairline)] bg-white p-4 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
            Add a stay manually
          </h2>
          <p className="mt-1 text-sm text-[color:var(--on-surface-muted)]">
            {dateLabel} · for Airbnb, villas, hostels, resorts, or anything you found elsewhere.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="mt-3 rounded-full bg-[#2563EB] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:opacity-50 sm:mt-0"
        >
          {busy ? "Saving..." : "Add manual stay"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-200">Stay name</span>
          <input
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Casa Luna Airbnb"
            className="mt-1 w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#141414]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-200">Stay type</span>
          <select
            value={draft.lodgingType}
            onChange={(e) => update("lodgingType", e.target.value as HostLodgingType)}
            className="mt-1 w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#141414]"
          >
            {MANUAL_STAY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-200">Neighborhood or address</span>
          <input
            value={draft.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="e.g. Roma Norte, Mexico City"
            className="mt-1 w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#141414]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-200">Booking link</span>
          <input
            value={draft.bookingUrl}
            onChange={(e) => update("bookingUrl", e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#141414]"
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-200">Notes</span>
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Room setup, deposit deadline, cancellation notes..."
          className="mt-1 w-full resize-y rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#141414]"
        />
      </label>
      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function LodgingResultsSkeleton() {
  return (
    <ul className="space-y-4" aria-busy="true" aria-label="Loading results">
      {[1, 2, 3].map((i) => (
        <li key={i} className="animate-pulse overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-white dark:border-white/10 dark:bg-[#1a1a1a] sm:flex">
          <div className="aspect-[16/10] w-full bg-neutral-200 dark:bg-neutral-800 sm:h-[168px] sm:w-[200px] sm:aspect-auto" />
          <div className="flex-1 space-y-3 p-5">
            <div className="h-5 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-4 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800/80" />
            <div className="h-14 rounded bg-neutral-100 dark:bg-neutral-800/60" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SearchErrorBanner({
  error,
  detail,
}: {
  error: string;
  detail: string | null;
}) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950" role="alert">
      <p className="font-semibold">{error}</p>
      {detail ? <p className="mt-1 leading-relaxed text-rose-900">{detail}</p> : null}
    </div>
  );
}

function SearchBar(props: {
  destination: string;
  setDestination: (v: string) => void;
  dateLabel: string;
  travelersLabel: string;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--hairline)] bg-white p-3 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-[#1a1a1a] sm:flex-row sm:items-stretch sm:p-4">
      <SearchPill icon="pin" label="Where to?" value={props.destination} onChange={props.setDestination} editable />
      <SearchPill icon="calendar" label="Dates" value={props.dateLabel} />
      <SearchPill icon="person" label="Travelers" value={props.travelersLabel} />
      <button
        type="button"
        onClick={props.onSearch}
        className="flex h-11 w-full shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white shadow-sm transition hover:bg-[#1d4ed8] sm:h-auto sm:w-11 sm:self-center sm:rounded-full"
        aria-label="Search"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" />
        </svg>
      </button>
    </div>
  );
}

function SearchPill({
  icon,
  label,
  value,
  onChange,
  editable,
}: {
  icon: "pin" | "calendar" | "person";
  label: string;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-2.5 dark:border-white/10 dark:bg-[#141414]">
      <SearchPillIcon icon={icon} />
      <SearchPillContent label={label} value={value} onChange={onChange} editable={editable} />
    </div>
  );
}

function SearchPillIcon({ icon }: { icon: "pin" | "calendar" | "person" }) {
  const cls = "h-5 w-5 shrink-0 text-neutral-700";
  if (icon === "pin") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }
  if (icon === "calendar") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  );
}

function SearchPillContent({
  label,
  value,
  onChange,
  editable,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      {editable && onChange ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full truncate border-0 bg-transparent p-0 text-sm font-medium text-neutral-900 outline-none"
        />
      ) : (
        <p className="truncate text-sm font-medium text-neutral-900">{value}</p>
      )}
    </div>
  );
}

function LeftSidebar(props: {
  propertyNameQuery: string;
  setPropertyNameQuery: (v: string) => void;
  selectedFilters: Set<string>;
  toggleFilter: (id: string) => void;
  priceMin: string;
  priceMax: string;
  setPriceMin: (v: string) => void;
  setPriceMax: (v: string) => void;
}) {
  return (
    <aside className="hidden w-full shrink-0 space-y-4 lg:block lg:w-[240px]">
      <div className="rounded-2xl border border-[color:var(--hairline)] bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
        <label className="text-xs font-semibold text-[color:var(--on-surface)] dark:text-neutral-200">Search by name</label>
        <div className="relative mt-1.5">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" />
          </svg>
          <input
            value={props.propertyNameQuery}
            onChange={(e) => props.setPropertyNameQuery(e.target.value)}
            placeholder="e.g. Marriott"
            className="w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] py-2 pl-8 pr-2 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#141414]"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--hairline)] bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
        <h2 className="text-sm font-semibold text-[color:var(--on-surface)] dark:text-white">Filters</h2>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">Popular</h3>
        <ul className="mt-2 space-y-2.5">
          {POPULAR_FILTERS.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[color:var(--on-surface)] dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={props.selectedFilters.has(f.id)}
                  onChange={() => props.toggleFilter(f.id)}
                  className="mt-0.5 rounded border-neutral-300 accent-[#2563EB]"
                />
                <span>{f.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">Nightly price</h3>
        <PriceRangeInputs {...props} />
      </div>
    </aside>
  );
}

function PriceRangeInputs(props: {
  priceMin: string;
  priceMax: string;
  setPriceMin: (v: string) => void;
  setPriceMax: (v: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] font-semibold text-neutral-500">Min</label>
        <div className="relative mt-0.5">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-neutral-500">$</span>
          <input
            value={props.priceMin}
            onChange={(e) => props.setPriceMin(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--hairline)] py-1.5 pl-5 pr-1 text-sm outline-none focus:border-[#2563EB] dark:border-white/15"
          />
        </div>
      </div>
      <PriceMaxInput priceMax={props.priceMax} setPriceMax={props.setPriceMax} />
    </div>
  );
}

function PriceMaxInput(props: {
  priceMax: string;
  setPriceMax: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-neutral-500">Max</label>
      <div className="relative mt-0.5">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-neutral-500">$</span>
        <input
          value={props.priceMax}
          onChange={(e) => props.setPriceMax(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--hairline)] py-1.5 pl-5 pr-1 text-sm outline-none focus:border-[#2563EB] dark:border-white/15"
        />
      </div>
    </div>
  );
}

function ResultsTabs(props: {
  stayTab: StayTab;
  setStayTab: (t: StayTab) => void;
  count: number;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
}) {
  const tabs: { id: StayTab; label: string }[] = [
    { id: "all", label: "All stays" },
    { id: "hotels", label: "Hotels" },
    { id: "homes", label: "Homes" },
  ];
  return (
    <div className="space-y-3">
      <ResultsTabsRow tabs={tabs} stayTab={props.stayTab} setStayTab={props.setStayTab} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-[color:var(--on-surface)] dark:text-neutral-200">
          {props.count} {props.count === 1 ? "property" : "properties"}
        </p>
        <select
          value={props.sortKey}
          onChange={(e) => props.setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-[color:var(--hairline)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#2563EB] dark:border-white/15 dark:bg-[#1a1a1a]"
          aria-label="Sort results"
        >
          <option value="recommended">Recommended</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
          <option value="rating">Guest rating</option>
        </select>
      </div>
    </div>
  );
}

function ResultsTabsRow({
  tabs,
  stayTab,
  setStayTab,
}: {
  tabs: { id: StayTab; label: string }[];
  stayTab: StayTab;
  setStayTab: (t: StayTab) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-full border border-[color:var(--hairline)] bg-white p-1 dark:border-white/10 dark:bg-[#1a1a1a]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setStayTab(tab.id)}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition",
            stayTab === tab.id
              ? "bg-[#2563EB] text-white shadow-sm"
              : "text-[color:var(--on-surface-muted)] hover:text-[color:var(--on-surface)] dark:hover:text-white",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PromoBanner() {
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/25">
      <p className="text-sm font-semibold text-neutral-900 dark:text-amber-50">Member savings on select stays</p>
      <p className="mt-0.5 text-xs text-neutral-600 dark:text-amber-200/75">
        Eligible discounts apply at checkout when available.
      </p>
    </div>
  );
}
