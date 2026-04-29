import { unstable_noStore as noStore } from "next/cache";
import { SiteShell } from "@/components/site-shell";
import { GlassCard, Pill, PrimaryButton, SecondaryButton, SectionTitle } from "@/components/cards";
import { getActiveItinerary } from "@/lib/itinerary-store";

export const dynamic = "force-dynamic";

export default async function BookingPage() {
  noStore();

  const itinerary = await getActiveItinerary();

  if (!itinerary) {
    return (
      <SiteShell title="Hand off to booking without losing context." eyebrow="Booking handoff page">
        <GlassCard className="p-6">
          <p className="text-sm leading-6 text-slate-600">No itinerary is active yet.</p>
        </GlassCard>
      </SiteShell>
    );
  }

  const activeItems = itinerary.itinerary_items.filter((item) => item.status === "active").slice(0, 3);
  const isSingleStep = itinerary.parsed_request.flow_mode === "single_step";
  const primaryItem = activeItems[0] || null;
  const handoffNotes = uniqueSelectionNotes(itinerary.selections, isSingleStep);
  const dateLabel =
    itinerary.start_date && itinerary.end_date
      ? `${itinerary.start_date} - ${itinerary.end_date}`
      : itinerary.start_date || itinerary.end_date || null;

  return (
    <SiteShell title="Hand off to booking without losing context." eyebrow="Booking handoff page">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <Pill>{itinerary.prompt || "Current trip"}</Pill>
              <Pill>{dateLabel || "Flexible dates"}</Pill>
            </div>
            <SectionTitle
              title="Ready for a human or partner system to complete"
              description="The canonical itinerary stays intact as the plan moves into handoff."
            />
          </div>

          <div className="space-y-5 p-5 sm:p-8">
            {isSingleStep && primaryItem ? (
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Next action
                </p>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-ink">
                  {primaryItem.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{primaryItem.details}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{primaryItem.meta}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Pill>{primaryItem.kind}</Pill>
                  <Pill>{dateLabel || itinerary.time_hint || "Flexible timing"}</Pill>
                  <Pill>{itinerary.budget}</Pill>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeItems.map((item) => (
                  <Summary key={item.id} label={item.kind} value={item.title} />
                ))}
                <Summary label="Guests" value={`${itinerary.guest_count}`} />
                <Summary label="Budget" value={itinerary.budget} />
              </div>
            )}

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Handoff notes
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {handoffNotes.map((note) => (
                  <li key={note.id}>• {note.label}</li>
                ))}
              </ul>
            </div>
          </div>
        </GlassCard>

        <div className="grid gap-6">
          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="Status" description="This remains mock-only for bookings." />
            <p className="text-sm leading-6 text-slate-600">
              No external APIs are connected yet. This screen exists so product and design can test
              the booking transfer mental model.
            </p>
          </GlassCard>

          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="Continue" />
            <div className="flex flex-col gap-3">
              <PrimaryButton href="/saved">
                {isSingleStep ? "Continue with this recommendation" : "Open saved itinerary"}
              </PrimaryButton>
              <SecondaryButton href="/results">Review recommendations</SecondaryButton>
            </div>
          </GlassCard>
        </div>
      </div>
    </SiteShell>
  );
}

function uniqueSelectionNotes(
  selections: { id: string; status: string; itinerary_item_id: string | null }[],
  singleStep: boolean
) {
  const seen = new Set<string>();

  return selections
    .slice()
    .reverse()
    .map((selection) => {
      const label = noteLabel(selection, singleStep);
      const key = `${selection.status}:${selection.itinerary_item_id || "all"}:${label}`;
      return { id: selection.id, label, key };
    })
    .filter((note) => {
      if (seen.has(note.key)) {
        return false;
      }
      seen.add(note.key);
      return true;
    })
    .slice(0, singleStep ? 1 : 3)
    .reverse();
}

function noteLabel(
  selection: { status: string },
  singleStep: boolean
) {
  if (singleStep) {
    return "Continue with this recommendation";
  }

  switch (selection.status) {
    case "replace_item":
      return "Replaced an item";
    case "remove_item":
      return "Removed an item";
    case "move_item":
      return "Reordered a step";
    case "edit_item":
      return "Edited a step";
    case "adjust_budget":
      return "Adjusted budget";
    case "change_guest_count":
      return "Updated guest count";
    case "make_itinerary_shorter":
      return "Made the itinerary shorter";
    case "regenerate_all":
      return "Regenerated the itinerary";
    default:
      return "Updated the plan";
  }
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-ink">{value}</p>
    </div>
  );
}
