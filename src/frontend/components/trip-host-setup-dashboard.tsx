"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatLocalIsoDate,
  inferYearMonthFromDateOptionsHints,
} from "@/shared/date-option-parse";
import {
  applyHostHotelDateRange,
  applyHostHotelSelection,
  concreteTripRangeFromPlanDates,
  enumerateLocalIsoDays,
  hostHasConcreteTripRange,
  hotelStayForDay,
  isHostPublishReady,
  normalizePlan,
  parseLocalIsoDate,
  seedTextMentionsDining,
  tripLiveRecommendationsContextFingerprint,
  type HostActivityExperience,
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
import {
  HostSetupAddPlacesModal,
  type HostSetupHotelAddSpec,
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
import type { TripPlanStatus } from "@/shared/trip-status";
import { HOST_SETUP_NAV_ITEMS, type HostSetupNavItemId } from "@/shared/trip-host-setup-nav";
import type { CollabStateV1 } from "@/shared/collaboration";
import { TripCardChatWidget } from "@/frontend/components/trip-card-chat-widget";
import { TripCollaborationPanel } from "@/frontend/components/trip-collaboration-panel";
import { TripHostSetupSidebar } from "@/frontend/components/trip-host-setup-sidebar";
import { TripContributeButton } from "@/frontend/components/trip-contribute-button";
import { TripDepositTracker } from "@/frontend/components/trip-deposit-tracker";
import { InviteCodeRow } from "@/frontend/components/invite-code-row";

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
  shareMessage: string;
  tripMemberNames: string[];
};

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

const WEEKDAY_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday-first month grid padding (classic wall calendar layout). */
function calendarCellsMondayFirst(viewYear: number, viewMonth: number): (number | null)[] {
  const firstDowSun0 = new Date(viewYear, viewMonth, 1).getDay();
  const padMon0 = (firstDowSun0 + 6) % 7;
  const n = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < padMon0; i++) cells.push(null);
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
  return `${a.toLocaleDateString(undefined, o)} – ${b.toLocaleDateString(undefined, o)}`;
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

export function TripHostSetupDashboard({
  tripId,
  initialPlan,
  seedText = null,
  initialTripStatus,
  initialCollab,
  viewerUserId,
  tripOwnerUserId,
  inviteCode,
  shareMessage,
  tripMemberNames,
}: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState<TripPlan>(initialPlan);
  const [effectiveTripStatus, setEffectiveTripStatus] = useState<TripPlanStatus>(initialTripStatus);
  const [collabRefreshSignal, setCollabRefreshSignal] = useState(0);
  const bumpCollab = useCallback(() => {
    setCollabRefreshSignal((n) => n + 1);
    void router.refresh();
  }, [router]);

  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    setEffectiveTripStatus(initialTripStatus);
  }, [initialTripStatus]);

  const hostSetup = useMemo(() => plan.hostSetup ?? {}, [plan.hostSetup]);
  const [publishBusy, setPublishBusy] = useState(false);
  const [budgetLine, setBudgetLine] = useState(
    () =>
      initialPlan.budget.perPerson?.trim() ||
      initialPlan.budget.tier?.trim() ||
      ""
  );
  const [err, setErr] = useState<string | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [datePickMode, setDatePickMode] = useState<"range" | "day">(() =>
    hostHasConcreteTripRange(initialPlan) ? "day" : "range"
  );
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [addPlacesOpen, setAddPlacesOpen] = useState(false);
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
  /** Set after the second tap in range mode; saved only when the host confirms. */
  const [pendingRangeConfirm, setPendingRangeConfirm] = useState<{
    startIso: string;
    endIso: string;
  } | null>(null);
  const [availabilityNote, setAvailabilityNote] = useState("");

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
      budgetPatch?: { tier?: string | null; perPerson?: string | null }
    ): Promise<boolean> => {
      setErr(null);
      const body: Record<string, unknown> = {};
      if (patch && Object.keys(patch).length > 0) body.hostSetup = patch;
      if (budgetPatch) body.budget = budgetPatch;
      if (!body.hostSetup && !body.budget) return false;
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
        if (j.plan) setPlan(j.plan);
        return true;
      } catch {
        setErr("Could not save setup.");
        return false;
      }
    },
    [tripId]
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

  /** Legacy drafts: persist **concrete** parser dates once if `hostSetup.tripRange` was never saved. */
  useEffect(() => {
    const y0 = new Date().getFullYear();
    const inferred = concreteTripRangeFromPlanDates(initialPlan, y0);
    if (!inferred || initialPlan.hostSetup?.tripRange?.startIso) return;
    void persistHostSetup({ tripRange: inferred });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time hydrate from initial plan only
  }, []);

  /** Seed restaurant pins only when the host’s parser message mentioned dining. */
  useEffect(() => {
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

  const onHotelAddFromModal = useCallback(
    (place: PlaceSpotlight, spec: HostSetupHotelAddSpec) => {
      if (!tripDisplayRange?.startIso || !tripDisplayRange?.endIso) return;
      if (spec.kind === "entireTrip") {
        const { hotelStays, hotel } = applyHostHotelSelection(
          hostSetup.hotelStays,
          tripDisplayRange.startIso,
          tripDisplayRange.endIso,
          tripDisplayRange.startIso,
          place,
          "full"
        );
        void persistHostSetup({ hotelStays, hotel });
        return;
      }
      const { hotelStays, hotel } = applyHostHotelDateRange(
        hostSetup.hotelStays,
        tripDisplayRange.startIso,
        tripDisplayRange.endIso,
        spec.stayStartIso,
        spec.stayEndIso,
        place
      );
      void persistHostSetup({ hotelStays, hotel });
    },
    [tripDisplayRange?.startIso, tripDisplayRange?.endIso, hostSetup.hotelStays, persistHostSetup]
  );

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

  const confirmPendingTripRange = useCallback(async () => {
    if (!pendingRangeConfirm) return;
    setErr(null);
    suggestedSeededRef.current = false;
    setSelectedDayIso(null);
    const ok = await persistHostSetup({
      hotel: null,
      hotelStays: [],
      experiencesOutlined: hostSetup.experiencesOutlined,
      tripRange: pendingRangeConfirm,
      restaurantPins: [],
      activityPins: [],
    });
    if (ok) {
      setPendingRangeConfirm(null);
      setDatePickMode("day");
    }
  }, [
    pendingRangeConfirm,
    hostSetup.experiencesOutlined,
    persistHostSetup,
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
    [calYear, calMonth, rangeAnchor, datePickMode, tripDayIsoSet, router, tripId]
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

  const pubReady = isHostPublishReady(plan);

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
      requestAnimationFrame(() => {
        document.getElementById(`sec-${ui.scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const onPublish = useCallback(async () => {
    if (!pubReady) return;
    setPublishBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/trip-plans/${tripId}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean; plan?: TripPlan };
      if (!res.ok) {
        setErr(j.error || "Publish failed.");
        return;
      }
      if (j.plan) {
        setPlan(normalizePlan(j.plan));
      }
      setEffectiveTripStatus("voting");
      router.refresh();
    } finally {
      setPublishBusy(false);
    }
  }, [pubReady, tripId, router]);

  const cells = useMemo(() => calendarCellsMondayFirst(calYear, calMonth), [calYear, calMonth]);
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

  const inTripRangeCell = useCallback(
    (dom: number | null): boolean => {
      if (!dom || !effectiveHighlightRange?.startIso || !effectiveHighlightRange.endIso) return false;
      const iso = isoFromCell(calYear, calMonth, dom);
      const days = enumerateLocalIsoDays(effectiveHighlightRange.startIso, effectiveHighlightRange.endIso);
      return days.includes(iso);
    },
    [effectiveHighlightRange, calYear, calMonth]
  );

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

  const primaryHotelSummary = useMemo(() => {
    const stays = plan.hostSetup?.hotelStays ?? [];
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
  }, [plan.hostSetup?.hotelStays, plan.location]);

  const resolveWorkspaceNavHref = useCallback(
    (navId: HostSetupNavItemId): string =>
      navId === "collab-sidebar" ? "#sec-collab-sidebar" : `#sec-${navId}`,
    []
  );

  const resolveSidebarNavHref = useCallback(
    (navId: HostSetupNavItemId): string =>
      navId === "collab-sidebar" ? "#sec-collab-sidebar" : `#sec-${navId}`,
    []
  );

  return (
    <>
    <SiteShell
      title={plan.title?.trim() || "Trip"}
      eyebrow={effectiveTripStatus === "draft" ? "Host setup" : "Your trip"}
      tripTypography
      contentWide
    >
      <div className="mx-auto w-full pb-14">
      <div className="mb-10 border-b border-slate-200 pb-8 dark:border-white/10">
        <nav className="flex min-w-0 flex-wrap gap-x-3 gap-y-2 text-sm sm:gap-x-4">
          {HOST_SETUP_NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={resolveWorkspaceNavHref(item.id)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500 dark:bg-zinc-400" />
              {item.label}
            </a>
          ))}
          <Link
            href={`/trip/${tripId}/setup/packing`}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100"
          >
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500 dark:bg-zinc-400" />
            Packing list
          </Link>
        </nav>
      </div>

      <div className="space-y-12">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-10">
          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#141816] to-dm-card p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8">
              <div className="mb-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Trip fund</p>
                <div className="flex flex-wrap items-center gap-2">
                  <TripDepositTracker tripId={tripId} />
                  <TripContributeButton tripId={tripId} />
                </div>
              </div>
              <div className="mb-6">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Join code · invite people</p>
                {inviteCode ? (
                  <InviteCodeRow rawCode={inviteCode} prominent />
                ) : (
                  <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm leading-relaxed text-neutral-300">
                    <p>
                      A 6-character join code is issued when you{" "}
                      <strong className="font-semibold text-white">publish</strong> this trip. Guests enter it on{" "}
                      <Link
                        href="/join?from=create"
                        className="font-medium text-teal-400 underline-offset-2 hover:underline"
                      >
                        Join a Trip
                      </Link>
                      . You can also copy a full invite from <span className="text-neutral-200">Share trip</span> in the trip
                      card section below.
                    </p>
                  </div>
                )}
                {inviteCode ? (
                  <p className="mt-2 text-xs text-neutral-500">Guests sign in and enter this code on Join a Trip to join your draft.</p>
                ) : null}
              </div>
              <div className="mb-6 rounded-2xl border border-teal-500/30 bg-teal-950/25 p-4 sm:p-5">
                <h3 className="font-display text-base font-semibold text-white">Which dates work for you?</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                  Note when everyone&apos;s free or what to avoid — keep it beside the calendar while you set trip days.
                </p>
                <label className="mt-3 block">
                  <span className="sr-only">Availability</span>
                  <textarea
                    value={availabilityNote}
                    onChange={(e) => setAvailabilityNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. Prefer long weekend · avoid holidays…"
                    className="w-full resize-y rounded-xl border border-white/15 bg-black/35 px-3 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-teal-500/45"
                  />
                </label>
              </div>
              <section id="sec-dates" className="scroll-mt-28">
          <div className="mb-5 flex flex-col gap-3">
            <div className="min-w-0">
              <p className="max-w-3xl text-sm leading-relaxed text-neutral-300">
                {datePickMode === "range"
                  ? tripDisplayRange?.startIso && tripDisplayRange.endIso
                    ? `Change dates: tap two days (currently ${tripDisplayRange.startIso} → ${tripDisplayRange.endIso}). Confirming new dates clears meal and activity pins for the old range.`
                    : "Tap two days to set your trip; days in range are highlighted below."
                  : tripDisplayRange?.startIso && tripDisplayRange.endIso
                    ? `${tripDisplayRange.startIso} → ${tripDisplayRange.endIso} — tap any trip day below to open a dedicated host day screen (hotel, meals, activities, Trip Copilot for that date). Use Add places for shortcuts on the first day or choose a day first.`
                    : "Tap two days to set your trip."}
              </p>
              {rangeAnchor && datePickMode === "range" && !pendingRangeConfirm ? (
                <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">Select end date…</p>
              ) : null}
              {pendingRangeConfirm && datePickMode === "range" ? (
                <p className="mt-2 text-xs font-medium text-teal-600 dark:text-teal-400">
                  Confirm your trip dates in the dialog below.
                </p>
              ) : null}
            </div>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:shadow-none">
            {/* Header — toolbar like reference */}
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6 sm:py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-neutral-100 sm:text-xl">
                  {new Date(calYear, calMonth, 1).toLocaleString("default", { month: "long", year: "numeric" })}
                </h3>
                {hostHasConcreteTripRange(plan) && datePickMode === "day" && hostSetup.tripRange?.startIso ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDayIso(hostSetup.tripRange!.startIso);
                      setAddPlacesOpen(true);
                    }}
                    className="shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 sm:px-3 sm:py-1.5 dark:border-teal-800/50 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-900/50"
                  >
                    Add places
                  </button>
                ) : null}
                {hostHasConcreteTripRange(plan) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDatePickMode("range");
                      setRangeAnchor(null);
                      setSelectedDayIso(null);
                      setAddPlacesOpen(false);
                      setPendingRangeConfirm(null);
                    }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-3 sm:py-1.5 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:bg-dm-page"
                  >
                    Change dates
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-neutral-300 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-neutral-300 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
                >
                  <ChevRight className="h-4 w-4" />
                </button>
                {effectiveTripStatus === "draft" ? (
                  <button
                    type="button"
                    disabled={!pubReady || publishBusy}
                    onClick={() => void onPublish()}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-500 disabled:pointer-events-none disabled:bg-slate-300 disabled:text-slate-500 sm:px-4 sm:py-2 sm:text-sm dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                  >
                    {publishBusy ? "Publishing…" : "Publish trip"}
                  </button>
                ) : (
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-200 sm:px-4 sm:py-2 sm:text-sm">
                    Published · join code above
                  </span>
                )}
              </div>
            </div>

            {/* Weekday stripe */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-dm-elevated/80">
              {WEEKDAY_MON_FIRST.map((w) => (
                <div
                  key={w}
                  className="border-l border-transparent py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 first:border-l-0 dark:text-neutral-400 sm:py-3 sm:text-[11px] sm:tracking-[0.15em] md:text-xs md:tracking-[0.16em]"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="border-x border-slate-200 bg-white dark:border-white/10 dark:bg-dm-card">
              {weeks.map((weekRow, wi) => (
                <div key={`wk-${wi}`} className="grid grid-cols-7">
                  {weekRow.map((dom, ci) => {
                    if (dom == null) {
                      return (
                        <div
                          key={`e-${wi}-${ci}`}
                          className={[
                            "min-h-[7.5rem] border-b border-slate-200 bg-slate-50/40 dark:border-white/10 dark:bg-dm-page/60 sm:min-h-[8.75rem] lg:min-h-[10rem]",
                            ci < 6 ? "border-r border-slate-200 dark:border-white/10" : "",
                          ].join(" ")}
                        />
                      );
                    }
                    const cellIso = isoFromCell(calYear, calMonth, dom);
                    const hotelForDay = hotelStayForDay(hostSetup.hotelStays, cellIso);
                    const dayLabel = formatPinDayLabel(cellIso);
                    return (
                      <div
                        key={`d-${calYear}-${calMonth}-${dom}-${wi}-${ci}`}
                        tabIndex={0}
                        role="presentation"
                        onClick={() => onCalendarDayClick(dom)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCalendarDayClick(dom);
                          }
                        }}
                        className={[
                          "group/cell relative flex h-full min-h-[7.5rem] cursor-pointer flex-col border-b border-slate-200 px-2.5 py-2.5 text-left align-top transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 sm:min-h-[8.75rem] sm:px-3 sm:py-3 lg:min-h-[10rem] lg:px-4 lg:py-4 dark:border-white/10",
                          ci < 6 ? "border-r border-slate-200 dark:border-white/10" : "",
                          inTripRangeCell(dom)
                            ? "bg-amber-100/85 hover:bg-amber-100 dark:bg-amber-950/45 dark:hover:bg-amber-950/60"
                            : "bg-white hover:bg-slate-50/80 dark:bg-dm-card dark:hover:bg-dm-elevated/50",
                          parseLocalIsoDate(cellIso)?.getTime() === parseLocalIsoDate(rangeAnchor ?? "")?.getTime()
                            ? "ring-2 ring-amber-300 ring-inset dark:ring-amber-500/50"
                            : "",
                          datePickMode === "day" && selectedDayIso === cellIso
                            ? "ring-1 ring-teal-400/80 ring-inset dark:ring-teal-500/50"
                            : "",
                        ].join(" ")}
                      >
                        <div className="mb-1.5 flex shrink-0 items-start justify-between gap-2">
                          {isCalendarToday(dom) ? (
                            <span className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white shadow-sm sm:h-8 sm:min-w-[2rem] sm:text-sm">
                              {dom}
                            </span>
                          ) : (
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500 dark:text-neutral-400 sm:text-base">
                              {dom}
                            </span>
                          )}
                        </div>

                        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                          {hotelForDay ? (
                            <div className="min-w-0 w-full">
                              <div className="flex items-start gap-1.5 rounded-md px-1 py-0.5 text-left leading-snug text-slate-800 dark:text-neutral-100">
                                <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">
                                  {hotelForDay.place.name}
                                </span>
                                <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px] dark:text-neutral-500">
                                  Stay
                                </span>
                              </div>
                            </div>
                          ) : null}

                          {(hostSetup.restaurantPins ?? [])
                            .filter((p) => p.dateIso === cellIso && p.kept)
                            .map((p) => (
                              <div key={p.place.mapsUrl} className="group/pin relative min-w-0 w-full pr-5">
                                <button
                                  type="button"
                                  className="w-full rounded-md px-1 py-0.5 text-left transition hover:bg-white/70 dark:hover:bg-white/5"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setPinDetail({ kind: "meal", place: p.place, dateLabel: dayLabel });
                                  }}
                                >
                                  <div className="flex items-start gap-1.5 leading-snug text-slate-800 dark:text-neutral-100">
                                    <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">
                                      {p.place.name}
                                    </span>
                                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px] dark:text-neutral-500">
                                      Meal
                                    </span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Remove ${p.place.name}`}
                                  className="absolute right-0 top-0 rounded p-0.5 text-[13px] leading-none text-slate-400 opacity-50 transition hover:bg-rose-500/15 hover:text-rose-600 md:opacity-0 md:group-hover/pin:opacity-100"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setRemovePinConfirm({
                                      kind: "meal",
                                      dateIso: p.dateIso,
                                      mapsUrl: p.place.mapsUrl,
                                      title: `“${p.place.name}” on ${dayLabel}`,
                                    });
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}

                          {(hostSetup.activityPins ?? [])
                            .filter((p) => p.dateIso === cellIso && p.kept)
                            .map((p) => (
                              <div key={p.experience.bookingUrl} className="group/pin relative min-w-0 w-full pr-5">
                                <button
                                  type="button"
                                  className="w-full rounded-md px-1 py-0.5 text-left transition hover:bg-white/70 dark:hover:bg-white/5"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setPinDetail({
                                      kind: "activity",
                                      experience: p.experience,
                                      dateLabel: dayLabel,
                                    });
                                  }}
                                >
                                  <div className="flex items-start gap-1.5 leading-snug text-slate-800 dark:text-neutral-100">
                                    <span className="min-w-0 flex-1 text-[12px] font-medium sm:text-[13px]">
                                      {p.experience.name}
                                    </span>
                                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400 sm:text-[10px] dark:text-neutral-500">
                                      Activity
                                    </span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Remove ${p.experience.name}`}
                                  className="absolute right-0 top-0 rounded p-0.5 text-[13px] leading-none text-slate-400 opacity-50 transition hover:bg-rose-500/15 hover:text-rose-600 md:opacity-0 md:group-hover/pin:opacity-100"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setRemovePinConfirm({
                                      kind: "activity",
                                      dateIso: p.dateIso,
                                      bookingUrl: p.experience.bookingUrl,
                                      title: `“${p.experience.name}” on ${dayLabel}`,
                                    });
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {!hostHasConcreteTripRange(plan) ? (
              <p className="border-t border-slate-100 bg-amber-50/90 px-5 py-3 text-sm leading-relaxed text-amber-900 dark:border-white/10 dark:bg-amber-950/40 dark:text-amber-100">
                Choose a trip range — two taps on the calendar — before you can publish.
              </p>
            ) : null}
            {err ? (
              <p className="border-t border-slate-100 bg-rose-50/80 px-5 py-3 text-center text-sm text-rose-800 dark:border-white/10 dark:bg-rose-950/40 dark:text-rose-200">
                {err}
              </p>
            ) : null}
          </div>

        </section>

            </div>
          </div>
          <aside className="flex flex-col gap-6 xl:sticky xl:top-28">
            <div
              id="sec-flights"
              className="scroll-mt-28 rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#101412] p-6 shadow-xl space-y-4 text-neutral-200 [&_h3]:text-white [&_p]:text-neutral-400 [&_strong]:text-neutral-200"
            >
              <h3 className="font-display text-lg font-semibold text-white">Flights</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-400">
            Live fare rows from Google Flights (SerpApi). Once your trip lists a departure city and destination, you can add
            options to the published itinerary the same way as after publish — tap <strong className="text-slate-800 dark:text-neutral-200">Add to trip</strong>{" "}
            for the flights you want the group to see.
          </p>
          {liveFetchErr ? (
            <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-950/30 px-4 py-2 text-sm text-amber-200">
              {liveFetchErr}
            </p>
          ) : null}
          {flightCurationErr ? (
            <div className="mt-3">
              <LiveCurationErrorBanner message={flightCurationErr} onDismiss={() => setFlightCurationErr(null)} />
            </div>
          ) : null}
          {hostHasConcreteTripRange(plan) && plan.location?.trim() ? (
            <HostFlightSearchPanel tripId={tripId} enabled />
          ) : null}
          {showFlightTransport ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5 shadow-inner">
              <p className="text-xs text-neutral-400">
                From                 <strong className="text-neutral-100">{plan.departureCity}</strong> to{" "}
                <strong className="text-neutral-100">{plan.location}</strong>
              </p>
              <div className="mt-4 space-y-4">
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
                  isHost
                  tripDays={flightTripDayOptions}
                />
              </div>
              {(() => {
                const dc = plan.departureCity?.trim();
                const loc = plan.location?.trim();
                const href =
                  liveData?.drive?.mapsDirectionsUrl ?? (dc && loc ? googleMapsDirUrl(dc, loc) : undefined);
                return href ? (
                  <p className="mt-4 text-xs text-slate-500 dark:text-neutral-500">
                    Driving instead?{" "}
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
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
          ) : (
            <p className="mt-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-relaxed text-neutral-300">
              Add a <strong className="text-white">departure city</strong> and{" "}
              <strong className="text-white">destination</strong> on your trip — use{" "}
              <strong className="text-white">Trip Copilot</strong> (floating panel) or your parser draft — then
              flight rows appear here. Server needs <code className="rounded bg-white/10 px-1 text-xs">SERPAPI_KEY</code>{" "}
              for live prices.
            </p>
          )}
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-[#141816] to-[#101412] p-6 shadow-xl">
              <h3 className="font-display text-lg font-semibold text-white">Home base · hotel</h3>
              {primaryHotelSummary ? (
                <div className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-4 text-sm leading-relaxed text-neutral-300">
                  <p className="font-semibold text-white">{primaryHotelSummary.title}</p>
                  <p className="mt-2 text-neutral-400">{primaryHotelSummary.detail}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                  Add lodging on a calendar day or with Trip Copilot.
                </p>
              )}
            </div>
          </aside>
        </div>

        <section id="sec-setup-copilot" className="scroll-mt-28">
          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-white/10 dark:from-dm-card dark:to-dm-page/80 dark:shadow-none sm:p-8">
            <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Setup copilot
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
              Change dates, budget, hotels, and pins in plain language — updates save to this draft when the model applies them.
            </p>
            <div className="mt-6 flex justify-center sm:justify-start">
              <HostSetupCopilot tripId={tripId} onResult={onCopilotResult} layout="embedded" />
            </div>
          </div>
        </section>

        <section id="sec-preferences-adjustments" className="scroll-mt-28">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none sm:p-8">
            <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Preferences &amp; adjustments
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
              Guests type suggestions on the shared trip page; they queue here for you to run Trip Copilot or decline.
            </p>
            <div className="mt-6">
              <TripCollaborationPanel
                tripId={tripId}
                plan={plan}
                tripStatus={effectiveTripStatus}
                isHost
                variant="preferencesOnly"
                collabRefreshSignal={collabRefreshSignal}
                onPlanUpdated={setPlan}
                viewerUserId={viewerUserId}
                tripOwnerUserId={tripOwnerUserId}
              />
            </div>
          </div>
        </section>

        <section id="sec-budget" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Budget</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Set or update your trip budget. This is saved on your draft and guides suggestions.
          </p>
          <div className="mt-3 flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              rows={3}
              value={budgetLine}
              onChange={(e) => setBudgetLine(e.target.value)}
              placeholder="e.g. ~$1,200 per person, splurge on one dinner…"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100"
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

        <section id="sec-trip-chat" className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Trip chat</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-neutral-400">
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

        <section className="scroll-mt-28">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none sm:p-8">
            <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Trip card, sharing &amp; group decisions
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-neutral-400">
              Invites, deposits, spotlight votes, and open decisions — on the same workspace as your calendar.
            </p>
            <div className="mt-6">
              <TripHostSetupSidebar
                tripId={tripId}
                plan={plan}
                tripStatus={effectiveTripStatus}
                onPlanUpdated={setPlan}
                inviteCode={inviteCode}
                shareMessage={shareMessage}
                tripMemberNames={tripMemberNames}
                viewerUserId={viewerUserId}
                tripOwnerUserId={tripOwnerUserId}
                initialCollab={initialCollab}
                collabRefreshSignal={collabRefreshSignal}
                bumpCollab={bumpCollab}
                resolveNavHref={resolveSidebarNavHref}
              />
            </div>
          </div>
        </section>

        <section id="sec-itinerary" className="scroll-mt-28">
          {plan.generatedItinerary ? (
            <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-dm-card">
              <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="text-base font-semibold text-slate-900 dark:text-white">Full text itinerary</span>
                <span className="mt-1 block text-sm font-normal leading-relaxed text-slate-600 dark:text-neutral-400">
                  Optional long-form planner text. Pins and votes on the calendar are what guests see day by day.
                </span>
              </summary>
              <div className="border-t border-slate-200 dark:border-white/10">
                <GeneratedItineraryView
                  tripId={tripId}
                  initialItinerary={plan.generatedItinerary ?? null}
                  headcount={plan.people.count ?? (plan.people.names.length || 2)}
                />
              </div>
            </details>
          ) : null}
        </section>
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
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-dm-card">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <h2 id="confirm-trip-range-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                Confirm trip dates
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
                Use these dates for your trip?
              </p>
              <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900 dark:bg-teal-950/50 dark:text-teal-100">
                {formatTripRangeLabel(pendingRangeConfirm.startIso, pendingRangeConfirm.endIso)}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={cancelPendingTripRange}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:bg-dm-page"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingTripRange()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HostSetupAddPlacesModal
        open={addPlacesOpen && Boolean(selectedDayIso)}
        onClose={() => setAddPlacesOpen(false)}
        tripId={tripId}
        plan={plan}
        dateLabel={selectedDayLabel}
        tripRange={
          tripDisplayRange?.startIso && tripDisplayRange?.endIso
            ? { startIso: tripDisplayRange.startIso, endIso: tripDisplayRange.endIso }
            : null
        }
        onAddRestaurant={addRestaurantToDay}
        onAddExperience={addExperienceToDay}
        onAddHotel={onHotelAddFromModal}
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
