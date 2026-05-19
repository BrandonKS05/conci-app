import { notFound } from "next/navigation";
import { SiteShell } from "@/frontend/components/site-shell";
import { GlassCard, Pill, PrimaryButton, SecondaryButton, SectionTitle } from "@/frontend/components/cards";
import { getRecommendationById } from "@/backend/itinerary-store";

export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { id } = await params;
  const recommendation = getRecommendationById(id);

  if (!recommendation) {
    notFound();
  }

  return (
    <SiteShell title={recommendation.title} eyebrow="Recommendation detail page">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <GlassCard className="overflow-hidden p-0">
          <div className="bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.82),rgba(79,70,229,0.84))] px-5 py-6 text-white sm:px-8 sm:py-8">
            <div className="flex items-center gap-3">
              <Pill>{recommendation.category}</Pill>
              <span className="text-sm text-white/70">Mock detail view for the MVP</span>
            </div>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/[0.78]">
              {recommendation.summary}
            </p>
          </div>

          <div className="space-y-5 p-5 sm:p-8">
            <SectionTitle
              title="Details"
              description="Everything the user needs to review before handing off."
            />
            {"airline" in recommendation.details ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Airline" value={recommendation.details.airline} />
                <Detail label="Route" value={recommendation.details.route} />
                <Detail label="Departure" value={recommendation.details.depart} />
                <Detail label="Arrival" value={recommendation.details.arrive} />
              </div>
            ) : "rating" in recommendation.details ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Cuisine" value={recommendation.details.cuisine} />
                <Detail label="Neighborhood" value={recommendation.details.neighborhood} />
                <Detail label="Rating" value={`${recommendation.details.rating.toFixed(1)} / 5`} />
                <Detail label="Price" value={recommendation.details.price} />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Type" value={recommendation.details.type} />
                <Detail label="Time" value={recommendation.details.time} />
                <Detail label="Location" value={recommendation.details.location} />
                <Detail label="Summary" value={recommendation.details.summary} />
              </div>
            )}
          </div>
        </GlassCard>

        <div className="grid gap-6">
          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="Actions" description="Keep the handoff lightweight and obvious." />
            <div className="flex flex-col gap-3">
              <PrimaryButton href="/booking">Send to booking handoff</PrimaryButton>
              <SecondaryButton href="/my-trips">Back to My Trips</SecondaryButton>
            </div>
          </GlassCard>

          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="Assistant note" />
            <p className="text-sm leading-6 text-[color:var(--on-surface-variant)]">
              This page is intentionally a detail-first view so the user can inspect one recommendation
              before committing to a booking step.
            </p>
          </GlassCard>
        </div>
      </div>
    </SiteShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[color:var(--hairline)] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-muted)]">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-ink">{value}</p>
    </div>
  );
}
