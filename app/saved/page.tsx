import { unstable_noStore as noStore } from "next/cache";
import { SiteShell } from "@/components/site-shell";
import { GlassCard, Pill, PrimaryButton, SecondaryButton, SectionTitle } from "@/components/cards";
import { getActiveItinerary } from "@/lib/itinerary-store";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  noStore();

  const itinerary = await getActiveItinerary();

  if (!itinerary) {
    return (
      <SiteShell title="Saved itinerary keeps the full trip in one place." eyebrow="Saved itinerary page">
        <GlassCard className="p-6">
          <p className="text-sm leading-6 text-slate-600">No itinerary has been created yet.</p>
        </GlassCard>
      </SiteShell>
    );
  }

  const activeItems = itinerary.itinerary_items.filter((item) => item.status === "active");
  const dateLabel =
    itinerary.start_date && itinerary.end_date
      ? `${itinerary.start_date} - ${itinerary.end_date}`
      : itinerary.start_date || itinerary.end_date || null;

  return (
    <SiteShell title="Saved itinerary keeps the full trip in one place." eyebrow="Saved itinerary page">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="overflow-hidden p-0">
          <div className="bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92),rgba(79,70,229,0.88))] px-5 py-6 text-white sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center gap-3">
              <Pill>{itinerary.prompt || "Current trip"}</Pill>
              <Pill>{dateLabel || "Flexible dates"}</Pill>
            </div>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
              Everything the user saved, in one polished snapshot.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/[0.76] sm:text-base">
              This page reflects the same canonical itinerary state as Results and Itinerary.
            </p>
          </div>

          <div className="space-y-5 p-5 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {activeItems.slice(0, 3).map((item) => (
                <SavedCard
                  key={item.id}
                  title={item.kind}
                  subtitle={item.title}
                  details={item.details}
                />
              ))}
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Notes
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {itinerary.selections.slice(-4).map((selection) => (
                  <li key={selection.id}>• {selection.status.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </div>
          </div>
        </GlassCard>

        <div className="grid gap-6">
          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="What this screen solves" />
            <p className="text-sm leading-6 text-slate-600">
              It gives the user one place to revisit the selected items, making the app feel helpful
              after the initial planning moment.
            </p>
          </GlassCard>

          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="Explore" />
            <div className="flex flex-col gap-3">
              <PrimaryButton href="/">Back to prompt</PrimaryButton>
              <SecondaryButton href="/results">See recommendations again</SecondaryButton>
            </div>
          </GlassCard>
        </div>
      </div>
    </SiteShell>
  );
}

function SavedCard({
  title,
  subtitle,
  details,
}: {
  title: string;
  subtitle: string;
  details: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <p className="mt-2 font-display text-lg font-semibold tracking-[-0.03em] text-ink">{subtitle}</p>
      <p className="mt-1 text-sm text-slate-500">{details}</p>
    </div>
  );
}
