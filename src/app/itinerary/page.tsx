import { unstable_noStore as noStore } from "next/cache";
import { SiteShell } from "@/frontend/components/site-shell";
import { GlassCard, Pill, SectionTitle } from "@/frontend/components/cards";
import { ItineraryWorkspace } from "@/frontend/components/itinerary-workspace";
import { buildItineraryScreenData, getActiveItinerary } from "@/backend/itinerary-store";

export const dynamic = "force-dynamic";

export default async function ItineraryPage() {
  noStore();

  const itinerary = await getActiveItinerary();

  if (!itinerary) {
    return (
      <SiteShell title="Your itinerary will appear here." eyebrow="Itinerary page">
        <GlassCard className="p-6">
          <p className="text-sm leading-6 text-slate-600">
            Go back to the prompt screen and submit a request to create the current plan.
          </p>
        </GlassCard>
      </SiteShell>
    );
  }

  const screenData = buildItineraryScreenData(itinerary);

  return (
    <SiteShell title="Itinerary editor" eyebrow="Itinerary page">
      <div className="grid gap-6">
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <Pill>{itinerary.category}</Pill>
              <Pill>{itinerary.guest_count} guests</Pill>
              <Pill>{itinerary.budget}</Pill>
            </div>
            <SectionTitle
              title="A shared, editable plan"
              description="This page reads the same canonical itinerary as Results."
            />
          </div>
        </GlassCard>

        <ItineraryWorkspace screenData={screenData} />
      </div>
    </SiteShell>
  );
}

