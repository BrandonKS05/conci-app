"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  mockHotelResultToPlace,
  mockHotelSearchBrowse,
  type MockHotelAmenityIcon,
  type MockHotelBrowseResult,
} from "@/shared/mock-hotel-search";
import {
  applyHostLodgingSegment,
  upsertLodgingActivitiesInGeneratedItinerary,
  type HostLodgingType,
  type TripPlan,
} from "@/shared/trip-plan";

type StayTab = "all" | "hotels" | "homes";
type SortKey = "recommended" | "price_low" | "price_high" | "rating";

const TEAL = "#00897b";
const RATING_GREEN = "#1b5e20";

const POPULAR_FILTERS = [
  { id: "downtown", label: "Downtown", count: 38 },
  { id: "breakfast", label: "Breakfast included", count: 571 },
  { id: "shuttle", label: "Airport shuttle included", count: 72 },
  { id: "hotel", label: "Hotel", count: 893 },
  { id: "pay_later", label: "Reserve now, pay later", count: null as number | null },
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
  const [savedHeart, setSavedHeart] = useState(false);

  return (
    <LodgingCardPhoto hotel={hotel} savedHeart={savedHeart} setSavedHeart={setSavedHeart} />
  );
}

function LodgingCardPhoto({
  hotel,
  savedHeart,
  setSavedHeart,
}: {
  hotel: MockHotelBrowseResult;
  savedHeart: boolean;
  setSavedHeart: (v: boolean) => void;
}) {
  return (
    <div className="relative w-full shrink-0 sm:w-[220px]">
      {hotel.imageUrl ? (
        <div className="relative h-48 w-full sm:h-full sm:min-h-[200px]">
          <Image src={hotel.imageUrl} alt={hotel.name} fill className="object-cover" sizes="220px" />
        </div>
      ) : (
        <LodgingCardPhotoGradient hotel={hotel} />
      )}
      {hotel.vipAccess ? (
        <span className="absolute left-0 top-0 w-full bg-black/55 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white">
          VIP Access
        </span>
      ) : null}
      <button
        type="button"
        aria-label={savedHeart ? "Remove from saved" : "Save property"}
        onClick={() => setSavedHeart(!savedHeart)}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:bg-white"
      >
        <svg
          className={`h-4 w-4 ${savedHeart ? "fill-rose-500 text-rose-500" : "fill-none text-neutral-700"}`}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
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
      className="h-48 w-full sm:h-full sm:min-h-[200px]"
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
    <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:flex-row sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="text-lg font-bold leading-snug text-neutral-900">{hotel.name}</h3>
        <p className="text-sm text-neutral-600">{hotel.distanceLabel}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          {hotel.amenities.map((a) => (
            <span key={a.label} className="inline-flex items-center gap-1 text-xs text-neutral-700">
              <AmenityIcon kind={a.icon} />
              {a.label}
            </span>
          ))}
        </div>
        {hotel.dealHighlight ? (
          <p className="pt-1 text-sm font-semibold" style={{ color: TEAL }}>
            {hotel.dealHighlight}
          </p>
        ) : null}
        <p className="text-sm leading-relaxed text-neutral-500">{hotel.description}</p>
        {hotel.reserveNowPayLater ? (
          <button type="button" className="text-left text-sm font-medium hover:underline" style={{ color: TEAL }}>
            Reserve now, pay later
          </button>
        ) : null}
        {hotel.urgencyText ? <p className="text-sm font-medium text-rose-600">{hotel.urgencyText}</p> : null}
        <button
          type="button"
          disabled={selecting}
          onClick={onSelect}
          className="mt-2 rounded-lg bg-[#1668e3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d4fbf] disabled:opacity-50"
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
          <span
            className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-md px-1 text-sm font-bold text-white"
            style={{ backgroundColor: RATING_GREEN }}
          >
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
    <article className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md sm:flex-row">
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
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState("230");
  const [priceMax, setPriceMax] = useState("1550");
  const [propertyNameQuery, setPropertyNameQuery] = useState("");
  const [compareOpen, setCompareOpen] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setSearchError(null);
    try {
      const rows = await mockHotelSearchBrowse({
        destination,
        checkInIso: checkIn,
        checkOutIso: checkOut,
        guests,
        rooms,
        lodgingType,
      });
      setResults(rows);
    } catch {
      setSearchError("Search failed. Try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [destination, checkIn, checkOut, guests, rooms, lodgingType]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const filteredResults = useMemo(() => {
    let rows = [...results];
    if (stayTab === "hotels") rows = rows.filter((r) => r.propertyKind === "hotel");
    if (stayTab === "homes") rows = rows.filter((r) => r.propertyKind === "home");
    const q = propertyNameQuery.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    const min = Number(priceMin) || 0;
    const max = Number(priceMax) || Infinity;
    rows = rows.filter((r) => r.nightlyUsd >= min && r.nightlyUsd <= max);
    if (selectedFilters.has("pay_later")) rows = rows.filter((r) => r.reserveNowPayLater);
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
        }
      );
      const gi = plan.generatedItinerary
        ? upsertLodgingActivitiesInGeneratedItinerary(
            plan.generatedItinerary,
            checkIn,
            checkOut,
            place.name,
            [destination, place.address].filter(Boolean).join(" · ") || place.address || "",
            undefined
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

  return (
    <div className="min-h-screen bg-neutral-100 font-sans text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <LodgingPageHeader tripId={props.tripId} />
      </header>

      <div className="mx-auto w-full max-w-[1280px] px-3 py-4 sm:px-4 sm:py-5">
        <SearchBar
          destination={destination}
          setDestination={setDestination}
          dateLabel={dateLabel}
          travelersLabel={travelersLabel}
          onSearch={() => void runSearch()}
        />

        {saveMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {saveMessage}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-4 xl:grid xl:grid-cols-[260px_minmax(0,1fr)_180px] xl:gap-5">
          <LeftSidebar
            compareOpen={compareOpen}
            setCompareOpen={setCompareOpen}
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
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{searchError}</p>
            ) : null}
            {loading ? (
              <p className="py-12 text-center text-sm text-neutral-500">Searching stays…</p>
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
                {!filteredResults.length ? (
                  <li className="py-12 text-center text-sm text-neutral-500">No properties match your filters.</li>
                ) : null}
              </ul>
            )}
          </main>

          <RightAdColumn />
        </div>
      </div>
    </div>
  );
}

function LodgingPageHeader({ tripId }: { tripId: string }) {
  return (
    <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3">
      <Link href={`/trip/${tripId}/setup`} className="text-sm font-medium text-[#1668e3] hover:underline">
        ← Back to trip setup
      </Link>
      <span className="text-lg font-bold tracking-tight text-[#191e3b]">Lodging search</span>
      <span className="w-24" aria-hidden />
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
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center">
      <SearchPill icon="pin" label="Where to?" value={props.destination} onChange={props.setDestination} editable />
      <SearchPill icon="calendar" label="Dates" value={props.dateLabel} />
      <SearchPill icon="person" label="Travelers" value={props.travelersLabel} />
      <button
        type="button"
        onClick={props.onSearch}
        className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-full bg-[#1668e3] text-white shadow-md transition hover:bg-[#0d4fbf] sm:self-center"
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
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-neutral-200 px-4 py-2.5">
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
  compareOpen: boolean;
  setCompareOpen: (v: boolean) => void;
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
    <aside className="hidden w-full shrink-0 space-y-4 xl:block xl:w-[260px]">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="relative h-28 bg-gradient-to-br from-sky-100 to-sky-200">
          <div className="absolute inset-0 flex items-center justify-center">
            {[20, 45, 70].map((left) => (
              <span
                key={left}
                className="absolute bottom-8 h-3 w-3 rounded-full bg-[#1668e3] shadow"
                style={{ left: `${left}%` }}
              />
            ))}
          </div>
        </div>
        <button type="button" className="w-full px-3 py-2 text-left text-sm font-medium text-[#1668e3] hover:underline">
          View in a map
        </button>
      </div>

      {props.compareOpen ? (
        <ComparePropertiesBox setCompareOpen={props.setCompareOpen} />
      ) : null}

      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <label className="text-xs font-semibold text-neutral-800">Search by property name</label>
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
            className="w-full rounded-md border border-neutral-300 py-2 pl-8 pr-2 text-sm outline-none focus:border-[#1668e3]"
          />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <h2 className="text-base font-bold text-neutral-900">Filter by</h2>
        <h3 className="mt-3 text-sm font-bold text-neutral-900">Popular filters</h3>
        <ul className="mt-2 space-y-2">
          {POPULAR_FILTERS.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={props.selectedFilters.has(f.id)}
                  onChange={() => props.toggleFilter(f.id)}
                  className="mt-0.5 rounded border-neutral-400"
                />
                <span>
                  {f.label}
                  {f.count != null ? <span className="text-neutral-500"> ({f.count})</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-bold text-neutral-900">Total price</h3>
        <PriceRangeInputs {...props} />
      </div>
    </aside>
  );
}

function ComparePropertiesBox({ setCompareOpen }: { setCompareOpen: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3">
      <ComparePropertiesContent />
      <button
        type="button"
        onClick={() => setCompareOpen(false)}
        className="shrink-0 text-neutral-400 hover:text-neutral-700"
        aria-label="Dismiss compare properties"
      >
        ×
      </button>
    </div>
  );
}

function ComparePropertiesContent() {
  return (
    <div>
      <p className="text-sm font-bold text-neutral-900">Compare properties</p>
      <p className="mt-1 text-xs text-neutral-600">Get a side-by-side view of up to 5 properties.</p>
      <label className="mt-2 flex cursor-pointer items-center gap-2">
        <input type="checkbox" className="rounded border-neutral-400" />
        <span className="text-xs text-neutral-700">Enable compare</span>
      </label>
    </div>
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
            className="w-full rounded-md border border-neutral-300 py-1.5 pl-5 pr-1 text-sm outline-none focus:border-[#1668e3]"
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
          className="w-full rounded-md border border-neutral-300 py-1.5 pl-5 pr-1 text-sm outline-none focus:border-[#1668e3]"
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
  const tabs: { id: StayTab; label: string; icon: string }[] = [
    { id: "all", label: "All stays", icon: "🛏" },
    { id: "hotels", label: "Hotels", icon: "🏢" },
    { id: "homes", label: "Homes", icon: "🏠" },
  ];
  return (
    <div className="space-y-3">
      <ResultsTabsRow tabs={tabs} stayTab={props.stayTab} setStayTab={props.setStayTab} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium text-neutral-900">{props.count} properties</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1 text-[#1668e3] hover:underline">
            How our sort order works
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#1668e3] text-[10px]">
              i
            </span>
          </button>
          <select
            value={props.sortKey}
            onChange={(e) => props.setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-[#1668e3]"
          >
            <option value="recommended">Sort by recommended for you</option>
            <option value="price_low">Price: low to high</option>
            <option value="price_high">Price: high to low</option>
            <option value="rating">Guest rating</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function ResultsTabsRow({
  tabs,
  stayTab,
  setStayTab,
}: {
  tabs: { id: StayTab; label: string; icon: string }[];
  stayTab: StayTab;
  setStayTab: (t: StayTab) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-neutral-200/80 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setStayTab(tab.id)}
          className={[
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition",
            stayTab === tab.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900",
          ].join(" ")}
        >
          <span aria-hidden>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PromoBanner() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-[#f5f0e6] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1668e3]/10 text-xl" aria-hidden>
          🏷
        </span>
        <div>
          <p className="font-bold text-neutral-900">Up to an extra $25 off, just for you</p>
          <p className="mt-0.5 text-sm text-neutral-600">
            Members can save more on select stays. Discount applied at checkout when eligible.
          </p>
        </div>
      </div>
      <button type="button" className="shrink-0 text-sm font-medium text-[#1668e3] hover:underline">
        View terms
      </button>
    </div>
  );
}

function RightAdColumn() {
  return (
    <aside className="hidden w-[180px] shrink-0 space-y-4 xl:block">
      <div className="flex h-72 flex-col justify-end overflow-hidden rounded-lg bg-gradient-to-b from-sky-600 to-sky-800 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-90">San Diego</p>
        <p className="mt-1 text-lg font-bold leading-tight">Summer of SOCCER</p>
        <button type="button" className="mt-3 w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-800">
          Book now
        </button>
      </div>
      <div className="flex h-72 flex-col justify-end overflow-hidden rounded-lg bg-gradient-to-b from-amber-700 to-amber-900 p-4 text-white">
        <p className="text-sm font-semibold leading-snug">Put yourself in a golden state of mind.</p>
      </div>
    </aside>
  );
}
