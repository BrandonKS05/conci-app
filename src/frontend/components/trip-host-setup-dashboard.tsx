"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatLocalIsoDate,
  inferYearMonthFromDateOptionsHints,
} from "@/shared/date-option-parse";
import {
  concreteTripRangeFromPlanDates,
  hasUserSelectedLodging,
  mergeAiHotelStaysPreservingUser,
  enumerateLocalIsoDays,
  hostHasConcreteTripRange,
  hostCalendarHotelDisplayTitle,
  hotelStayRowsForCalendarDay,
  type HostHotelCalendarEdge,
  normalizePlan,
  parseLocalIsoDate,
  seedTextMentionsDining,
  tripLiveRecommendationsContextFingerprint,
  type HostActivityExperience,
  type HostActivityPin,
  type HostHotelStay,
  type HostLodgingType,
  type HostRestaurantPin,
  type HostSetupState,
  type TripPlan,
} from "@/shared/trip-plan";
import type { TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";
import {
  CuratedFlightsRows,
  HostLiveScheduleByDay,
  LiveCurationErrorBanner,
  useLiveCurationMutation,
} from "@/frontend/components/trip-plan-live-curate";
import type { LodgingModalSeed } from "@/frontend/components/host-hotel-search-modal";
import {
  HostSetupAddPlacesModal,
} from "@/frontend/components/host-setup-add-places-modal";
import {
  HostSetupPinDetailModal,
  HostSetupRemovePinConfirm,
  type PinDetailState,
} from "@/frontend/components/host-setup-pin-modals";
import {
  HostSetupCopilot,
  type HostCopilotUiHint,
} from "@/frontend/components/host-setup-copilot";
import { SiteShell } from "@/frontend/components/site-shell";
import { GeneratedItineraryView } from "@/frontend/components/generated-itinerary-view";
import { HostFlightSearchPanel } from "@/frontend/components/host-flight-search-panel";
import { restaurantPickToSpotlight, type RestaurantPick } from "@/shared/restaurants";
import type { LiveExperienceCard } from "@/shared/trip-live-recommendations";
import type { PlaceSpotlight } from "@/shared/place-preview";
import { parseTripPlanStatus, type TripPlanStatus } from "@/shared/trip-status";
import { VIBE_POLL_DECISION_KEY, type CollabStateV1 } from "@/shared/collaboration";
import { tripDestinationCoverFromPlan } from "@/shared/trip-destination-cover";
import { TripCardChatWidget } from "@/frontend/components/trip-card-chat-widget";
import { TripCollaborationPanel } from "@/frontend/components/trip-collaboration-panel";
import { TripHostSetupSidebar } from "@/frontend/components/trip-host-setup-sidebar";
import { TripContributeButton } from "@/frontend/components/trip-contribute-button";
import { MyPreferencesCard } from "@/frontend/components/my-preferences-card";
import { TripCostRollup } from "@/frontend/components/trip-cost-rollup";
import { TripDepositTracker } from "@/frontend/components/trip-deposit-tracker";
import { InviteCodeRow } from "@/frontend/components/invite-code-row";
import { useTripCalendarPresence } from "@/frontend/hooks/use-trip-calendar-presence";
import {
  TRIP_WORKSPACE_SECTION_TO_TAB,
  type TripWorkspaceTabId,
} from "@/frontend/hooks/use-active-trip-tab";
import { useTripWorkspaceRealtime } from "@/frontend/hooks/use-trip-workspace-realtime";

const JOIN_WITH_CODE_URL = "/join?from=create";

const LEFT_RAIL_TABS: readonly {
  id: TripWorkspaceTabId;
  label: string;
  navIconId: string;
}[] = [
  { id: "overview", label: "Overview", navIconId: "overview" },
  { id: "transportation", label: "Transportation", navIconId: "flights" },
  { id: "budget", label: "Budget", navIconId: "budget" },
  { id: "fund", label: "Fund", navIconId: "fund" },
  { id: "collaborate", label: "Collaborate", navIconId: "collaborate" },
  { id: "lodging", label: "Lodging", navIconId: "lodging" },
];

function firstHotelStayHeroPhotoUrl(place: PlaceSpotlight | undefined | null): string | null {
  if (!place) return null;
  const extended = place as PlaceSpotlight & { photoUrls?: unknown };
  const urls = extended.photoUrls;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (typeof u === "string" && u.trim()) return u.trim();
    }
  }
  const single = place.photoUrl?.trim();
  return single || null;
}

function formatShortStayRange(startIso: string, endIso: string): string {
  const a = parseLocalIsoDate(startIso);
  const b = parseLocalIsoDate(endIso);
  if (!a || !b) return `${startIso} — ${endIso}`;
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yA = a.getFullYear();
  const yB = b.getFullYear();
  const sameYear = yA === yB;
  const left = a.toLocaleDateString(undefined, sameYear ? o : { ...o, year: "numeric" });
  const right = b.toLocaleDateString(undefined, sameYear ? o : { ...o, year: "numeric" });
  return `${left} — ${right}`;
}

function homeBaseHeroImageSources(
  plan: TripPlan,
  destinationCoverUrl?: string | null
): { src: string; unoptimized: boolean } | null {
  const stays = plan.hostSetup?.hotelStays ?? [];
  const stay0 =
    stays.length > 0
      ? [...stays].sort((a, b) => a.startIso.localeCompare(b.startIso))[0]
      : undefined;
  const fromPlace = firstHotelStayHeroPhotoUrl(stay0?.place);
  if (fromPlace) return { src: fromPlace, unoptimized: !fromPlace.startsWith("/") };
  const trimmedServer = typeof destinationCoverUrl === "string" ? destinationCoverUrl.trim() : "";
  if (trimmedServer)
    return { src: trimmedServer, unoptimized: !trimmedServer.startsWith("/") };
  const cover = tripDestinationCoverFromPlan(plan);
  if (cover) return { src: cover, unoptimized: !cover.startsWith("/") };
  return null;
}

function googleMapsDirUrl(origin: string, dest: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
}

type Props = {
  tripId: string;
  initialPlan: TripPlan;
  /** Original parser message — used only to decide if meal pins auto-seed. */
  seedText?: string | null;
  initialTripStatus: TripPlanStatus;
  initialCollab: CollabStateV1;
  viewerUserId: string;
  tripOwnerUserId: string | null;
  inviteCode: string | null;
  /** Invited members see the same calendar and collab; only the host can edit setup. */
  isHost?: boolean;
  /** Server-fetched Wikipedia/Unsplash-style cover when plan has no hotel photo. */
  destinationCoverUrl?: string | null;
};

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

const WEEKDAY_SUN_FIRST = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** Stay + pins shown per day cell; extra rows summarized so week rows stay a uniform height. */
const CALENDAR_CELL_MAX_VISIBLE_ITEMS = 2;

const HOST_CALENDAR_HOTEL_EDGE_LABEL: Record<HostHotelCalendarEdge, string> = {
  "check-in": "Check-in",
  "check-out": "Check-out",
  "check-in-out": "Check-in · Check-out",
};

function lodgingTypeBadgeLabel(type: HostLodgingType | undefined): string {
  return type === "airbnb" ? "Airbnb" : "Hotel";
}

function StayCardHeroImage({
  src,
  alt,
  unoptimized,
  lodgingType,
}: {
  src: string;
  alt: string;
  unoptimized: boolean;
  lodgingType: HostLodgingType | undefined;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className="relative h-28 w-full overflow-hidden border-b border-[color:var(--hairline)] sm:h-32 dark:border-white/10">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 480px"
        unoptimized={unoptimized}
        onError={() => setFailed(true)}
      />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        {lodgingTypeBadgeLabel(lodgingType)}
      </span>
    </div>
  );
}

type TripLodgingPanelProps = {
  plan: TripPlan;
  canEditAsHost: boolean;
  canEditTripWorkspace: boolean;
  tripDisplayRange: { startIso: string; endIso: string } | null;
  sortedHotelStays: HostHotelStay[];
  primaryHotelSummary: { title: string; detail: string } | null;
  homeBaseHero: { src: string; unoptimized: boolean } | null;
  onOpenLodgingModal: (seed?: LodgingModalSeed | null) => void;
};

function TripLodgingPanel({
  plan,
  canEditAsHost,
  canEditTripWorkspace,
  tripDisplayRange,
  sortedHotelStays,
  primaryHotelSummary,
  homeBaseHero,
  onOpenLodgingModal,
}: TripLodgingPanelProps) {
  const stays = plan.hostSetup?.hotelStays ?? [];

  return (
    <section id="sec-lodging" className="scroll-mt-28 space-y-6">
      <div>
        <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Lodging</p>
        <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
          Where you&apos;re staying
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
          Conci still suggests lodging when you have none. Your picks stay on refit. Stays also show on the trip calendar — tap a
          row there to edit dates. Trip Copilot can book or change lodging when you ask.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-4 dark:border-white/10 dark:bg-dm-elevated">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-[color:var(--on-surface)] dark:text-[#ebe9e4]">Your stays</h3>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              Whole trip or multi-city legs — hotel or Airbnb.
            </p>
          </div>
          {canEditAsHost && tripDisplayRange?.startIso ? (
            <button
              type="button"
              onClick={() => onOpenLodgingModal()}
              className="shrink-0 rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]"
            >
              Add or change lodging
            </button>
          ) : null}
        </div>

        {!stays.length ? (
          <p className="mt-3 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            {canEditAsHost
              ? "No stay saved yet — add lodging here or tap a lodging row on the Overview calendar."
              : "No lodging saved on the plan yet."}
          </p>
        ) : sortedHotelStays.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {sortedHotelStays.map((stay, idx) => (
              <li
                key={`${stay.startIso}-${stay.endIso}-${stay.place.mapsUrl}-${idx}`}
                className="overflow-hidden rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] dark:border-white/10 dark:bg-dm-card"
              >
                {idx === 0 && homeBaseHero ? (
                  <StayCardHeroImage
                    src={homeBaseHero.src}
                    alt={stay.place.name}
                    unoptimized={homeBaseHero.unoptimized}
                    lodgingType={stay.lodgingType}
                  />
                ) : null}
                <div className="px-3 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{stay.place.name}</span>
                    <span className="text-xs tabular-nums text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      {formatShortStayRange(stay.startIso, stay.endIso)}
                    </span>
                  </div>
                  {stay.userSelected ? (
                    <span className="mt-1 inline-block rounded-full bg-[color:var(--surface-container-high)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:bg-white/10 dark:text-neutral-400">
                      Your pick
                    </span>
                  ) : stay.recommendedByConci ? (
                    <span className="mt-1 inline-block rounded-full bg-teal-950/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                      Suggested by Conci
                    </span>
                  ) : null}
                  {stay.destinationCity?.trim() ? (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      {stay.destinationCity.trim()}
                    </p>
                  ) : null}
                  {(stay.guestCount != null || stay.roomCount != null) ? (
                    <p className="mt-0.5 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      {stay.guestCount != null ? `${stay.guestCount} guests` : null}
                      {stay.guestCount != null && stay.roomCount != null ? " · " : null}
                      {stay.roomCount != null ? `${stay.roomCount} room${stay.roomCount === 1 ? "" : "s"}` : null}
                    </p>
                  ) : null}
                  {(stay.place.address?.trim() || stay.notes?.trim()) ? (
                    <p className="mt-1 text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      {stay.place.address?.trim() || stay.notes?.trim()}
                    </p>
                  ) : null}
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {stay.bookingUrl?.startsWith("http") ? (
                      <a
                        href={stay.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[color:var(--sage)] underline-offset-2 hover:underline dark:text-emerald-300"
                      >
                        Booking
                      </a>
                    ) : null}
                    {stay.place.mapsUrl?.startsWith("http") ? (
                      <a
                        href={stay.place.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[color:var(--sage)] underline-offset-2 hover:underline dark:text-emerald-300"
                      >
                        Maps
                      </a>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-3 space-y-2">
            {stays.map((s) => (
              <li
                key={`${s.startIso}-${s.endIso}-${s.place.mapsUrl}`}
                className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-3 py-2 dark:border-white/10 dark:bg-dm-card"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[color:var(--on-surface)] dark:text-[#ebe9e4]">{s.place.name}</span>
                  <span className="text-xs tabular-nums text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    {formatShortStayRange(s.startIso, s.endIso)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {primaryHotelSummary && !stays.length ? (
          <p className="mt-3 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">{primaryHotelSummary.detail}</p>
        ) : null}

        {canEditAsHost && tripDisplayRange?.startIso && tripDisplayRange?.endIso ? (
          <button
            type="button"
            onClick={() => onOpenLodgingModal()}
            className="mt-4 w-full rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2 text-center text-xs font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4] sm:w-auto"
          >
            {sortedHotelStays.length > 0 ? "Change lodging" : "Add lodging"}
          </button>
        ) : null}
      </div>

      {canEditTripWorkspace && !hostHasConcreteTripRange(plan) ? (
        <p className="text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          Set trip dates on Overview to add lodging segments.
        </p>
      ) : null}
    </section>
  );
}

/** Sunday-first month grid padding (matches reference editorial layout). */
function calendarCellsSundayFirst(viewYear: number, viewMonth: number): (number | null)[] {
  const padSun = new Date(viewYear, viewMonth, 1).getDay();
  const n = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < padSun; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function chunkWeeks(cells: (number | null)[]): (number | null)[][] {
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function isoFromCell(viewYear: number, viewMonth: number, dom: number): string {
  return formatLocalIsoDate(new Date(viewYear, viewMonth, dom, 12, 0, 0, 0));
}

type TripCalendarDayRole = "arrival" | "departure" | "on-trip" | null;

function tripCalendarDayRole(
  cellIso: string,
  range: { startIso: string; endIso: string } | null
): TripCalendarDayRole {
  if (!range?.startIso || !range?.endIso) return null;
  const days = enumerateLocalIsoDays(range.startIso, range.endIso);
  if (!days.includes(cellIso)) return null;
  if (cellIso === range.startIso && cellIso === range.endIso) return "arrival";
  if (cellIso === range.startIso) return "arrival";
  if (cellIso === range.endIso) return "departure";
  return "on-trip";
}

function tripCalendarCellSurfaceClass(role: TripCalendarDayRole): string {
  if (!role) return "";
  if (role === "arrival") {
    return "bg-sky-500/[0.08] ring-2 ring-inset ring-sky-400/60 dark:bg-sky-500/[0.14] dark:ring-sky-500/50";
  }
  if (role === "departure") {
    return "bg-violet-500/[0.08] ring-2 ring-inset ring-violet-400/60 dark:bg-violet-500/[0.14] dark:ring-violet-500/50";
  }
  return "bg-[#2563EB]/[0.08] ring-2 ring-inset ring-[#2563EB]/35 dark:bg-[#2563EB]/[0.14] dark:ring-[#60A5FA]/40";
}

function tripCalendarDayBadgeLabel(
  role: TripCalendarDayRole,
  range: { startIso: string; endIso: string } | null
): string | null {
  if (!role || !range) return null;
  if (range.startIso === range.endIso) return "Trip day";
  if (role === "arrival") return "Arrival";
  if (role === "departure") return "Departure";
  return "On trip";
}

function TripCalendarDayBadge({
  role,
  range,
}: {
  role: TripCalendarDayRole;
  range: { startIso: string; endIso: string } | null;
}) {
  const label = tripCalendarDayBadgeLabel(role, range);
  if (!label) return null;
  const tone =
    role === "arrival"
      ? "border-sky-300/80 bg-sky-100/90 text-sky-900 dark:border-sky-600/50 dark:bg-sky-900/50 dark:text-sky-100"
      : role === "departure"
        ? "border-violet-300/80 bg-violet-100/90 text-violet-900 dark:border-violet-600/50 dark:bg-violet-900/50 dark:text-violet-100"
        : "border-[#2563EB]/30 bg-white/80 text-[#1e40af] dark:border-[#60A5FA]/35 dark:bg-[#2563EB]/20 dark:text-[#93c5fd]";
  return (
    <span
      className={[
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.1em] sm:text-[10px]",
        tone,
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function TripCalendarLegend({
  range,
}: {
  range: { startIso: string; endIso: string } | null;
}) {
  if (!range?.startIso || !range?.endIso) return null;
  const singleDay = range.startIso === range.endIso;
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color:var(--hairline)] pb-3 text-[11px] font-medium text-[color:var(--on-surface-muted)] dark:border-white/10"
      aria-label="Trip calendar legend"
    >
      {singleDay ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-4 w-5 shrink-0 rounded-sm bg-sky-500/15 ring-2 ring-inset ring-sky-400/60 dark:bg-sky-500/25 dark:ring-sky-500/50"
            aria-hidden
          />
          Trip day
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-4 w-5 shrink-0 rounded-sm bg-sky-500/15 ring-2 ring-inset ring-sky-400/60 dark:bg-sky-500/25 dark:ring-sky-500/50"
              aria-hidden
            />
            Arrival
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-4 w-5 shrink-0 rounded-sm bg-[#2563EB]/10 ring-2 ring-inset ring-[#2563EB]/35 dark:bg-[#2563EB]/20 dark:ring-[#60A5FA]/40"
              aria-hidden
            />
            On trip
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-4 w-5 shrink-0 rounded-sm bg-violet-500/15 ring-2 ring-inset ring-violet-400/60 dark:bg-violet-500/25 dark:ring-violet-500/50"
              aria-hidden
            />
            Departure
          </span>
        </>
      )}
    </div>
  );
}

function calendarPinShellClass(emphasis: boolean): string {
  if (!emphasis) return "min-w-0 py-0.5";
  return "rounded-md bg-[#1c1c17] px-1.5 py-1 shadow-none dark:bg-neutral-200";
}

/** Human-readable range for the confirm dialog. */
function formatPinDayLabel(iso: string): string {
  const d = parseLocalIsoDate(iso);
  return d
    ? d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
    : iso;
}

function formatTripRangeLabel(startIso: string, endIso: string): string {
  const a = parseLocalIsoDate(startIso);
  const b = parseLocalIsoDate(endIso);
  if (!a || !b) return `${startIso} → ${endIso}`;
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (startIso === endIso) return a.toLocaleDateString(undefined, o);
  return `${a.toLocaleDateString(undefined, o)} — ${b.toLocaleDateString(undefined, o)}`;
}

function ChevLeft({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M12.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L9.414 10l3.293 3.293a1 1 0 010 1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Stroked nav icons for the left rail. Keeps line-weight consistent with editorial typography. */
function NavIcon({ id }: { id: string }) {
  const stroke = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4",
    "aria-hidden": true,
  };
  switch (id) {
    case "overview":
      return (
        <svg {...stroke}>
          <rect x="3.2" y="3.2" width="5.8" height="5.8" rx="0.9" />
          <rect x="11" y="3.2" width="5.8" height="5.8" rx="0.9" />
          <rect x="3.2" y="11" width="5.8" height="5.8" rx="0.9" />
          <rect x="11" y="11" width="5.8" height="5.8" rx="0.9" />
        </svg>
      );
    case "fund":
      return (
        <svg {...stroke}>
          <path d="M5.5 4.5h9a1.6 1.6 0 0 1 1.6 1.6v10.3a1.2 1.2 0 0 1-1.2 1.2H5.1a1.2 1.2 0 0 1-1.2-1.2V6.1a1.6 1.6 0 0 1 1.6-1.6Z" />
          <path d="M7 8.2h6M7 11.2h4" />
        </svg>
      );
    case "collaborate":
      return (
        <svg {...stroke}>
          <circle cx="7.2" cy="7" r="1.9" />
          <path d="M3.2 15.2c.5-2 2.2-3.3 4-3.3s3.5 1.3 4 3.3" />
          <circle cx="13.8" cy="6.2" r="1.5" />
          <path d="M11.2 14.2c.3-1.1 1.1-1.9 2.2-1.9 1 0 1.9.8 2.1 1.9" />
          <path d="M15.2 3.4h3.2M16.8 1.8v3.2" />
        </svg>
      );
    case "lodging":
      return (
        <svg {...stroke}>
          <path d="M3.5 9.2V16a1.2 1.2 0 0 0 1.2 1.2h11.6A1.2 1.2 0 0 0 17.5 16V9.2" />
          <path d="M2.8 9.2h14.4l-1.4-3.2a1.4 1.4 0 0 0-1.3-.9H5.5a1.4 1.4 0 0 0-1.3.9l-1.4 3.2Z" />
          <path d="M8 12.2h4" />
        </svg>
      );
    case "preferences-adjustments":
      return (
        <svg {...stroke}>
          <path d="M4 6h12M4 10h12M4 14h7" />
          <circle cx="14" cy="14" r="1.6" />
        </svg>
      );
    case "dates":
      return (
        <svg {...stroke}>
          <rect x="3" y="4.5" width="14" height="12" rx="1.8" />
          <path d="M3 8.5h14M7 3.2v2.6M13 3.2v2.6" />
        </svg>
      );
    case "setup-copilot":
      return (
        <svg {...stroke}>
          <path d="M10 3.5l1.4 3.1 3.1 1.4-3.1 1.4L10 12.5 8.6 9.4 5.5 8l3.1-1.4L10 3.5Z" />
          <path d="M15 13.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5Z" />
        </svg>
      );
    case "flights":
      return (
        <svg {...stroke}>
          <path d="M2.8 11.8 17 6.5l-1.2 2.5-7.4 4.4L7 16.6l-1 .4-.4-2.6-2.6-.4.4-1Z" />
        </svg>
      );
    case "budget":
      return (
        <svg {...stroke}>
          <path d="M4.2 6.2h11.6a1.4 1.4 0 0 1 1.4 1.4v8.4a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2V7.6a1.4 1.4 0 0 1 1.4-1.4Z" />
          <path d="M4.2 9.8h14" />
          <path d="M14.2 6.2V5a1.8 1.8 0 0 0-3.6 0v1.2" />
        </svg>
      );
    case "trip-chat":
      return (
        <svg {...stroke}>
          <path d="M3.5 5.5h11A1.5 1.5 0 0 1 16 7v5.5a1.5 1.5 0 0 1-1.5 1.5h-7L4.5 16.5v-2.5a1.5 1.5 0 0 1-1-1.4V7a1.5 1.5 0 0 1 1.5-1.5Z" />
        </svg>
      );
    case "collab-sidebar":
      return (
        <svg {...stroke}>
          <circle cx="7" cy="7.5" r="2.2" />
          <circle cx="13.6" cy="8.3" r="1.7" />
          <path d="M2.8 15.5c.5-2.1 2.3-3.4 4.2-3.4s3.7 1.3 4.2 3.4" />
          <path d="M12 14c.4-1.3 1.4-2.2 2.7-2.2 1.2 0 2.3.9 2.6 2.2" />
        </svg>
      );
    case "packing":
      return (
        <svg {...stroke}>
          <rect x="3.5" y="6" width="13" height="10.5" rx="1.8" />
          <path d="M7 6V4.5h6V6" />
          <path d="M3.5 11h13" />
        </svg>
      );
    case "invite":
      return (
        <svg {...stroke}>
          <circle cx="8" cy="7.5" r="2.4" />
          <path d="M3 16.5c.5-2.3 2.4-3.8 4.7-3.8s4.2 1.5 4.7 3.8" />
          <path d="M13.5 4.5h3.7M15.4 2.6v3.8" />
        </svg>
      );
    default:
      return (
        <svg {...stroke}>
          <circle cx="10" cy="10" r="3" />
        </svg>
      );
  }
}

export function TripHostSetupDashboard({
  tripId,
  initialPlan,
  seedText = null,
  initialTripStatus,
  initialCollab,
  viewerUserId,
  tripOwnerUserId,
  inviteCode,
  isHost = true,
  destinationCoverUrl = null,
}: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState<TripPlan>(initialPlan);
  const [effectiveTripStatus, setEffectiveTripStatus] = useState<TripPlanStatus>(initialTripStatus);
  const [collabRefreshSignal, setCollabRefreshSignal] = useState(0);
  const suppressRealtimeUntilRef = useRef(0);
  const bumpCollab = useCallback(() => {
    setCollabRefreshSignal((n) => n + 1);
    void router.refresh();
  }, [router]);
  const bumpCollabLive = useCallback(() => {
    setCollabRefreshSignal((n) => n + 1);
  }, []);

  useTripWorkspaceRealtime(
    tripId,
    useCallback(
      (row) => {
        if (row.plan != null) {
          try {
            setPlan(normalizePlan(row.plan));
          } catch {
            /* ignore */
          }
        }
        if (typeof row.status === "string" && row.status.length > 0) {
          setEffectiveTripStatus(parseTripPlanStatus(row.status));
        }
        bumpCollabLive();
      },
      [bumpCollabLive]
    ),
    { enabled: true, suppressRealtimeUntilRef }
  );

  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    setEffectiveTripStatus(initialTripStatus);
  }, [initialTripStatus]);

  const canEditTripWorkspace = effectiveTripStatus !== "finalized";
  /**
   * Narrower gate: only the host can mutate the core itinerary (dates, pins, hotels,
   * budget, flight selections). Guests get a "Suggest a change" fallback that posts
   * to `collab/adjustment-submissions` via `<MyPreferencesCard>` on the Collaborate tab instead.
   */
  const canEditAsHost = isHost && canEditTripWorkspace;

  const [resolvedInviteCode, setResolvedInviteCode] = useState<string | null>(inviteCode);
  useEffect(() => {
    setResolvedInviteCode(inviteCode);
  }, [inviteCode]);

  useEffect(() => {
    if (!isHost) return;
    if (resolvedInviteCode) return;
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/trip-plans/${tripId}/mint-invite`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await r.json().catch(() => ({}))) as {
        inviteCode?: string;
        ok?: boolean;
        alreadyHad?: boolean;
      };
      if (cancelled || !r.ok || !j.inviteCode) return;
      setResolvedInviteCode(j.inviteCode);
      if (!j.alreadyHad) setEffectiveTripStatus("voting");
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [isHost, resolvedInviteCode, tripId, router]);

  const hostSetup = useMemo(() => plan.hostSetup ?? {}, [plan.hostSetup]);
  const [budgetLine, setBudgetLine] = useState(
    () =>
      initialPlan.budget.perPerson?.trim() ||
      initialPlan.budget.tier?.trim() ||
      ""
  );
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);
  const [savingBudgetInline, setSavingBudgetInline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [datePickMode, setDatePickMode] = useState<"range" | "day">(() =>
    hostHasConcreteTripRange(initialPlan) ? "day" : "range"
  );
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [addPlacesOpen, setAddPlacesOpen] = useState(false);
  const openLodgingModal = useCallback(
    (seed?: LodgingModalSeed | null) => {
      setAddPlacesOpen(false);
      const p = new URLSearchParams();
      if (seed?.destination?.trim()) p.set("destination", seed.destination.trim());
      if (seed?.checkIn) p.set("checkIn", seed.checkIn);
      if (seed?.checkOut) p.set("checkOut", seed.checkOut);
      if (seed?.lodgingType) p.set("lodgingType", seed.lodgingType);
      if (seed?.segmentId) p.set("segment", seed.segmentId);
      const q = p.toString();
      router.push(`/trip/${tripId}/setup/lodging${q ? `?${q}` : ""}`);
    },
    [router, tripId]
  );
  const [pinDetail, setPinDetail] = useState<PinDetailState | null>(null);
  const [removePinConfirm, setRemovePinConfirm] = useState<{
    kind: "meal" | "activity";
    dateIso: string;
    mapsUrl?: string;
    bookingUrl?: string;
    title: string;
  } | null>(null);
  const [liveData, setLiveData] = useState<TripLiveRecommendationsPayload | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveFetchErr, setLiveFetchErr] = useState<string | null>(null);
  /** Refit (regenerate itinerary after the host picks new trip dates). */
  const [refittingItinerary, setRefittingItinerary] = useState(false);
  const [refitError, setRefitError] = useState<string | null>(null);
  /** Set after the second tap in range mode; saved only when the host confirms. */
  const [pendingRangeConfirm, setPendingRangeConfirm] = useState<{
    startIso: string;
    endIso: string;
  } | null>(null);

  /** Inferred strictly from planner text with real calendar days — not loose full-month guesses. */
  const parserConcreteRange = useMemo(
    () => concreteTripRangeFromPlanDates(plan, new Date().getFullYear()),
    [plan]
  );

  const livePlanContext = useMemo(() => tripLiveRecommendationsContextFingerprint(plan), [plan]);

  const {
    mutate: flightCurationMutate,
    busyKey: flightCurationBusy,
    err: flightCurationErr,
    setErr: setFlightCurationErr,
  } = useLiveCurationMutation(tripId, setPlan);

  useEffect(() => {
    let cancelled = false;
    setLiveLoading(true);
    setLiveFetchErr(null);
    void (async () => {
      try {
        const r = await fetch(`/api/trip-plans/${tripId}/live-recommendations`, { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as Partial<TripLiveRecommendationsPayload> & { error?: string };
        if (!r.ok) {
          if (!cancelled) {
            setLiveFetchErr(typeof j.error === "string" ? j.error : "Could not load flight suggestions.");
          }
          return;
        }
        if (!cancelled) setLiveData(j as TripLiveRecommendationsPayload);
      } catch {
        if (!cancelled) setLiveFetchErr("Could not reach the server for flight suggestions.");
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, livePlanContext]);

  const showFlightTransport = Boolean(plan.departureCity?.trim()) && Boolean(plan.location?.trim());

  const [calYear, setCalYear] = useState(() => {
    const y0 = new Date().getFullYear();
    const tr =
      initialPlan.hostSetup?.tripRange ?? concreteTripRangeFromPlanDates(initialPlan, y0);
    const startIso = tr?.startIso;
    const base = startIso ? parseLocalIsoDate(startIso) : null;
    if (base) return base.getFullYear();
    const hinted = inferYearMonthFromDateOptionsHints(initialPlan.dates.options, y0);
    if (hinted) return hinted.year;
    return new Date().getFullYear();
  });
  const [calMonth, setCalMonth] = useState(() => {
    const y0 = new Date().getFullYear();
    const tr =
      initialPlan.hostSetup?.tripRange ?? concreteTripRangeFromPlanDates(initialPlan, y0);
    const startIso = tr?.startIso;
    const base = startIso ? parseLocalIsoDate(startIso) : null;
    if (base) return base.getMonth();
    const hinted = inferYearMonthFromDateOptionsHints(initialPlan.dates.options, y0);
    if (hinted) return hinted.month;
    return new Date().getMonth();
  });

  const { peers, peersByCellIso, setFocusedCell } = useTripCalendarPresence(tripId, {
    enabled: true,
    calendarYear: calYear,
    calendarMonth0: calMonth,
  });

  const [workspaceTab, setWorkspaceTab] = useState<TripWorkspaceTabId>("overview");
  const mainColumnRef = useRef<HTMLElement | null>(null);

  const scrollToWorkspaceSection = useCallback((rawId: string) => {
    const id = rawId.startsWith("#") ? rawId.slice(1) : rawId;
    const tab = TRIP_WORKSPACE_SECTION_TO_TAB[id];
    if (tab) setWorkspaceTab(tab);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (h && TRIP_WORKSPACE_SECTION_TO_TAB[h]) {
      setWorkspaceTab(TRIP_WORKSPACE_SECTION_TO_TAB[h]!);
    }
  }, []);

  const onMainHashLinkClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const t = e.target as HTMLElement | null;
      const a = t?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a || !mainColumnRef.current?.contains(a)) return;
      const href = a.getAttribute("href");
      if (!href || href.length < 2) return;
      const id = href.slice(1);
      if (!TRIP_WORKSPACE_SECTION_TO_TAB[id]) return;
      e.preventDefault();
      scrollToWorkspaceSection(id);
    },
    [scrollToWorkspaceSection]
  );

  const scrollToInviteSection = useCallback(() => {
    scrollToWorkspaceSection("sec-invite");
  }, [scrollToWorkspaceSection]);

  /** Saved host range wins; else only highlight days the parser nailed down explicitly. */
  const tripDisplayRange = hostSetup.tripRange ?? parserConcreteRange ?? null;

  const flightTripDayOptions = useMemo(() => {
    if (!tripDisplayRange?.startIso || !tripDisplayRange?.endIso) return [];
    return enumerateLocalIsoDays(tripDisplayRange.startIso, tripDisplayRange.endIso);
  }, [tripDisplayRange?.startIso, tripDisplayRange?.endIso]);

  /** While confirming a new range on the calendar, preview highlight uses this; otherwise saved/plan range. */
  const effectiveHighlightRange = useMemo(
    () => pendingRangeConfirm ?? tripDisplayRange,
    [pendingRangeConfirm, tripDisplayRange]
  );

  const tripDayIsoSet = useMemo(() => {
    const start = effectiveHighlightRange?.startIso;
    const end = effectiveHighlightRange?.endIso;
    if (!start || !end) return null as Set<string> | null;
    return new Set(enumerateLocalIsoDays(start, end));
  }, [effectiveHighlightRange?.startIso, effectiveHighlightRange?.endIso]);

  const suggestedSeededRef = useRef(false);

  type HostSetupPatch = Partial<HostSetupState>;

  const persistHostSetup = useCallback(
    async (
      patch?: HostSetupPatch,
      budgetPatch?: { tier?: string | null; perPerson?: string | null },
      generatedItineraryReplace?: TripPlan["generatedItinerary"]
    ): Promise<boolean> => {
      if (!canEditAsHost) return false;
      setErr(null);
      const body: Record<string, unknown> = {};
      if (patch && Object.keys(patch).length > 0) body.hostSetup = patch;
      if (budgetPatch) body.budget = budgetPatch;
      if (generatedItineraryReplace !== undefined) body.generatedItinerary = generatedItineraryReplace;
      if (!body.hostSetup && !body.budget && body.generatedItinerary === undefined) return false;
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/host-setup`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { plan?: TripPlan; error?: string };
        if (!res.ok) {
          setErr(j.error || "Could not save setup.");
          return false;
        }
        if (j.plan) {
          suppressRealtimeUntilRef.current = Date.now() + 1200;
          setPlan(j.plan);
        }
        return true;
      } catch {
        setErr("Could not save setup.");
        return false;
      }
    },
    [tripId, canEditAsHost]
  );

  /** Keep the calendar month aligned when trip dates appear (parser hydrate, PATCH, first paint). */
  useEffect(() => {
    const start = tripDisplayRange?.startIso;
    if (!start) return;
    const d = parseLocalIsoDate(start);
    if (!d) return;
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  }, [tripDisplayRange?.startIso]);

  /** When there is no ISO range yet, still open on the month/year implied by vague `dates.options`. */
  useEffect(() => {
    if (tripDisplayRange?.startIso) return;
    const y0 = new Date().getFullYear();
    const hinted = inferYearMonthFromDateOptionsHints(plan.dates.options, y0);
    if (!hinted) return;
    setCalYear(hinted.year);
    setCalMonth(hinted.month);
  }, [tripDisplayRange?.startIso, plan.dates.options]);

  useEffect(() => {
    setBudgetLine(plan.budget.perPerson?.trim() || plan.budget.tier?.trim() || "");
  }, [plan.budget.perPerson, plan.budget.tier]);

  const budgetDisplayLine = useMemo(() => {
    const raw = plan.budget.perPerson?.trim() || plan.budget.tier?.trim() || "";
    return raw || "Not set";
  }, [plan.budget.perPerson, plan.budget.tier]);

  /** Legacy drafts: persist **concrete** parser dates once if `hostSetup.tripRange` was never saved. */
  useEffect(() => {
    if (!isHost) return;
    const y0 = new Date().getFullYear();
    const inferred = concreteTripRangeFromPlanDates(initialPlan, y0);
    if (!inferred || initialPlan.hostSetup?.tripRange?.startIso) return;
    void persistHostSetup({ tripRange: inferred });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time hydrate from initial plan only
  }, []);

  /** Seed restaurant pins only when the host's parser message mentioned dining. */
  useEffect(() => {
    if (!isHost) return;
    const persisted = hostSetup.tripRange;
    if (!persisted?.startIso || !persisted.endIso || suggestedSeededRef.current) return;
    const existing = hostSetup.restaurantPins?.length ?? 0;
    if (existing > 0) {
      suggestedSeededRef.current = true;
      return;
    }

    if (!seedTextMentionsDining(seedText)) {
      suggestedSeededRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/trip-plans/${tripId}/live-recommendations`, { credentials: "include" });
      const bundle = await res.json().catch(() => ({}));
      const raw = bundle?.restaurants as import("@/shared/restaurants").RestaurantPick[] | undefined;
      if (!res.ok || cancelled || !raw?.length) return;

      const days = enumerateLocalIsoDays(persisted.startIso, persisted.endIso);
      if (!days.length) return;

      const pins: HostRestaurantPin[] = [];
      for (let i = 0; i < days.length; i++) {
        const pick = raw[i % raw.length]!;
        pins.push({
          dateIso: days[i]!,
          place: restaurantPickToSpotlight(pick),
          kept: true,
        });
      }
      suggestedSeededRef.current = true;
      await persistHostSetup({ restaurantPins: pins });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when persisted range is ready
  }, [hostSetup.tripRange?.startIso, hostSetup.tripRange?.endIso, tripId, seedText]);

  const removeRestaurantPinByKey = useCallback(
    (dateIso: string, mapsUrl: string) => {
      const pins = (hostSetup.restaurantPins ?? []).filter(
        (p) => !(p.dateIso === dateIso && p.place.mapsUrl === mapsUrl)
      );
      void persistHostSetup({ restaurantPins: pins });
    },
    [hostSetup.restaurantPins, persistHostSetup]
  );

  const removeActivityPinByKey = useCallback(
    (dateIso: string, bookingUrl: string) => {
      const pins = (hostSetup.activityPins ?? []).filter(
        (p) => !(p.dateIso === dateIso && p.experience.bookingUrl === bookingUrl)
      );
      void persistHostSetup({ activityPins: pins });
    },
    [hostSetup.activityPins, persistHostSetup]
  );

  const refitItineraryForRange = useCallback(
    async (nextRange: { startIso: string; endIso: string }) => {
      setRefittingItinerary(true);
      setRefitError(null);
      const newDays = new Set(enumerateLocalIsoDays(nextRange.startIso, nextRange.endIso));
      const preservedRestaurantKeys = new Set(
        (hostSetup.restaurantPins ?? [])
          .filter((p) => newDays.has(p.dateIso))
          .map((p) => `${p.dateIso}::${p.place.mapsUrl}`)
      );
      const preservedActivityKeys = new Set(
        (hostSetup.activityPins ?? [])
          .filter((p) => newDays.has(p.dateIso))
          .map((p) => `${p.dateIso}::${p.experience.bookingUrl}`)
      );
      const preservedRestaurantPins = (hostSetup.restaurantPins ?? []).filter((p) =>
        newDays.has(p.dateIso)
      );
      const preservedActivityPins = (hostSetup.activityPins ?? []).filter((p) =>
        newDays.has(p.dateIso)
      );
      try {
        const res = await fetch(`/api/trip-plans/${tripId}/generate-itinerary`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const j = (await res.json().catch(() => ({}))) as {
          plan?: TripPlan;
          error?: string;
        };
        if (!res.ok || !j.plan) {
          setRefitError(j.error || "Couldn't refit the itinerary. Your new dates are saved.");
          return;
        }
        const serverPlan = j.plan;
        const serverHost = serverPlan.hostSetup ?? {};
        const serverRestaurants: HostRestaurantPin[] = serverHost.restaurantPins ?? [];
        const serverActivities: HostActivityPin[] = serverHost.activityPins ?? [];
        const mergedRestaurants: HostRestaurantPin[] = [
          ...preservedRestaurantPins,
          ...serverRestaurants.filter(
            (p) => !preservedRestaurantKeys.has(`${p.dateIso}::${p.place.mapsUrl}`)
          ),
        ];
        const mergedActivities: HostActivityPin[] = [
          ...preservedActivityPins,
          ...serverActivities.filter(
            (p) => !preservedActivityKeys.has(`${p.dateIso}::${p.experience.bookingUrl}`)
          ),
        ];
        const mergedHotelStays = mergeAiHotelStaysPreservingUser(
          hostSetup.hotelStays,
          serverHost.hotelStays ?? []
        );
        const mergedHotel = mergedHotelStays[0]?.place ?? serverHost.hotel ?? null;
        const hadUserLodging = hasUserSelectedLodging(hostSetup.hotelStays);
        const mergedPlan: TripPlan = {
          ...serverPlan,
          hostSetup: {
            ...serverHost,
            hotelStays: mergedHotelStays,
            hotel: mergedHotel,
          },
        };
        setPlan(mergedPlan);
        const hadPreserved =
          preservedRestaurantPins.length > 0 ||
          preservedActivityPins.length > 0 ||
          hadUserLodging;
        if (hadPreserved) {
          await persistHostSetup({
            restaurantPins: mergedRestaurants,
            activityPins: mergedActivities,
            ...(hadUserLodging ? { hotelStays: mergedHotelStays, hotel: mergedHotel } : {}),
          });
        }
      } catch {
        setRefitError("Couldn't refit the itinerary. Your new dates are saved.");
      } finally {
        setRefittingItinerary(false);
      }
    },
    [tripId, hostSetup.restaurantPins, hostSetup.activityPins, hostSetup.hotelStays, persistHostSetup]
  );

  const confirmPendingTripRange = useCallback(async () => {
    if (!pendingRangeConfirm) return;
    setErr(null);
    setRefitError(null);
    suggestedSeededRef.current = false;
    setSelectedDayIso(null);

    /** Preserve pins / stays whose dates still fall inside the new range; drop the rest. */
    const newDays = new Set(enumerateLocalIsoDays(pendingRangeConfirm.startIso, pendingRangeConfirm.endIso));
    const preservedRestaurantPins = (hostSetup.restaurantPins ?? []).filter((p) =>
      newDays.has(p.dateIso)
    );
    const preservedActivityPins = (hostSetup.activityPins ?? []).filter((p) =>
      newDays.has(p.dateIso)
    );
    const preservedHotelStays: HostHotelStay[] = (hostSetup.hotelStays ?? [])
      .map((stay) => {
        const stayDays = enumerateLocalIsoDays(stay.startIso, stay.endIso).filter((d) =>
          newDays.has(d)
        );
        if (stayDays.length === 0) return null;
        return { ...stay, startIso: stayDays[0]!, endIso: stayDays[stayDays.length - 1]! };
      })
      .filter((s): s is HostHotelStay => s !== null);
    const preservedHotelPlace = preservedHotelStays[0]?.place ?? null;

    const ok = await persistHostSetup({
      hotel: preservedHotelPlace,
      hotelStays: preservedHotelStays,
      experiencesOutlined: hostSetup.experiencesOutlined,
      tripRange: pendingRangeConfirm,
      restaurantPins: preservedRestaurantPins,
      activityPins: preservedActivityPins,
    });
    if (!ok) return;

      setPendingRangeConfirm(null);
      setDatePickMode("day");
    void refitItineraryForRange(pendingRangeConfirm);
  }, [
    pendingRangeConfirm,
    hostSetup.experiencesOutlined,
    hostSetup.restaurantPins,
    hostSetup.activityPins,
    hostSetup.hotelStays,
    persistHostSetup,
    refitItineraryForRange,
  ]);

  const cancelPendingTripRange = useCallback(() => {
    setPendingRangeConfirm(null);
    setRangeAnchor(null);
  }, []);

  useEffect(() => {
    if (!pendingRangeConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelPendingTripRange();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingRangeConfirm, cancelPendingTripRange]);

  const onCalendarDayClick = useCallback(
    (dom: number) => {
      if (!canEditAsHost) return;
      const iso = isoFromCell(calYear, calMonth, dom);

      if (datePickMode === "range") {
        if (!rangeAnchor) {
          setRangeAnchor(iso);
          return;
        }

        let start = parseLocalIsoDate(rangeAnchor)!;
        let end = parseLocalIsoDate(iso)!;
        if (start.getTime() > end.getTime()) [start, end] = [end, start];
        setRangeAnchor(null);
        setPendingRangeConfirm({
          startIso: formatLocalIsoDate(start),
          endIso: formatLocalIsoDate(end),
        });
        return;
      }

      if (!tripDayIsoSet?.has(iso)) return;
      setSelectedDayIso(iso);
      router.push(`/trip/${tripId}/setup/day?date=${encodeURIComponent(iso)}`);
    },
    [canEditAsHost, calYear, calMonth, rangeAnchor, datePickMode, tripDayIsoSet, router, tripId]
  );

  const addRestaurantToDay = useCallback(
    (pick: RestaurantPick) => {
      if (!selectedDayIso) return;
      const place = restaurantPickToSpotlight(pick);
      const pins = [...(hostSetup.restaurantPins ?? [])];
      if (pins.some((p) => p.dateIso === selectedDayIso && p.place.mapsUrl === place.mapsUrl)) return;
      pins.push({ dateIso: selectedDayIso, place, kept: true });
      void persistHostSetup({ restaurantPins: pins });
    },
    [hostSetup.restaurantPins, persistHostSetup, selectedDayIso]
  );

  const addExperienceToDay = useCallback(
    (card: LiveExperienceCard) => {
      if (!selectedDayIso) return;
      const experience: HostActivityExperience = {
        name: card.name,
        pricePerPerson: card.pricePerPerson,
        rating: card.rating,
        duration: card.duration,
        bookingUrl: card.bookingUrl,
        coverPhotoUrl: card.coverPhotoUrl ?? null,
      };
      const pins = [...(hostSetup.activityPins ?? [])];
      if (pins.some((p) => p.dateIso === selectedDayIso && p.experience.bookingUrl === experience.bookingUrl)) return;
      pins.push({ dateIso: selectedDayIso, experience, kept: true });
      void persistHostSetup({ activityPins: pins });
    },
    [hostSetup.activityPins, persistHostSetup, selectedDayIso]
  );

  const onCopilotResult = useCallback((nextPlan: TripPlan, ui: HostCopilotUiHint, applied: boolean) => {
    if (applied) {
      setPlan(nextPlan);
      setPendingRangeConfirm(null);
      setRangeAnchor(null);
    }
    if (ui.suggestDatePickMode) {
      setDatePickMode(ui.suggestDatePickMode);
    } else if (applied && nextPlan.hostSetup?.tripRange?.startIso) {
      setDatePickMode("day");
    }
    if (ui.focusTripStartMonth && nextPlan.hostSetup?.tripRange?.startIso) {
      const d = parseLocalIsoDate(nextPlan.hostSetup.tripRange.startIso);
      if (d) {
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
      }
    }
    if (ui.scrollTo) {
      scrollToWorkspaceSection(`sec-${ui.scrollTo}`);
    }
  }, [scrollToWorkspaceSection]);

  const cells = useMemo(() => calendarCellsSundayFirst(calYear, calMonth), [calYear, calMonth]);
  const weeks = useMemo(() => chunkWeeks(cells), [cells]);

  const isCalendarToday = useCallback(
    (dom: number): boolean => {
      const now = new Date();
      return (
        dom === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear()
      );
    },
    [calYear, calMonth]
  );

  /**
   * Calendar view modes:
   *  - "expanded": full Sunday-first month grid (the owner is in range-pick mode,
   *    or the trip has no concrete dates yet) — so days outside the saved range can be tapped.
   *  - "compact": only the weeks that overlap the saved trip range, AND within those weeks
   *    only the trip days render content — surrounding cells collapse to empty placeholders.
   */
  const calendarMode: "expanded" | "compact" =
    datePickMode === "range" || !hostHasConcreteTripRange(plan) ? "expanded" : "compact";

  const displayWeeks = useMemo(() => {
    if (calendarMode === "expanded") return weeks;
    const start = tripDisplayRange?.startIso;
    const end = tripDisplayRange?.endIso;
    if (!start || !end) return weeks;
    const tripDays = new Set(enumerateLocalIsoDays(start, end));
    const filtered = weeks
      .filter((weekRow) =>
        weekRow.some((dom) => {
          if (dom == null) return false;
          return tripDays.has(isoFromCell(calYear, calMonth, dom));
        })
      )
      .map((weekRow) =>
        weekRow.map((dom) => {
          if (dom == null) return null;
          return tripDays.has(isoFromCell(calYear, calMonth, dom)) ? dom : null;
        })
      );
    return filtered.length > 0 ? filtered : weeks;
  }, [calendarMode, weeks, tripDisplayRange?.startIso, tripDisplayRange?.endIso, calYear, calMonth]);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDayIso) return "";
    const d = parseLocalIsoDate(selectedDayIso);
    return d
      ? d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : selectedDayIso;
  }, [selectedDayIso]);

  const chatSeed = initialCollab.cardChat?.messages ?? [];

  const sortedHotelStays = useMemo(() => {
    const stays = plan.hostSetup?.hotelStays ?? [];
    return [...stays].sort((a, b) => a.startIso.localeCompare(b.startIso));
  }, [plan.hostSetup?.hotelStays]);

  const homeBaseHero = useMemo(
    () => homeBaseHeroImageSources(plan, destinationCoverUrl),
    [plan, destinationCoverUrl]
  );

  const primaryHotelSummary = useMemo(() => {
    const stays = sortedHotelStays;
    if (stays.length > 0) {
      const p = stays[0]?.place;
      if (p?.name) {
        return {
          title: p.name,
          detail: p.address?.trim() || plan.location?.trim() || "Lodging on your calendar",
        };
      }
    }
    const loc = plan.location?.trim();
    if (loc) {
      return { title: loc, detail: "Add stays on a calendar day or with Trip Copilot." };
    }
    return null;
  }, [sortedHotelStays, plan.location]);

  const tripDisplayName = (plan.title?.trim() || plan.location?.trim() || "Trip");
  const tripIdentityInitial = (tripDisplayName.match(/\p{L}/u)?.[0] ?? "T").toUpperCase();
  const tripIdentityDateLabel = useMemo(() => {
    if (tripDisplayRange?.startIso && tripDisplayRange.endIso) {
      return formatTripRangeLabel(tripDisplayRange.startIso, tripDisplayRange.endIso);
    }
    const first = plan.dates.options.find((o) => o && o.trim());
    return first ?? "Dates TBD";
  }, [tripDisplayRange?.startIso, tripDisplayRange?.endIso, plan.dates.options]);

  return (
    <>
    <SiteShell tripTypography contentWide>
      <div className="mx-auto w-full pb-24 lg:pb-12">
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[260px_minmax(0,1fr)] xl:gap-9">
        {/* LEFT RAIL — flat identity + icon nav + invite-friends CTA */}
        <aside className="lg:row-start-1 lg:self-start lg:sticky lg:top-28">
          <div className="flex h-full flex-col gap-6">
            <div className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-3">
              <div
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--sage-soft)] to-[color:var(--surface-container-high)] text-xl font-display font-semibold text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] dark:from-[#3a3a3a] dark:to-[#222] dark:text-[#ebe9e4]"
              >
                {tripIdentityInitial}
          </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-semibold leading-[1.05] tracking-[-0.02em] text-[color:var(--on-surface)] dark:text-[#ebe9e4] lg:whitespace-normal">
                  {tripDisplayName}
                </h1>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)] dark:text-[#9c9a96]">
                  {tripIdentityDateLabel}
                </p>
        </div>
            </div>

            <nav
              aria-label="Trip workspace sections"
              className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
            >
              {LEFT_RAIL_TABS.filter((tab) => tab.id !== "budget" || canEditAsHost).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={workspaceTab === tab.id ? "page" : undefined}
                  onClick={() => setWorkspaceTab(tab.id)}
                  className={[
                    "group flex shrink-0 items-center gap-3 rounded-full px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.14em] transition lg:w-full",
                    workspaceTab === tab.id
                      ? "bg-[color:var(--surface-container-low)] text-[color:var(--on-surface)] dark:bg-white/10 dark:text-[#ebe9e4]"
                      : "text-[color:var(--on-surface-variant)] hover:bg-[color:var(--surface-container-low)]/80 hover:text-[color:var(--on-surface)] dark:text-[color:var(--on-surface-muted)] dark:hover:bg-white/5 dark:hover:text-[color:var(--on-surface)]",
                  ].join(" ")}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--on-surface-muted)] transition group-hover:text-[color:var(--on-surface)] dark:text-[color:var(--on-surface-muted)]">
                    <NavIcon id={tab.navIconId} />
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>

            <button
              type="button"
              onClick={scrollToInviteSection}
              className="hidden w-full items-center justify-center gap-2 rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-elevated dark:text-[#ebe9e4] dark:hover:bg-dm-page lg:mt-auto lg:inline-flex"
            >
              <NavIcon id="invite" />
              Invite friends
            </button>
      </div>
        </aside>

        {/* CENTER COLUMN */}
        <main
          ref={mainColumnRef}
          onClick={onMainHashLinkClick}
          className="min-w-0 space-y-8 lg:col-start-2 lg:row-start-1"
        >
          <section
            className="scroll-mt-28 border-b border-[color:var(--hairline)] pb-6 dark:border-white/10"
            aria-label="Join this trip"
          >
            <div id="sec-invite" className="min-w-0 scroll-mt-28">
              <span className="label-caps mb-2 block text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                Join code
              </span>
              {resolvedInviteCode ? (
                <InviteCodeRow rawCode={resolvedInviteCode} prominent />
              ) : (
                <p className="font-display text-[1.5rem] font-semibold tracking-[0.18em] text-[color:var(--on-surface-muted)] dark:text-neutral-600">
                  ······
                </p>
              )}
    </div>
          </section>

          {workspaceTab === "fund" ? (
          <div id="sec-fund" className="scroll-mt-28 space-y-5">
            <section className="flex flex-col gap-6 border-b border-[color:var(--hairline)] pb-6 dark:border-white/10 sm:flex-row sm:flex-wrap sm:items-end sm:gap-8">
              <TripDepositTracker tripId={tripId} variant="flat" />
              <div className="ml-auto flex items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center -space-x-2" aria-label="People on this calendar now">
                    {peers.length === 0 ? (
                      <span
                        className="relative z-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-high)] text-sm font-display font-semibold text-[color:var(--on-surface)] ring-2 ring-[color:var(--surface)] dark:border-white/15 dark:bg-[#2a2a2a] dark:text-[#ebe9e4] dark:ring-dm-page"
                        title="No one else on the calendar right now"
                      >
                        {tripIdentityInitial}
                      </span>
                    ) : (
                      peers.slice(0, 5).map((p) => (
                        <span
                          key={p.userId}
                          title={`${p.name} · here now`}
                          className="relative z-[1] inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--hairline)] text-[11px] font-semibold text-white ring-2 ring-[color:var(--surface)] dark:border-white/15 dark:ring-dm-page"
                          style={
                            p.avatarUrl ? undefined : { backgroundColor: p.color, borderColor: "transparent" }
                          }
                        >
                          {p.avatarUrl ? (
                            <Image
                              src={p.avatarUrl}
                              alt=""
                              width={36}
                              height={36}
                              className="h-full w-full object-cover"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            p.name.slice(0, 1).toUpperCase()
                          )}
                        </span>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={scrollToInviteSection}
                      className="relative z-[2] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] text-sm font-semibold text-[color:var(--on-surface)] ring-2 ring-[color:var(--surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/25 dark:bg-dm-page dark:text-[#ebe9e4] dark:ring-dm-page"
                      aria-label="Invite people — jump to join code"
                    >
                      +
                    </button>
        </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="label-caps text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                      {isHost ? "Trip owner" : "Trip member"}
                    </span>
                    <Link
                      href="/settings"
                      className="text-sm font-medium text-[color:var(--on-surface-muted)] underline-offset-2 hover:text-[color:var(--on-surface)] hover:underline dark:text-neutral-500 dark:hover:text-[#ebe9e4]"
                    >
                      Manage Settings
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* Secondary fund actions + collapsible trip details */}
            <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <TripContributeButton tripId={tripId} />
            </div>
            <details className="group min-w-0 flex-1 sm:flex-none">
              <summary className="label-caps cursor-pointer list-none rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-4 py-2 text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-[color:var(--surface-container-low)] dark:text-neutral-400 [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  Trip details
                  <ChevRight className="h-3 w-3 transition group-open:rotate-90" />
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                {isHost ? (
                  resolvedInviteCode ? (
                    <div className="rounded-2xl border border-amber-300/50 bg-amber-50/90 px-4 py-3 shadow-sm dark:border-amber-700/35 dark:bg-amber-950/25 dark:shadow-none">
                      <h3 className="font-display text-sm font-semibold text-amber-950 dark:text-amber-100">Trip owner controls</h3>
                      <p className="mt-1.5 text-xs text-amber-950/90 dark:text-amber-100/90">
                        You can override group suggestions anytime.
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-amber-950 dark:text-amber-50/95">
                        <li>
                          Use{" "}
                          <a href="#trip-card-chat" className="font-semibold underline underline-offset-2">
                            Trip chat
                          </a>{" "}
                          to change dates, budget, or destination.
                        </li>
                        <li>
                          Under{" "}
                          <a href="#sec-flights" className="font-semibold underline underline-offset-2">
                            Flights
                          </a>
                          , keep or dismiss itineraries.
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 text-sm leading-relaxed text-[color:var(--on-surface-variant)]">
                      <p>
                        Invite code loads from your trip — refresh the page if you just created this trip. Guests use{" "}
          <Link
                          href={JOIN_WITH_CODE_URL}
                          className="font-medium text-[color:var(--sage-soft)] underline-offset-2 hover:underline"
          >
                          Join a Trip
          </Link>
                        . Full share text is under <span className="text-[color:var(--on-surface)]">Share trip</span> in the trip card
                        below.
                      </p>
        </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 text-sm leading-relaxed text-[color:var(--on-surface-variant)]">
                    <p>
                      You&apos;re on this trip as a guest.{" "}
                      {canEditTripWorkspace ? (
                        <>
                          Hosts can edit the itinerary, dates, pins, flights, and budget. Guests can add preferences, vote, and suggest changes for the host to apply. Use{" "}
                          <span className="text-[color:var(--on-surface)]">Group progress</span> for polls and availability.
                        </>
                      ) : (
                        <>This trip is finalized — viewing shared plans and checklist.</>
                      )}
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="label-caps text-[color:var(--on-surface-muted)]">Trip budget</span>
                    <span className="rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container)] px-2.5 py-1 text-xs font-semibold text-[color:var(--on-surface)]">
                      {budgetDisplayLine}
                    </span>
                    {canEditAsHost ? (
                      <button
                        type="button"
                        onClick={() => setShowBudgetEditor((v) => !v)}
                        className="rounded-full border border-[color:var(--hairline-strong)] px-2.5 py-1 text-xs font-medium text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container)]"
                      >
                        {showBudgetEditor ? "Cancel" : "Change budget"}
                      </button>
                    ) : null}
                  </div>
                  {canEditAsHost && showBudgetEditor ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input
                        value={budgetLine}
                        onChange={(e) => setBudgetLine(e.target.value)}
                        placeholder="e.g. ~$1,200 per person"
                        className="w-full rounded-xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container)] px-3 py-2 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-neutral-500 focus:border-[color:var(--sage)]/55"
                      />
                      <button
                        type="button"
                        disabled={savingBudgetInline}
                        onClick={() => {
                          setSavingBudgetInline(true);
                          void persistHostSetup(undefined, { tier: null, perPerson: budgetLine.trim() || null }).then((ok) => {
                            if (ok) setShowBudgetEditor(false);
                            setSavingBudgetInline(false);
                          });
                        }}
                        className="shrink-0 rounded-xl border border-zinc-500/35 bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:border-zinc-500/40 dark:bg-zinc-600 dark:hover:bg-zinc-500"
                      >
                        {savingBudgetInline ? "Saving..." : "Save budget"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </details>
          </div>
          </div>
          ) : null}

          {workspaceTab === "overview" ? (
          <>
        <section id="sec-dates" className="scroll-mt-28">
          <div className="mb-5 flex flex-col gap-3">
            <div className="min-w-0">
              <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--on-surface-variant)]">
                {!canEditTripWorkspace
                  ? "This trip is finalized here — the calendar is for reference. Open the booking checklist for next steps."
                  : datePickMode === "range"
                  ? tripDisplayRange?.startIso && tripDisplayRange.endIso
                    ? `Change dates: tap two days (currently ${tripDisplayRange.startIso} → ${tripDisplayRange.endIso}). Confirming new dates clears meal and activity pins for the old range.`
                    : "Tap two days to set your trip; days in range are highlighted below."
                  : tripDisplayRange?.startIso && tripDisplayRange.endIso
                      ? `${tripDisplayRange.startIso} → ${tripDisplayRange.endIso} — tap any trip day for the day editor (meals, activities). Manage lodging under Lodging in the left nav or tap a lodging row below. Use Add places for shortcuts. Everyone on the trip sees updates live.`
                    : "Tap two days to set your trip."}
              </p>
              {rangeAnchor && datePickMode === "range" && !pendingRangeConfirm ? (
                <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">Select end date…</p>
              ) : null}
              {pendingRangeConfirm && datePickMode === "range" ? (
                <p className="mt-2 text-xs font-medium text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
                  Confirm your trip dates in the dialog below.
                </p>
              ) : null}
              {refittingItinerary ? (
                <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]" role="status">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--sage)]" aria-hidden />
                  Refitting itinerary for your new dates…
                </p>
              ) : null}
              {!refittingItinerary && refitError ? (
                <p
                  className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300"
                  role="alert"
                >
                  <span>{refitError}</span>
                  {tripDisplayRange?.startIso && tripDisplayRange.endIso ? (
                  <button
                    type="button"
                      onClick={() =>
                        void refitItineraryForRange({
                          startIso: tripDisplayRange.startIso!,
                          endIso: tripDisplayRange.endIso!,
                        })
                      }
                      className="rounded-full border border-amber-400/60 px-2 py-0.5 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100/60 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-900/30"
                    >
                      Retry refit
                  </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setRefitError(null)}
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[color:var(--on-surface-muted)] transition hover:bg-[color:var(--surface-container-low)] dark:hover:bg-white/10"
                  >
                    Dismiss
                  </button>
                </p>
                ) : null}
              </div>
          </div>

          <TripCostRollup tripId={tripId} plan={plan} flights={liveData?.flights ?? []} />

          <div className="w-full text-[color:var(--on-surface)] dark:text-[color:var(--on-surface)]">
            {/* Header — flat editorial: month title + chevrons */}
            <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
              <h3 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-[color:var(--on-surface)] dark:text-[color:var(--on-surface)] sm:text-[2rem]">
                {new Date(calYear, calMonth, 1).toLocaleString("default", { month: "long", year: "numeric" })}
              </h3>
              <div className="flex items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCalMonth((m) => {
                      if (m <= 0) {
                        setCalYear((y) => y - 1);
                        return 11;
                      }
                      return m - 1;
                    })
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] dark:text-[color:var(--on-surface-variant)] dark:hover:bg-white/10"
                >
                  <ChevLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCalMonth((m) => {
                      if (m >= 11) {
                        setCalYear((y) => y + 1);
                        return 0;
                      }
                      return m + 1;
                    })
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] dark:text-[color:var(--on-surface-variant)] dark:hover:bg-white/10"
                >
                  <ChevRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Secondary calendar toolbar — actions + peers, kept accessible but visually minimal */}
            {(canEditTripWorkspace && hostHasConcreteTripRange(plan)) || peers.length > 0 ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[color:var(--hairline)] pb-4 dark:border-white/10">
                {canEditAsHost && hostHasConcreteTripRange(plan) && datePickMode === "day" ? (
                <button
                  type="button"
                    onClick={() => router.push(`/trip/${tripId}/setup/lodging`)}
                    className="shrink-0 rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-1 text-[11px] font-semibold text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]"
                >
                    Add lodging
                </button>
                ) : null}
                {canEditAsHost && hostHasConcreteTripRange(plan) && datePickMode === "day" && hostSetup.tripRange?.startIso ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDayIso(hostSetup.tripRange!.startIso);
                      setAddPlacesOpen(true);
                    }}
                    className="shrink-0 rounded-full bg-[#1c1c17] px-3 py-1 text-[11px] font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-dm-page dark:hover:bg-white"
                  >
                    Add places
                  </button>
                ) : null}
                {canEditAsHost && hostHasConcreteTripRange(plan) && datePickMode === "day" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDatePickMode("range");
                      setRangeAnchor(null);
                      setSelectedDayIso(null);
                      setAddPlacesOpen(false);
                      setPendingRangeConfirm(null);
                    }}
                    className="shrink-0 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-3 py-1 text-[11px] font-medium text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-dm-elevated dark:text-[color:var(--on-surface)] dark:hover:bg-dm-page"
                  >
                    Change dates
                  </button>
                ) : null}
                {canEditAsHost && hostHasConcreteTripRange(plan) && datePickMode === "range" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDatePickMode("day");
                      setRangeAnchor(null);
                      setPendingRangeConfirm(null);
                    }}
                    className="shrink-0 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-3 py-1 text-[11px] font-medium text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-dm-elevated dark:text-[color:var(--on-surface)] dark:hover:bg-dm-page"
                  >
                    Cancel
                  </button>
                ) : null}
                {peers.length > 0 ? (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
                      Here now
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {peers.map((p) => (
                        <span
                          key={p.userId}
                          title={`${p.name} · on this calendar`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] py-0.5 pl-0.5 pr-2 text-xs text-[color:var(--on-surface)] dark:border-white/10 dark:bg-dm-elevated dark:text-[color:var(--on-surface)]"
                        >
                          <span
                            className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--hairline)] text-[10px] font-semibold text-white dark:border-white/15"
                            style={
                              p.avatarUrl
                                ? undefined
                                : { backgroundColor: p.color, borderColor: "transparent" }
                            }
                          >
                            {p.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- remote avatar URLs from OAuth metadata
                              <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              p.name.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <span className="max-w-[8rem] truncate font-medium">{p.name}</span>
                        </span>
                      ))}
              </div>
            </div>
                ) : null}
              </div>
            ) : null}

            <TripCalendarLegend range={effectiveHighlightRange} />

            {/* Weekday stripe */}
            <div className="grid grid-cols-7 border-b border-[color:var(--hairline)] dark:border-white/10">
              {WEEKDAY_SUN_FIRST.map((w) => (
                <div
                  key={w}
                  className="border-l border-transparent py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-muted)] first:border-l-0 dark:text-[color:var(--on-surface-muted)] sm:py-3 sm:text-[11px] sm:tracking-[0.15em] md:text-xs md:tracking-[0.16em]"
                >
                  {w}
                </div>
              ))}
            </div>

            <div>
              {displayWeeks.map((weekRow, wi) => (
                <div key={`wk-${wi}`} className="grid grid-cols-7">
                  {weekRow.map((dom, ci) => {
                    if (dom == null) {
                      return (
                        <div
                          key={`e-${wi}-${ci}`}
                          className={[
                            "min-h-[7.5rem] border-b border-[color:var(--hairline)] bg-transparent dark:border-white/10 sm:min-h-[8.75rem] lg:min-h-[10rem]",
                            ci < 6 ? "border-r border-[color:var(--hairline)] dark:border-white/10" : "",
                          ].join(" ")}
                        />
                      );
                    }
                    const cellIso = isoFromCell(calYear, calMonth, dom);
                    const tripDayRole = tripCalendarDayRole(cellIso, effectiveHighlightRange);
                    const dayLabel = formatPinDayLabel(cellIso);
                    const hotelCalendarRows = hotelStayRowsForCalendarDay(hostSetup.hotelStays, cellIso);
                    const mealPinsForCell = (hostSetup.restaurantPins ?? []).filter(
                      (p) => p.dateIso === cellIso && p.kept
                    );
                    const activityPinsForCell = (hostSetup.activityPins ?? []).filter(
                      (p) => p.dateIso === cellIso && p.kept
                    );
                    const calendarCellEntries: ReactNode[] = [];
                    const pinEmphasis =
                      isCalendarToday(dom) || (datePickMode === "day" && selectedDayIso === cellIso);
                    let pinOrdinal = 0;
                    const takePinEmphasis = () => {
                      const e = pinEmphasis && pinOrdinal === 0;
                      pinOrdinal += 1;
                      return e;
                    };
                    for (const { stay: hotelForDay, edge } of hotelCalendarRows) {
                      const pem = takePinEmphasis();
                      const onPin = pem ? "text-[color:var(--surface)] dark:text-dm-page" : "text-[color:var(--on-surface)] dark:text-[color:var(--on-surface)]";
                      const metaPin = pem
                        ? "text-[color:var(--surface)]/75 dark:text-dm-page/80"
                        : "text-[color:var(--on-surface-muted)] dark:text-neutral-500";
                      const lodgingPinBody = (
                        <div className={["flex items-start gap-1.5 text-left leading-snug", onPin].join(" ")}>
                                <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">
                            {hostCalendarHotelDisplayTitle(hotelForDay.place.name ?? "", edge)}
                            {hotelForDay.recommendedByConci ? (
                              <span className={["ml-1 block text-[9px] font-medium uppercase tracking-wide", metaPin].join(" ")}>
                                recommended by CONCI
                                </span>
                            ) : null}
                          </span>
                          <span className={["shrink-0 text-[9px] uppercase tracking-wide sm:text-[10px]", metaPin].join(" ")}>
                            {HOST_CALENDAR_HOTEL_EDGE_LABEL[edge]}
                                </span>
                              </div>
                      );
                      const lodgingPinKey = `stay-${hotelForDay.startIso}-${hotelForDay.endIso}-${edge}-${hotelForDay.place.mapsUrl}`;
                      calendarCellEntries.push(
                        canEditAsHost ? (
                          <button
                            key={lodgingPinKey}
                            type="button"
                            title="Change lodging for this stay"
                            onClick={(e: MouseEvent) => {
                              e.stopPropagation();
                              openLodgingModal({
                                checkIn: hotelForDay.startIso,
                                checkOut: hotelForDay.endIso,
                                destination: hotelForDay.destinationCity?.trim() || undefined,
                                lodgingType: hotelForDay.lodgingType ?? "hotel",
                              });
                            }}
                            className={["min-w-0 w-full cursor-pointer text-left", calendarPinShellClass(pem)].join(" ")}
                          >
                            {lodgingPinBody}
                          </button>
                        ) : (
                          <div key={lodgingPinKey} className={["min-w-0 w-full", calendarPinShellClass(pem)].join(" ")}>
                            {lodgingPinBody}
                          </div>
                        )
                      );
                    }
                    for (const p of mealPinsForCell) {
                      const pem = takePinEmphasis();
                      const onPin = pem ? "text-[color:var(--surface)] dark:text-dm-page" : "text-[color:var(--on-surface)] dark:text-[color:var(--on-surface)]";
                      const metaPin = pem
                        ? "text-[color:var(--surface)]/75 dark:text-dm-page/80"
                        : "text-[color:var(--on-surface-muted)] dark:text-neutral-500";
                      calendarCellEntries.push(
                        <div key={p.place.mapsUrl} className="group/pin relative min-w-0 w-full pr-5">
                          <button
                            type="button"
                            className={[
                              "w-full text-left",
                              calendarPinShellClass(pem),
                            ].join(" ")}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setPinDetail({ kind: "meal", place: p.place, dateLabel: dayLabel });
                            }}
                          >
                            <div className={["flex items-start gap-1.5 leading-snug", onPin].join(" ")}>
                              <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">
                                {p.place.name}
                                {p.recommendedByConci ? (
                                  <span className={["ml-1 block text-[9px] font-medium uppercase tracking-wide", metaPin].join(" ")}>
                                    recommended by CONCI
                                  </span>
                                ) : null}
                              </span>
                              <span className={["shrink-0 text-[9px] uppercase tracking-wide sm:text-[10px]", metaPin].join(" ")}>
                                Meal
                              </span>
                            </div>
                          </button>
                          {canEditAsHost ? (
                            <button
                              type="button"
                              aria-label={`Remove ${p.place.name}`}
                              className="absolute right-0 top-0 rounded p-0.5 text-[13px] leading-none text-[color:var(--on-surface-muted)] opacity-50 transition hover:bg-rose-500/15 hover:text-rose-600 md:opacity-0 md:group-hover/pin:opacity-100"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setRemovePinConfirm({
                                  kind: "meal",
                                  dateIso: p.dateIso,
                                  mapsUrl: p.place.mapsUrl,
                                  title: `"${p.place.name}" on ${dayLabel}`,
                                });
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      );
                    }
                    for (const p of activityPinsForCell) {
                      const pem = takePinEmphasis();
                      const onPin = pem ? "text-[color:var(--surface)] dark:text-dm-page" : "text-[color:var(--on-surface)] dark:text-[color:var(--on-surface)]";
                      const metaPin = pem
                        ? "text-[color:var(--surface)]/75 dark:text-dm-page/80"
                        : "text-[color:var(--on-surface-muted)] dark:text-neutral-500";
                      // Flight activity pins are written by save-selection as
                      // `Flight out · ${airline}` / `Flight back · ${airline}`.
                      // Surface those as Arrival / Departure chips so the calendar
                      // reads as travel days, not generic activities.
                      const expName = p.experience.name ?? "";
                      const isOutboundFlight = expName.startsWith("Flight out · ");
                      const isReturnFlight = expName.startsWith("Flight back · ");
                      const pinEyebrow = isOutboundFlight
                        ? "Arrival"
                        : isReturnFlight
                          ? "Departure"
                          : "Activity";
                      calendarCellEntries.push(
                        <div key={p.experience.bookingUrl} className="group/pin relative min-w-0 w-full pr-5">
                          <button
                            type="button"
                            className={[
                              "w-full text-left",
                              calendarPinShellClass(pem),
                            ].join(" ")}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setPinDetail({
                                kind: "activity",
                                experience: p.experience,
                                dateLabel: dayLabel,
                              });
                            }}
                          >
                            <div className={["flex items-start gap-1.5 leading-snug", onPin].join(" ")}>
                              <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">
                                {p.experience.name}
                                {p.recommendedByConci ? (
                                  <span className={["ml-1 block text-[9px] font-medium uppercase tracking-wide", metaPin].join(" ")}>
                                    recommended by CONCI
                                  </span>
                                ) : null}
                              </span>
                              <span className={["shrink-0 text-[9px] uppercase tracking-wide sm:text-[10px]", metaPin].join(" ")}>
                                {pinEyebrow}
                              </span>
                            </div>
                          </button>
                          {canEditAsHost ? (
                            <button
                              type="button"
                              aria-label={`Remove ${p.experience.name}`}
                              className="absolute right-0 top-0 rounded p-0.5 text-[13px] leading-none text-[color:var(--on-surface-muted)] opacity-50 transition hover:bg-rose-500/15 hover:text-rose-600 md:opacity-0 md:group-hover/pin:opacity-100"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setRemovePinConfirm({
                                  kind: "activity",
                                  dateIso: p.dateIso,
                                  bookingUrl: p.experience.bookingUrl,
                                  title: `"${p.experience.name}" on ${dayLabel}`,
                                });
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      );
                    }

                    const visibleCalendarEntries = calendarCellEntries.slice(0, CALENDAR_CELL_MAX_VISIBLE_ITEMS);
                    const calendarMoreCount = Math.max(0, calendarCellEntries.length - CALENDAR_CELL_MAX_VISIBLE_ITEMS);
                    const showDayEditOverlay =
                      canEditAsHost && datePickMode === "day" && Boolean(tripDayIsoSet?.has(cellIso));

                    return (
                          <div
                        key={`d-${calYear}-${calMonth}-${dom}-${wi}-${ci}`}
                        tabIndex={0}
                            role="presentation"
                        onClick={() => onCalendarDayClick(dom)}
                        onMouseEnter={() => setFocusedCell(cellIso)}
                        onMouseLeave={() => setFocusedCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCalendarDayClick(dom);
                          }
                        }}
                        className={[
                          "group/cell relative flex h-full min-h-[7.5rem] flex-col border-b border-[color:var(--hairline)] px-2.5 py-2.5 text-left align-top transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/50 sm:min-h-[8.75rem] sm:px-3 sm:py-3 lg:min-h-[10rem] lg:px-4 lg:py-4 dark:border-white/10",
                          canEditAsHost ? "cursor-pointer" : "cursor-default",
                          ci < 6 ? "border-r border-[color:var(--hairline)] dark:border-white/10" : "",
                          tripDayRole
                            ? tripCalendarCellSurfaceClass(tripDayRole)
                            : "bg-transparent hover:bg-[color:var(--surface-container-low)]/35 dark:hover:bg-white/[0.03]",
                          parseLocalIsoDate(cellIso)?.getTime() === parseLocalIsoDate(rangeAnchor ?? "")?.getTime()
                            ? "!ring-2 !ring-amber-400 ring-inset dark:!ring-amber-400/70"
                            : "",
                          datePickMode === "day" && selectedDayIso === cellIso
                            ? "!ring-2 !ring-[color:var(--sage)] ring-inset shadow-sm dark:!ring-[color:var(--sage-soft)]"
                            : "",
                        ].join(" ")}
                      >
                        <div className="mb-1.5 flex shrink-0 flex-col gap-1">
                          <div className="flex items-start justify-between gap-2">
                            {isCalendarToday(dom) ? (
                              <span className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-[#1c1c17] text-xs font-semibold text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] sm:h-8 sm:min-w-[2rem] sm:text-sm dark:bg-neutral-200 dark:text-dm-page">
                                {dom}
                              </span>
                            ) : (
                              <span
                                className={[
                                  "shrink-0 text-sm font-semibold tabular-nums sm:text-base",
                                  tripDayRole
                                    ? "text-[color:var(--on-surface)] dark:text-white"
                                    : "text-[color:var(--on-surface-muted)]",
                                ].join(" ")}
                              >
                                {dom}
                              </span>
                            )}
                          </div>
                          <TripCalendarDayBadge role={tripDayRole} range={effectiveHighlightRange} />
                        </div>

                        <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
                          {visibleCalendarEntries}
                          {calendarMoreCount > 0 ? (
                            <p className="px-1 pt-0.5 text-[11px] font-medium tabular-nums leading-snug text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                              +{calendarMoreCount} more
                            </p>
                          ) : null}
                        </div>

                        {showDayEditOverlay ? (
                          <div className="pointer-events-none absolute inset-0 z-20 hidden flex-col items-center justify-center gap-3 opacity-0 transition-opacity duration-200 group-hover/cell:pointer-events-auto group-hover/cell:opacity-100 group-focus-within/cell:pointer-events-auto group-focus-within/cell:opacity-100 md:flex">
                            <div
                              className="absolute inset-0 bg-white/65 backdrop-blur-[4px] dark:bg-neutral-950/55 dark:backdrop-blur-sm"
                              aria-hidden
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              className="relative z-[1] pointer-events-auto rounded-full bg-[#1c1c17] px-4 py-2 text-xs font-semibold text-[color:var(--surface)] shadow-md transition hover:bg-[#2a2a26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/60 dark:bg-neutral-200 dark:text-dm-page dark:hover:bg-white dark:focus-visible:ring-[color:var(--sage-soft)]/70"
                              onMouseDown={(e) => {
                                /** Avoid outer cell receiving focus-ring from click chaining */
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDayIso(cellIso);
                                router.push(`/trip/${tripId}/setup/day?date=${encodeURIComponent(cellIso)}`);
                              }}
                            >
                              Edit day
                            </button>
                          </div>
                        ) : null}

                        {(() => {
                          const others = peersByCellIso.get(cellIso);
                          const p0 = others?.[0];
                          if (!p0) return null;
                          const extra = (others?.length ?? 0) - 1;
                          return (
                            <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex max-w-[calc(100%-0.5rem)] items-center justify-end gap-0.5">
                              <span
                                title={
                                  extra > 0
                                    ? `${p0.name} and ${extra} other${extra === 1 ? "" : "s"} viewing this day`
                                    : `${p0.name} is viewing this day`
                                }
                                className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/70 dark:ring-dm-card/80"
                                style={{ backgroundColor: p0.color }}
                              />
                              {extra > 0 ? (
                                <span className="text-[9px] font-semibold tabular-nums text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                                  +{extra}
                                </span>
                        ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {!hostHasConcreteTripRange(plan) ? (
              <p className="border-t border-[color:var(--hairline)] bg-amber-50/90 px-5 py-3 text-sm leading-relaxed text-amber-900 dark:border-[color:var(--hairline)] dark:bg-amber-950/40 dark:text-amber-100">
                {canEditAsHost
                  ? "Choose a trip range — two taps on the calendar — to anchor your plan and invites."
                  : canEditTripWorkspace
                    ? "Trip dates aren't on the calendar yet. Ask the host to pick a range, or suggest one from Group progress."
                    : "Trip dates aren't on the calendar yet."}
              </p>
            ) : null}
            {err ? (
              <p className="border-t border-[color:var(--hairline)] bg-rose-50/80 px-5 py-3 text-center text-sm text-rose-800 dark:border-[color:var(--hairline)] dark:bg-rose-950/40 dark:text-rose-200">
                {err}
              </p>
            ) : null}
            {canEditTripWorkspace ? (
              <div className="border-t border-[color:var(--hairline)] pt-4 dark:border-white/10">
                <Link
                  href={`/trip/${tripId}/setup/packing`}
                  className="text-xs font-medium text-[color:var(--on-surface)] underline-offset-2 hover:underline dark:text-[#ebe9e4]"
                >
                  Packing list
                </Link>
                <span className="text-xs text-[color:var(--on-surface-muted)]"> · shared checklist</span>
          </div>
            ) : null}
          </div>

        </section>

        {canEditAsHost ? (
          <section id="sec-setup-copilot" className="scroll-mt-28">
            <div className="rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)]/80 px-3 py-2 dark:border-white/10 dark:bg-[color:var(--surface-container-low)]/40">
              <div className="flex items-center gap-3 px-3 py-1">
                <span className="text-base" aria-hidden>
                  ✨
                </span>
                <p className="flex-1 text-sm text-[color:var(--on-surface-muted)] dark:text-[color:var(--on-surface-muted)]">
                  Setup copilot or ask for recommendations…
                </p>
              </div>
            </div>
            <div className="mt-3">
              <HostSetupCopilot tripId={tripId} onResult={onCopilotResult} layout="embedded" />
            </div>
          </section>
        ) : null}

        <section id="sec-trip-chat" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">Trip chat</h2>
          <p className="mt-1 max-w-3xl text-sm text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
            Ask edits in plain language alongside Trip Copilot. Changes sync onto the calendar and collaboration state.
          </p>
          <div className="mt-4">
            <TripCardChatWidget
              tripId={tripId}
              spotlights={plan.spotlights ?? []}
              initialMessages={chatSeed}
              onPlanReplaced={setPlan}
              onCollabBump={bumpCollab}
            />
          </div>
        </section>

          </>
          ) : null}

          {workspaceTab === "budget" && canEditAsHost ? (
          <>
            {isHost ? (
          <section id="sec-budget" className="scroll-mt-28">
            <h2 className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">Budget</h2>
            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
              Set or update your trip budget. This is saved on your draft and guides suggestions.
            </p>
            <div className="mt-3 flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                rows={3}
                value={budgetLine}
                onChange={(e) => setBudgetLine(e.target.value)}
                placeholder="e.g. ~$1,200 per person, splurge on one dinner…"
                className="w-full resize-y rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-2 text-sm text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--on-surface-muted)] focus:border-[color:var(--sage)] dark:border-white/10 dark:bg-dm-elevated dark:text-[color:var(--on-surface)]"
              />
              <button
                type="button"
                onClick={() =>
                  void persistHostSetup(undefined, { tier: null, perPerson: budgetLine.trim() || null })
                }
                className="shrink-0 rounded-xl border border-zinc-500/35 bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600 dark:border-zinc-500/40 dark:bg-zinc-600 dark:hover:bg-zinc-500"
              >
                Save budget
              </button>
            </div>
          </section>
            ) : (
              <section id="sec-budget" className="scroll-mt-28">
                <h2 className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">Group budget</h2>
                <p className="mt-1 text-sm text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                  The host sets the working budget on the plan. Cast your vote and notes under{" "}
                  <strong className="text-[color:var(--on-surface)]">Collaborate</strong> → Decide together.
                </p>
                <p className="mt-3 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-4 py-3 text-sm font-medium text-[color:var(--on-surface)] dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100">
                  {budgetDisplayLine}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceTab("collaborate");
                    requestAnimationFrame(() =>
                      document.getElementById("sec-collab-sidebar")?.scrollIntoView({ behavior: "smooth", block: "start" })
                    );
                  }}
                  className="mt-4 rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4]"
                >
                  Open group budget poll
                </button>
              </section>
            )}
          </>
          ) : null}

          {workspaceTab === "collaborate" ? (
          <>
        {!isHost && canEditTripWorkspace ? (
          <MyPreferencesCard
            tripId={tripId}
            viewerUserId={viewerUserId}
            refreshSignal={collabRefreshSignal}
          />
        ) : null}
        <section id="sec-preferences-adjustments" className="scroll-mt-28">
          <h2 className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
            Preferences &amp; adjustments
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
            {isHost
              ? "Guests type suggestions on the trip page; they queue here for you to run Trip Copilot or decline."
              : "Vote in polls, share availability, and suggest changes below — the host applies what works for the group."}
          </p>
          <div className="mt-5">
            <TripCollaborationPanel
              tripId={tripId}
              plan={plan}
              tripStatus={effectiveTripStatus}
              isHost={isHost}
              variant="preferencesOnly"
              collabRefreshSignal={collabRefreshSignal}
              onPlanUpdated={setPlan}
              viewerUserId={viewerUserId}
              tripOwnerUserId={tripOwnerUserId}
            />
          </div>
        </section>

        <section id="sec-collab-sidebar" className="scroll-mt-28">
          <TripCollaborationPanel
            tripId={tripId}
            plan={plan}
            tripStatus={effectiveTripStatus}
            isHost={isHost}
            collabRefreshSignal={collabRefreshSignal}
            onPlanUpdated={setPlan}
            viewerUserId={viewerUserId}
            tripOwnerUserId={tripOwnerUserId}
            variant="full"
            omitDecisionKeys={[VIBE_POLL_DECISION_KEY]}
          />
        </section>

        <section className="scroll-mt-28 border-t border-[color:var(--hairline)] pt-8 dark:border-white/10">
          <TripHostSetupSidebar tripId={tripId} plan={plan} tripStatus={effectiveTripStatus} />
        </section>

        <section id="sec-itinerary" className="scroll-mt-28">
          {plan.generatedItinerary ? (
            <details className="group overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] dark:border-white/10 dark:bg-dm-card">
              <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="text-base font-semibold text-[color:var(--on-surface)] dark:text-white">Full text itinerary</span>
                <span className="mt-1 block text-sm font-normal leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                  Optional long-form planner text. Pins and votes on the calendar are what guests see day by day.
                </span>
              </summary>
              <div className="border-t border-[color:var(--hairline)] dark:border-[color:var(--hairline)]">
                <GeneratedItineraryView
                  tripId={tripId}
                  initialItinerary={plan.generatedItinerary ?? null}
                  headcount={plan.people.count ?? (plan.people.names.length || 2)}
                />
              </div>
            </details>
          ) : null}
        </section>

          </>
          ) : null}

          {workspaceTab === "lodging" ? (
            <TripLodgingPanel
              plan={plan}
              canEditAsHost={canEditAsHost}
              canEditTripWorkspace={canEditTripWorkspace}
              tripDisplayRange={tripDisplayRange}
              sortedHotelStays={sortedHotelStays}
              primaryHotelSummary={primaryHotelSummary}
              homeBaseHero={homeBaseHero}
              onOpenLodgingModal={openLodgingModal}
            />
          ) : null}

          {workspaceTab === "transportation" ? (
          <section id="sec-flights" className="scroll-mt-28 space-y-5">
            <div>
              <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
                Transportation
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
                Flights &amp; getting there
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                Search routes, save the ones you like, and review driving alternates.
              </p>
            </div>

          {liveFetchErr ? (
              <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
              {liveFetchErr}
            </p>
          ) : null}
          {flightCurationErr ? (
              <LiveCurationErrorBanner message={flightCurationErr} onDismiss={() => setFlightCurationErr(null)} />
            ) : null}
            {canEditAsHost && hostHasConcreteTripRange(plan) && plan.location?.trim() ? (
              <HostFlightSearchPanel tripId={tripId} enabled />
          ) : null}
          {showFlightTransport ? (
              <div className="space-y-4 border-t border-[color:var(--hairline)] pt-6 dark:border-white/10">
                <p className="text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                  From <strong className="text-[color:var(--on-surface)]">{plan.departureCity}</strong> to{" "}
                  <strong className="text-[color:var(--on-surface)]">{plan.location}</strong>
                </p>
                <HostLiveScheduleByDay
                  plan={plan}
                  flights={liveData?.flights ?? []}
                  restaurants={liveData?.restaurants ?? []}
                  experiences={liveData?.experiences ?? []}
                />
                <CuratedFlightsRows
                  plan={plan}
                  flights={liveData?.flights ?? []}
                  liveLoading={liveLoading}
                  flightsError={liveData?.flightsError ?? null}
                  mutate={(a, k, d) => void flightCurationMutate(a, k, d)}
                  busyKey={flightCurationBusy}
                  isHost={isHost}
                  tripDays={flightTripDayOptions}
                />
              {(() => {
                const dc = plan.departureCity?.trim();
                const loc = plan.location?.trim();
                const href =
                  liveData?.drive?.mapsDirectionsUrl ?? (dc && loc ? googleMapsDirUrl(dc, loc) : undefined);
                return href ? (
                    <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    Driving instead?{" "}
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                        className="font-semibold text-[color:var(--on-surface)] underline-offset-2 hover:text-[color:var(--sage)] hover:underline dark:text-emerald-300"
                    >
                      Open directions in Google Maps
                    </a>
                    {liveData?.drive?.durationEstimate ? (
                      <>
                        {" "}
                        (~{liveData.drive.durationEstimate}
                        {liveData.drive.distanceMiles != null ? ` · ~${liveData.drive.distanceMiles} mi` : ""})
                      </>
                    ) : null}
                  </p>
                ) : null;
              })()}
            </div>
            ) : canEditTripWorkspace && hostHasConcreteTripRange(plan) && plan.location?.trim() ? (
              <p className="text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                Add a departure city on the trip card to see route picks and driving estimates here.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                No flights booked yet. Set departure city and destination on the trip to search.
            </p>
          )}
        </section>
          ) : null}

        </main>
      </div>
      </div>

      {pendingRangeConfirm ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-trip-range-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            aria-label="Cancel"
            onClick={cancelPendingTripRange}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-2xl dark:border-white/10 dark:bg-dm-card">
            <div className="border-b border-[color:var(--hairline)] px-5 py-4 dark:border-[color:var(--hairline)]">
              <h2 id="confirm-trip-range-title" className="text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">
                Confirm trip dates
              </h2>
              <p className="mt-2 text-sm text-[color:var(--on-surface-variant)] dark:text-[color:var(--on-surface-muted)]">
                Use these dates for your trip?
              </p>
              <p className="mt-3 rounded-lg bg-[color:var(--sage-soft)]/25 px-3 py-2 text-sm font-medium text-[color:var(--on-surface)] dark:bg-teal-950/50 dark:text-teal-100">
                {formatTripRangeLabel(pendingRangeConfirm.startIso, pendingRangeConfirm.endIso)}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={cancelPendingTripRange}
                className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-dm-elevated dark:text-[color:var(--on-surface)] dark:hover:bg-dm-page"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingTripRange()}
                className="rounded-lg bg-[#1c1c17] px-4 py-2 text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-dm-page"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HostSetupAddPlacesModal
        open={canEditAsHost && addPlacesOpen && Boolean(selectedDayIso)}
        onClose={() => setAddPlacesOpen(false)}
        tripId={tripId}
        plan={plan}
        dateLabel={selectedDayLabel}
        onAddRestaurant={addRestaurantToDay}
        onAddExperience={addExperienceToDay}
      />
      <HostSetupPinDetailModal
        open={pinDetail !== null}
        detail={pinDetail}
        onClose={() => setPinDetail(null)}
      />
      <HostSetupRemovePinConfirm
        open={removePinConfirm !== null}
        label={removePinConfirm?.title ?? ""}
        onCancel={() => setRemovePinConfirm(null)}
        onConfirm={() => {
          if (!removePinConfirm) return;
          if (removePinConfirm.kind === "meal" && removePinConfirm.mapsUrl) {
            removeRestaurantPinByKey(removePinConfirm.dateIso, removePinConfirm.mapsUrl);
          } else if (removePinConfirm.kind === "activity" && removePinConfirm.bookingUrl) {
            removeActivityPinByKey(removePinConfirm.dateIso, removePinConfirm.bookingUrl);
          }
          setRemovePinConfirm(null);
        }}
      />
    </SiteShell>
    </>
  );
}
