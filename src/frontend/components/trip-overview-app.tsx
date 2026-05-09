"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { DynamicTripItinerary } from "@/frontend/components/dynamic-trip-itinerary";
import { SiteShell } from "@/frontend/components/site-shell";
import {
  concreteTripRangeFromPlanDates,
  parseLocalIsoDate,
  tripRangeBestEffortFromPlanDates,
  type TripPlan,
} from "@/shared/trip-plan";

function rangeLabel(plan: TripPlan): string {
  const range =
    plan.hostSetup?.tripRange ??
    concreteTripRangeFromPlanDates(plan, new Date().getFullYear()) ??
    tripRangeBestEffortFromPlanDates(plan, new Date().getFullYear());
  if (!range?.startIso || !range?.endIso) return "Not set";
  const a = parseLocalIsoDate(range.startIso);
  const b = parseLocalIsoDate(range.endIso);
  if (!a || !b) return `${range.startIso} -> ${range.endIso}`;
  return `${a.toLocaleDateString()} - ${b.toLocaleDateString()}`;
}

export function TripOverviewApp({ tripId, plan }: { tripId: string; plan: TripPlan }) {
  const printRootRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const datesLine = useMemo(() => rangeLabel(plan), [plan]);
  const budgetLine = useMemo(
    () => plan.budget.perPerson?.trim() || plan.budget.tier?.trim() || "Not set",
    [plan.budget.perPerson, plan.budget.tier]
  );
  const title = plan.title?.trim() || "Trip overview";
  const location = plan.location?.trim() || "Location not set";

  const downloadPdf = useCallback(async () => {
    const el = printRootRef.current;
    if (!el) return;
    setPdfErr(null);
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [12, 10, 12, 10],
          filename: `${title.replace(/[^\w-]+/g, "-") || "trip"}-overview.pdf`,
          image: { type: "jpeg", quality: 0.94 },
          html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (e) {
      setPdfErr(e instanceof Error ? e.message : "Could not create PDF.");
    } finally {
      setPdfBusy(false);
    }
  }, [title]);

  return (
    <SiteShell title={title} eyebrow="Trip overview app" contentWide tripTypography>
      <div className="mx-auto w-full max-w-5xl space-y-6 pb-28">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/trip/${tripId}/setup`}
            className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline dark:text-neutral-400"
          >
            Back to setup
          </Link>
          <button
            type="button"
            disabled={pdfBusy}
            onClick={() => void downloadPdf()}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-70"
          >
            {pdfBusy ? "Preparing PDF..." : "Download PDF"}
          </button>
        </div>

        {pdfErr ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {pdfErr}
          </p>
        ) : null}

        <div
          ref={printRootRef}
          className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-dm-card dark:shadow-none"
        >
          <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-dm-page/70">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">{location}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-dm-elevated">
                Dates: {datesLine}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-white/10 dark:bg-dm-elevated">
                Budget: {budgetLine}
              </span>
            </div>
          </section>

          <DynamicTripItinerary plan={plan} />
        </div>
      </div>
    </SiteShell>
  );
}

