import { SiteShell } from "@/frontend/components/site-shell";
import { CalendarDayStandalone } from "@/frontend/components/trip-calendar-demo";

export default async function CalendarDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;

  return (
    <SiteShell title="Day itinerary" eyebrow="Planning surface · standalone day" contentWide tripTypography>
      <div className="pb-24">
        <CalendarDayStandalone dateParam={params.date ?? null} />
      </div>
    </SiteShell>
  );
}
