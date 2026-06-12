"use client";

import { useCallback } from "react";
import Link from "next/link";
import type { TripPlan, ItineraryActivity } from "@/shared/trip-plan";
import { isGoogleMapsUrl } from "@/shared/external-link";
import { TripFlightSummary } from "@/frontend/components/trip-flight-summary";

// ── Inline SVG icons (no external icon library needed) ─────────────────────────
type IconProps = { className?: string };
function ArrowLeft({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M10 3L5 8l5 5" /></svg>;
}
function Calendar({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><rect x="1.5" y="3" width="13" height="12" rx="1.5" /><path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" /></svg>;
}
function Printer({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><rect x="3.5" y="9.5" width="9" height="5" rx="0.5" /><path d="M3.5 9.5V4a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v5.5" /><path d="M3.5 11.5H2a.5.5 0 01-.5-.5V7a.5.5 0 01.5-.5h12a.5.5 0 01.5.5v4a.5.5 0 01-.5.5h-1.5" /><path d="M4.5 13h7" /></svg>;
}
function MapPin({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6c0-2.485-2.015-4.5-4.5-4.5z" /><circle cx="8" cy="6" r="1.5" /></svg>;
}
function Plane({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M14 8.5L9 5.5V2a1 1 0 00-2 0v3.5L2 8.5v1.5l5-1v2.5l-1.5 1V14L8 13.25 10.5 14v-1.5L9 11v-2.5l5 1V8.5z" /></svg>;
}
function Utensils({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M5 1v5a2 2 0 004 0V1M7 6v9M12 1v14M12 1v4a2 2 0 010 4" /></svg>;
}
function Camera({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M1.5 5a1 1 0 011-1h1.28l1.22-2h4l1.22 2H13.5a1 1 0 011 1v7a1 1 0 01-1 1h-12a1 1 0 01-1-1V5z" /><circle cx="8" cy="8.5" r="2.25" /></svg>;
}
function Building2({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><rect x="1.5" y="4" width="7" height="11" /><rect x="8.5" y="8" width="6" height="7" /><path d="M4 8v.01M4 11v.01M7 8v.01M7 11v.01M11 11v.01M1.5 15h13" /></svg>;
}
function Sun({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className} aria-hidden><circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M11.89 4.11l-1.06 1.06M4.11 11.89l-1.06 1.06" /></svg>;
}
function Coffee({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M2 5h9v6a3 3 0 01-3 3H5a3 3 0 01-3-3V5z" /><path d="M11 6h1.5a1.5 1.5 0 010 3H11" /><path d="M4 2.5C4 2.5 4.5 3.5 4 4.5M7 2.5C7 2.5 7.5 3.5 7 4.5" /></svg>;
}
function Moon({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M13.5 10A6 6 0 016 2.5a6 6 0 100 11 6 6 0 007.5-3.5z" /></svg>;
}
function Users({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-2.761 2.239-5 5-5s5 2.239 5 5" /><path d="M12 7a2 2 0 010-4M15 14c0-1.657-1.343-3-3-3" /></svg>;
}
function ExternalLink({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" /><path d="M10 2h4v4M14 2l-6 6" /></svg>;
}
function Clock({ className }: IconProps) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className} aria-hidden><circle cx="8" cy="8" r="6.5" /><path d="M8 5v3.5l2 2" /></svg>;
}

// ── ICS generation ─────────────────────────────────────────────────────────────
function parseTimeHM(time: string): { h: number; m: number } {
  const match = time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return { h: 9, m: 0 };
  let h = parseInt(match[1]!, 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  if (/pm/i.test(match[3]!) && h !== 12) h += 12;
  if (/am/i.test(match[3]!) && h === 12) h = 0;
  return { h, m };
}

function icsStamp(dateIso: string, time: string, offsetHours = 0): string {
  const { h, m } = parseTimeHM(time);
  const finalH = (h + offsetHours) % 24;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateIso.replace(/-/g, "")}T${pad(finalH)}${pad(m)}00`;
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function generateICS(tripId: string, plan: TripPlan): string {
  const days = plan.generatedItinerary?.days ?? [];
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Conci//Trip Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  days.forEach((day, di) => {
    day.activities.forEach((act, ai) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:conci-${tripId}-d${di}-a${ai}@conci.app`,
        `DTSTART:${icsStamp(day.dateIso, act.time)}`,
        `DTEND:${icsStamp(day.dateIso, act.time, 1)}`,
        `SUMMARY:${icsEscape(act.title)}`,
        `DESCRIPTION:${icsEscape(act.description)}`,
        ...(act.bookingUrl ? [`URL:${act.bookingUrl}`] : []),
        "END:VEVENT"
      );
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ── Category config ────────────────────────────────────────────────────────────
type Category = ItineraryActivity["category"];

const CAT: Record<
  Category,
  { label: string; dot: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  transport:   { label: "Transport",  dot: "#6B7280", bg: "bg-neutral-100 dark:bg-white/8",      text: "text-neutral-500 dark:text-neutral-400",       Icon: Plane },
  food:        { label: "Dining",     dot: "#D97706", bg: "bg-amber-50 dark:bg-amber-950/30",     text: "text-amber-700 dark:text-amber-400",            Icon: Utensils },
  activity:    { label: "Activity",   dot: "#2563EB", bg: "bg-blue-50 dark:bg-blue-950/30",       text: "text-blue-700 dark:text-blue-400",              Icon: Camera },
  lodging:     { label: "Lodging",    dot: "#7C3AED", bg: "bg-violet-50 dark:bg-violet-950/30",   text: "text-violet-700 dark:text-violet-400",          Icon: Building2 },
  "free-time": { label: "Free time",  dot: "#059669", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400",        Icon: Sun },
};

// ── Time-of-day indicator ──────────────────────────────────────────────────────
function TODIcon({ time }: { time: string }) {
  const { h } = parseTimeHM(time);
  if (h >= 5 && h < 12) return <Coffee className="h-3.5 w-3.5 text-neutral-400" />;
  if (h >= 12 && h < 18) return <Sun className="h-3.5 w-3.5 text-neutral-400" />;
  return <Moon className="h-3.5 w-3.5 text-neutral-400" />;
}

// ── Date formatting ────────────────────────────────────────────────────────────
function longDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(`${iso}T00:00:00`)
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export function TripItineraryView({ tripId, plan }: { tripId: string; plan: TripPlan }) {
  const days = plan.generatedItinerary?.days ?? [];
  const tripRange = plan.hostSetup?.tripRange;
  const guestCount = plan.people?.count;

  const dateRange =
    tripRange
      ? `${shortDate(tripRange.startIso)} – ${shortDate(tripRange.endIso)}`
      : days.length > 0
      ? `${shortDate(days[0]!.dateIso)} – ${shortDate(days[days.length - 1]!.dateIso)}`
      : null;

  const handlePrint = useCallback(() => window.print(), []);

  const handleDownloadICS = useCallback(() => {
    const content = generateICS(tripId, plan);
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (plan.title ?? "trip").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `${slug}-itinerary.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tripId, plan]);

  return (
    <>
      {/* ── Print overrides ── */}
      <style>{`
        @media print {
          .no-print  { display: none !important; }
          .day-block { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media not print { .day-block:first-child { page-break-before: auto; } }
      `}</style>

      {/* ── Fixed top bar (screen only) ── */}
      <div className="no-print fixed inset-x-0 top-0 z-50 border-b border-neutral-200 bg-white/95 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-950/95">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/trip/${tripId}/setup`}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>

          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
            {plan.title}
          </span>

          <div className="flex items-center gap-2">
            {days.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadICS}
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400 dark:hover:text-white"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add to Calendar</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-full bg-neutral-950 px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save as PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Page content ── */}
      <main className="min-h-screen bg-white pt-14 dark:bg-neutral-950 print:pt-0">
        <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 md:py-16">

          {/* ── Hero header ── */}
          <header className="relative mb-16 overflow-hidden">
            {/* Decorative blur */}
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#2563EB]/6 blur-3xl dark:bg-[#2563EB]/10" />

            <div className="relative space-y-8 py-8 md:py-14">
              {/* Overline */}
              <div className="flex items-center gap-3">
                <div className="h-px w-10 bg-[#2563EB]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-neutral-400">
                  Travel Itinerary
                </span>
              </div>

              {/* Main title */}
              <div className="space-y-2">
                <h1 className="font-display text-5xl font-bold leading-[0.92] tracking-tight text-neutral-950 dark:text-white sm:text-6xl md:text-7xl">
                  {plan.location ?? plan.title}
                </h1>
                {plan.title && plan.location && plan.title !== plan.location && (
                  <p className="font-display text-3xl font-semibold italic text-[#2563EB] md:text-4xl">
                    {plan.title}
                  </p>
                )}
              </div>

              {/* Meta pills */}
              <div className="flex flex-wrap gap-5 pt-2">
                {dateRange && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/8">
                      <Calendar className="h-[18px] w-[18px] text-[#2563EB]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Dates</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{dateRange}</p>
                    </div>
                  </div>
                )}
                {plan.location && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/8">
                      <MapPin className="h-[18px] w-[18px] text-[#2563EB]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Destination</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{plan.location}</p>
                    </div>
                  </div>
                )}
                {guestCount != null && guestCount > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/8">
                      <Users className="h-[18px] w-[18px] text-[#2563EB]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Travelers</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {guestCount} {guestCount === 1 ? "person" : "people"}
                      </p>
                    </div>
                  </div>
                )}
                {days.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/8">
                      <Plane className="h-[18px] w-[18px] text-[#2563EB]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Duration</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {days.length} {days.length === 1 ? "day" : "days"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Booked/saved flights — renders nothing on no-flight trips */}
            <div className="relative mb-8">
              <TripFlightSummary plan={plan} />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-neutral-200 dark:bg-white/10" />
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-400">
                Schedule
              </span>
              <div className="h-px flex-1 bg-neutral-200 dark:bg-white/10" />
            </div>
          </header>

          {/* ── Empty state ── */}
          {days.length === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-200 px-8 py-16 text-center dark:border-white/10">
              <Clock className="mx-auto mb-4 h-8 w-8 text-neutral-300" />
              <p className="text-[15px] font-medium text-neutral-500 dark:text-neutral-400">
                No itinerary generated yet.
              </p>
              <p className="mt-1 text-[13px] text-neutral-400 dark:text-neutral-500">
                Go back to trip setup and use Copilot to generate your day-by-day schedule.
              </p>
              <Link
                href={`/trip/${tripId}/setup`}
                className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-950"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to setup
              </Link>
            </div>
          )}

          {/* ── Day-by-day timeline ── */}
          <div className="space-y-16 md:space-y-20">
            {days.map((day, dayIdx) => {
              return (
                <div key={day.dateIso} className={dayIdx > 0 ? "day-block" : undefined}>
                  {/* Day header — sticky below the fixed top bar */}
                  <div className="sticky top-14 z-10 -mx-2 mb-8 rounded-lg bg-white/95 px-2 py-3 backdrop-blur-sm dark:bg-neutral-950/95 print:static print:bg-transparent print:backdrop-blur-none">
                    <div className="flex items-baseline gap-3 border-b border-neutral-100 pb-3 dark:border-white/8">
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.25em] text-[#2563EB]">
                        Day {dayIdx + 1}
                      </span>
                      <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-white sm:text-2xl">
                        {longDate(day.dateIso)}
                      </h2>
                    </div>
                  </div>

                  {/* Timeline items */}
                  <div className="relative pl-7 sm:pl-10">
                    {/* Vertical rule */}
                    <div className="absolute bottom-0 left-[3px] top-0 w-px bg-neutral-100 dark:bg-white/8 sm:left-[5px]" />

                    <div className="space-y-5">
                      {day.activities.map((act, actIdx) => {
                        const cfg = CAT[act.category] ?? CAT.activity;
                        return (
                          <div key={actIdx} className="group relative">
                            {/* Timeline dot */}
                            <div className="absolute -left-7 top-[1.15rem] sm:-left-10">
                              <div
                                className="h-2.5 w-2.5 rounded-full ring-4 ring-white transition-transform duration-150 group-hover:scale-[1.3] dark:ring-neutral-950 sm:h-3 sm:w-3"
                                style={{ backgroundColor: cfg.dot }}
                              />
                            </div>

                            {/* Activity card */}
                            <div className="rounded-xl border border-neutral-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:border-neutral-200 hover:shadow-[0_3px_8px_rgba(0,0,0,0.07)] dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/14 sm:p-5">
                              {/* Badges */}
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 dark:bg-white/8">
                                  <TODIcon time={act.time} />
                                  <span className="text-[12px] font-medium tabular-nums text-neutral-600 dark:text-neutral-300">
                                    {act.time}
                                  </span>
                                </div>
                                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${cfg.bg}`}>
                                  <cfg.Icon className={`h-3 w-3 ${cfg.text}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>
                                    {cfg.label}
                                  </span>
                                </div>
                              </div>

                              {/* Title */}
                              <h3 className="font-display text-[17px] font-semibold leading-snug text-neutral-900 dark:text-white sm:text-lg">
                                {act.title}
                              </h3>

                              {/* Description */}
                              {act.description && (
                                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                                  {act.description}
                                </p>
                              )}

                              {/* Booking link */}
                              {act.bookingUrl && (
                                <a
                                  href={act.bookingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:underline dark:text-[#60A5FA]"
                                >
                                  {isGoogleMapsUrl(act.bookingUrl) ? "View on Maps" : "Book now"}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Footer ── */}
          {days.length > 0 && (
            <footer className="mt-20 border-t border-neutral-100 pt-8 dark:border-white/10">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5">
                  <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
                    Created with care for your journey
                  </p>
                  <p className="text-[11px] text-neutral-300 dark:text-neutral-600">
                    Powered by Conci
                  </p>
                </div>
                <span className="text-xl text-[#2563EB]">✦</span>
              </div>

              {/* Export actions (also at footer for long pages) */}
              <div className="no-print mt-8 flex flex-wrap gap-3">
                {days.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadICS}
                    className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400 dark:hover:text-white"
                  >
                    <Calendar className="h-4 w-4" />
                    Add all to calendar (.ics)
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                >
                  <Printer className="h-4 w-4" />
                  Save as PDF
                </button>
              </div>
            </footer>
          )}
        </div>
      </main>
    </>
  );
}
