import { unstable_noStore as noStore } from "next/cache";
import { SiteShell } from "@/components/site-shell";
import { GlassCard, Pill, SectionTitle } from "@/components/cards";
import { ItineraryWorkspace } from "@/components/itinerary-workspace";
import { logItineraryDiagnostic, logItineraryError } from "@/lib/itinerary-debug";
import { buildItineraryScreenData, getActiveItinerary } from "@/lib/itinerary-store";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  noStore();

  logItineraryDiagnostic("page.results.entry");

  let itinerary = null;

  try {
    itinerary = await getActiveItinerary();
    logItineraryDiagnostic("page.results.get_active_itinerary.result", {
      hasItinerary: Boolean(itinerary),
      itineraryId: itinerary?.id || null,
      category: itinerary?.category || null,
      itemCount: itinerary?.itinerary_items?.length || 0,
      selectionCount: itinerary?.selections?.length || 0,
    });
  } catch (error) {
    logItineraryError("page.results.get_active_itinerary.error", {
      message: error instanceof Error ? error.message : "Unknown results page loader error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    itinerary = null;
  }

  if (!itinerary) {
    return (
      <SiteShell title="Your trip is ready to shape." eyebrow="Results screen">
        <GlassCard className="p-6">
          <p className="text-sm leading-6 text-slate-600">
            We could not load an itinerary yet. Go back to the prompt screen and submit a request.
          </p>
        </GlassCard>
      </SiteShell>
    );
  }

  try {
    const screenData = buildItineraryScreenData(itinerary);
    const summary = itinerary.parsed_request?.summary || "We loaded your latest itinerary.";
    const chips = Array.isArray(screenData.summaryChips) ? Array.from(new Set(screenData.summaryChips.filter(Boolean))) : [];

    return (
      <SiteShell title={screenData.title} eyebrow="Results screen">
        <div className="grid gap-6">
          <GlassCard className="overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <Pill>{itinerary.category}</Pill>
                <Pill>{itinerary.parsed_request?.uncertain ? "Fallback / uncertain" : "Structured parse"}</Pill>
                <Pill>Mock availability</Pill>
              </div>
              <SectionTitle
                title={screenData.title}
                description="This is the current canonical itinerary state, shared across the app."
              />
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Current request
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {itinerary.prompt || "No prompt was provided."}
                </p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Interpretation
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{summary}</p>
                {chips.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {chips.map((chip, index) => (
                      <span
                        key={`${chip}-${index}`}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </GlassCard>

          <ItineraryWorkspace screenData={screenData} />
        </div>
      </SiteShell>
    );
  } catch (error) {
    logItineraryError("page.results.render_error", {
      itineraryId: itinerary.id,
      message: error instanceof Error ? error.message : "Unknown results page render error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return (
      <SiteShell title="Your trip is ready to shape." eyebrow="Results screen">
        <GlassCard className="p-6">
          <p className="text-sm leading-6 text-slate-600">
            We loaded your request, but the recommendation view could not be assembled cleanly.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Try returning to the prompt screen or refreshing after the current itinerary data is fixed.
          </p>
        </GlassCard>
      </SiteShell>
    );
  }
}
