import type { Metadata } from "next";
import Link from "next/link";
import { LandingTwPlusHero } from "@/frontend/components/landing-tw-plus-hero";
import { ScrollReveal } from "@/frontend/components/scroll-reveal";
import Image from "next/image";

const CREATE_URL = "/trip-parser";
const JOIN_WITH_CODE_URL = "/join?from=create";

export const metadata: Metadata = {
  title: "Conci · AI for group trips",
  description:
    "Describe the trip in one message. Conci's AI builds the full itinerary for your whole group. No spreadsheets, no twenty tabs.",
};

const steps = [
  {
    title: "Everyone has a voice",
    body: "Invite the group and let Conci do the interrogating. Everyone drops in their dates, budgets, dietary restrictions, and hotel preferences.",
  },
  {
    title: "AI builds the impossible",
    body: "Conci synthesizes the group's conflicting constraints and builds a complete, bookable itinerary. Say 'find a cheaper flight' and watch the calendar update.",
  },
  {
    title: "Seamless booking & money",
    body: "No more manual Venmo tracking. Conci tracks exactly who owes what, and provides direct booking links for every flight, hotel, and dinner.",
  },
];

const integrations = [
  "Google Flights",
  "Google Maps",
  "Google Places",
  "Booking.com",
  "Stripe",
];



const collabFeatures = [
  {
    title: "Direct booking links",
    body: "Conci doesn't just name a hotel. It provides the direct Booking.com link with the exact dates and guest count.",
  },
  {
    title: "Allergies & Preferences",
    body: "Tell Conci that Sarah is vegan and Mike hates early flights. It will quietly route around these constraints.",
  },
  {
    title: "Group Polls",
    body: "Need to choose between a catamaran tour or a cooking class? Conci drops a quick poll in the group dashboard.",
  },
];

const popularTrips = [
  {
    title: "Tokyo & Kyoto",
    subtitle: "10 days · Culture & Cuisine",
    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=2070&auto=format&fit=crop",
    query: "Plan a 10 day trip to Tokyo and Kyoto focusing on food and temples"
  },
  {
    title: "Amalfi Coast",
    subtitle: "7 days · Relaxation",
    image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=2069&auto=format&fit=crop",
    query: "Plan a 7 day relaxing trip to the Amalfi Coast"
  },
  {
    title: "Swiss Alps",
    subtitle: "5 days · Adventure",
    image: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?q=80&w=2070&auto=format&fit=crop",
    query: "Plan a 5 day adventure trip to the Swiss Alps"
  },
];

const hostJoinPaths = [
  {
    eyebrow: "For organizers",
    title: "Host a trip",
    body: "Start planning from a single sentence. Set the vibe, invite the crew, and let Conci handle the first draft straight through to final bookings.",
    href: CREATE_URL,
    cta: "Start a trip",
    accent: false,
  },
  {
    eyebrow: "For invited travelers",
    title: "Join with a code",
    body: "Enter your invite code, add your preferences, vote on the details, and chip in your share. The whole trip lives in one shared view.",
    href: JOIN_WITH_CODE_URL,
    cta: "Join with a code",
    accent: true,
  },
];

const memberRows = [
  {
    initials: "SL",
    name: "Sara",
    role: "host",
    pref: "Vegetarian, loves design hotels",
    status: "Contributed",
    statusTone: "good" as const,
    bg: "bg-[#7a8c6f]",
  },
  {
    initials: "MR",
    name: "Marcus",
    role: null,
    pref: "No shellfish, budget pace",
    status: "Contributed",
    statusTone: "good" as const,
    bg: "bg-[#6d6a85]",
  },
  {
    initials: "JK",
    name: "Jamie",
    role: null,
    pref: "Beach mornings, nightlife",
    status: "Pending",
    statusTone: "warn" as const,
    bg: "bg-[#a07861]",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[color:var(--surface-dim)] text-[color:var(--on-surface)] dark:bg-black dark:text-neutral-200">
      <LandingTwPlusHero />

      <div className="flex flex-col gap-4 bg-white dark:bg-black pt-4">
      {/* Integrations strip */}
      <section className="overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] py-6 shadow-sm dark:border-white/10 dark:bg-dm-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 sm:px-6 lg:px-8">
          <span className="label-caps text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            Works with
          </span>
          {integrations.map((name) => (
            <span
              key={name}
              className="font-display text-base font-semibold tracking-tight text-[color:var(--on-surface-variant)]/70 dark:text-neutral-400 sm:text-lg"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Preset Popular Trips - Layla.ai inspired */}
      <section className="relative overflow-hidden border-y border-[color:var(--hairline)] bg-gradient-to-b from-[#e3f2fd] to-[#f8fbff] py-32 shadow-sm sm:py-40 dark:border-white/5 dark:from-[#0f172a] dark:to-[#050505]">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mb-16 max-w-3xl">
            <h2 className="font-display text-4xl font-medium tracking-tight text-[color:var(--on-surface)] dark:text-white sm:text-6xl">
              Start a trip instantly.
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400">
              Select a popular destination below and Conci will instantly generate a full, bookable itinerary.
            </p>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {popularTrips.map((trip, idx) => (
              <ScrollReveal key={trip.title} delay={idx * 0.1} className="group relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-neutral-900">
                <Link href={`/trip-parser?q=${encodeURIComponent(trip.query)}`} className="absolute inset-0 z-20" aria-label={`Start trip to ${trip.title}`} />
                <Image
                  src={trip.image}
                  alt={trip.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <p className="mb-2 text-sm font-semibold tracking-widest text-white/70 uppercase">
                    {trip.subtitle}
                  </p>
                  <h3 className="font-display text-3xl font-medium text-white">
                    {trip.title}
                  </h3>
                  <div className="mt-6 flex items-center gap-2 text-sm font-medium text-white opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 translate-y-4">
                    Start planning <span aria-hidden="true">&rarr;</span>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — vertical, all three fit in one viewport */}
      <section className="relative overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface)] py-16 shadow-sm dark:border-white/5 dark:bg-dm-card sm:py-20">
        <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-8">
          <div className="divide-y divide-[color:var(--hairline)] dark:divide-white/5">
            {steps.map((step, i) => (
              <ScrollReveal key={step.title} delay={i * 0.08} direction="up"
                className="flex items-center gap-8 py-8 sm:gap-12 sm:py-10">
                {/* Number tile */}
                <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-gradient-to-tr from-[color:var(--surface-container)] to-[color:var(--surface-container-lowest)] shadow-sm dark:border-white/5 dark:from-[#151515] dark:to-[#1a1a1a]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,var(--sage)_0%,transparent_55%)] opacity-10 blur-2xl dark:opacity-5" />
                  <span className="font-display text-3xl font-semibold mix-blend-multiply dark:mix-blend-screen" style={{ color: "color-mix(in srgb, var(--sage) 30%, transparent)" }}>
                    0{i + 1}
                  </span>
                </div>
                {/* Text */}
                <div className="flex-1">
                  <span className="label-caps mb-1.5 block text-[11px] tracking-[0.2em] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
                    Step 0{i + 1}
                  </span>
                  <h3 className="font-display text-xl font-medium tracking-tight text-[color:var(--on-surface)] dark:text-white sm:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-400 sm:text-base">
                    {step.body}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Built for groups, collaboration */}
      <section className="overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface)] py-32 shadow-sm dark:border-white/5 dark:bg-dm-card sm:py-40">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
          <div>
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
              Built for groups
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              Everyone has a voice. <span className="italic">No one is overwhelmed.</span>
            </h2>
            <ul className="mt-12 space-y-8 border-t border-[color:var(--hairline)] pt-8 dark:border-white/10">
              {collabFeatures.map((item) => (
                <li
                  key={item.title}
                  className="group flex flex-col"
                >
                  <h3 className="font-display text-lg font-medium tracking-tight text-[color:var(--on-surface)] dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <GroupCollabMockup />
        </div>
      </section>

      {/* Example */}
      <section
        id="example"
        className="scroll-mt-24 overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface)] py-32 shadow-sm dark:border-white/5 dark:bg-dm-card sm:py-40"
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
              Example
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              What you get back
            </h2>
            <p className="mt-4 text-lg text-[color:var(--on-surface-variant)] dark:text-slate-400">
              One shared plan. Day-by-day itinerary, group preferences, AI-picked dates, and live cost in one view.
            </p>
          </div>

          <ExampleTripMockup />

          <p className="mx-auto mt-12 max-w-md text-center text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
            One shared plan · friends join with an invite code · the plan keeps updating itself as you go
          </p>
        </div>
      </section>

      {/* Host vs Join */}
      <section className="overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface)] py-32 shadow-sm dark:border-white/5 dark:bg-dm-card sm:py-40">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
              Get started
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              Host or join, <span className="italic">always free to plan.</span>
            </h2>
            <p className="mt-4 text-base text-[color:var(--on-surface-variant)] dark:text-slate-400">
              Pick the path that fits. Your whole group plans together in one place.
            </p>
          </div>

          <div className="mx-auto mt-20 grid max-w-5xl gap-x-8 gap-y-12 sm:grid-cols-2">
            {hostJoinPaths.map((path, idx) => (
              <ScrollReveal
                key={path.title}
                delay={idx * 0.1}
                direction="up"
                className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-[color:var(--hairline)] bg-gradient-to-b from-[color:var(--surface-container-lowest)] to-[color:var(--surface)] p-10 transition-all hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:from-[#1a1a1a] dark:to-[#121212]"
              >
                <Link href={path.href} className="absolute inset-0 z-20" aria-label={path.cta} />
                <div className="absolute inset-0 bg-gradient-to-tr from-[color:var(--sage)]/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10 flex flex-col h-full">
                  <span className="label-caps mb-6 text-[10px] tracking-[0.2em] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    {path.eyebrow}
                  </span>
                  <h3 className="font-display text-3xl font-medium tracking-tight text-[color:var(--on-surface)] dark:text-white">
                    {path.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
                    {path.body}
                  </p>
                  <span className="mt-12 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-[color:var(--on-surface)] transition group-hover:text-[color:var(--sage)] dark:text-white">
                    {path.cta}
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-2">→</span>
                  </span>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface)] px-5 pb-24 pt-12 shadow-sm dark:border-white/5 dark:bg-dm-card sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#1c1c17] px-6 py-20 text-center shadow-[var(--shadow-ambient-lg)] sm:px-10 sm:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_20%_30%,rgba(199,201,179,0.18),transparent_60%),radial-gradient(ellipse_40%_60%_at_85%_85%,rgba(155,157,130,0.18),transparent_60%)]"
          />
          <div className="relative mx-auto max-w-2xl">
            <p className="label-caps text-[color:var(--sage-soft)]">Ready when you are</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--surface)] sm:text-5xl">
              Your next group trip is one <span className="italic">conversation</span> away.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/70">
              Stop planning in the group chat. Start in Conci.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href={CREATE_URL}
                className="inline-flex items-center justify-center rounded-full bg-[color:var(--surface)] px-6 py-3 text-sm font-semibold tracking-wide text-[#1c1c17] shadow-[var(--shadow-ambient-sm)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c17]"
              >
                Start a trip
              </Link>
              <Link
                href={JOIN_WITH_CODE_URL}
                className="inline-flex items-center justify-center rounded-full border border-white/25 bg-transparent px-6 py-3 text-sm font-medium tracking-wide text-white transition hover:border-white/50 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c17]"
              >
                Join with a code
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="overflow-hidden border-y border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] py-10 shadow-sm dark:border-white/10 dark:bg-dm-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">
                Conci
              </span>
            </div>
            <Link
              href={CREATE_URL}
              className="font-medium text-[color:var(--on-surface)] underline-offset-2 hover:underline dark:text-neutral-300"
            >
              Start a trip
            </Link>
            <Link
              href={JOIN_WITH_CODE_URL}
              className="font-medium text-[color:var(--on-surface)] underline-offset-2 hover:underline dark:text-neutral-300"
            >
              Join with a code
            </Link>
            <Link
              href="/privacy"
              className="underline-offset-2 hover:underline hover:text-[color:var(--on-surface)] dark:hover:text-neutral-300"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="underline-offset-2 hover:underline hover:text-[color:var(--on-surface)] dark:hover:text-neutral-300"
            >
              Terms of Service
            </Link>
          </div>
          <p>© {new Date().getFullYear()} Conci</p>
        </div>
      </footer>

      </div>
    </div>
  );
}

function ExampleTripMockup() {
  const days = [
    { label: "Day 1 · May 16", title: "Flight to LIS · TAP 204", sub: "Departs 7:45 PM · 7h 10m" },
    { label: "Day 2 · May 17", title: "Hotel Bairro Alto · Alfama walks", sub: "Check in by noon · sunset terrace" },
    { label: "Day 3 · May 18", title: "Belém district · fado at 9 PM", sub: "Group voted · 3 of 4 yes" },
    { label: "Day 4 · May 19", title: "Flight home · TAP 217", sub: "Departs 11:20 AM · evening landing" },
  ];

  return (
    <div aria-hidden className="mt-14">
      {/* Narrow screens: clean stacked column */}
      <div className="mx-auto grid max-w-md gap-4 md:hidden">
        <ExampleMainCard days={days} />
        <ExamplePrefsCard />
        <div className="grid grid-cols-2 gap-3">
          <ExampleCostCard />
          <ExampleAIDatesCard />
        </div>
      </div>

      {/* md+: three-column row. Left column holds preferences + cost stacked
          and spread vertically to match the main card's height. Middle column
          is the main itinerary. Right column is the AI dates card, centered
          vertically. No overlapping anywhere. */}
      <div className="mx-auto hidden w-full max-w-[1080px] items-stretch gap-6 md:flex relative">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[color:var(--sage)]/20 rounded-full blur-[100px] pointer-events-none dark:bg-[color:var(--sage)]/10" />
        
        <aside className="flex w-[260px] flex-shrink-0 flex-col justify-between gap-5 relative z-10">
          <ScrollReveal delay={0.1} direction="left"><ExamplePrefsCard /></ScrollReveal>
          <ScrollReveal delay={0.2} direction="left"><ExampleCostCard /></ScrollReveal>
        </aside>

        <ScrollReveal delay={0.3} direction="up" className="w-[440px] flex-shrink-0 relative z-10">
          <ExampleMainCard days={days} />
        </ScrollReveal>

        <aside className="flex w-[280px] flex-shrink-0 flex-col justify-center relative z-10">
          <ScrollReveal delay={0.4} direction="right"><ExampleAIDatesCard /></ScrollReveal>
        </aside>
      </div>
    </div>
  );
}

function ExampleMainCard({
  days,
}: {
  days: Array<{ label: string; title: string; sub: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-[var(--shadow-ambient-lg)] dark:border-white/10 dark:bg-dm-card">
      <div className="flex items-center gap-3 bg-[#1c1c17] px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--sage)] font-display text-sm font-semibold text-[#1c1c17]">
          L
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold tracking-tight text-white">
            Lisbon · 4 days
          </p>
          <p className="mt-0.5 text-[11px] text-white/60">
            4 travelers · May 16 to 19
          </p>
        </div>
        <span className="ml-auto rounded-full bg-[color:var(--sage)]/25 px-3 py-1 text-[11px] font-semibold tracking-wide text-[color:var(--sage-soft)]">
          ~$840/pp
        </span>
      </div>
      <ul className="px-5 py-2">
        {days.map((row, idx) => (
          <li
            key={row.label}
            className={`flex items-start gap-3 py-3 ${
              idx < days.length - 1 ? "border-b border-[color:var(--hairline)]" : ""
            }`}
          >
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--sage)]" />
            <div className="min-w-0 flex-1">
              <p className="label-caps text-[10px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                {row.label}
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-[color:var(--on-surface)] dark:text-neutral-100">
                {row.title}
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                {row.sub}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mx-5 mb-5 mt-2 flex items-center gap-2 rounded-xl bg-[color:var(--surface-container-low)] px-3 py-2 dark:bg-dm-elevated">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#1c1c17] text-[10px] text-[color:var(--sage-soft)]">
          ✦
        </span>
        <span className="flex-1 text-[11px] text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          Find a cheaper hotel for Friday night
        </span>
      </div>
    </div>
  );
}

function ExamplePrefsCard() {
  const chips: Array<{ icon: string; label: string; accent?: boolean }> = [
    { icon: "🏖️", label: "Beach mornings" },
    { icon: "🦐", label: "No shellfish", accent: true },
    { icon: "🎶", label: "Nightlife" },
    { icon: "💰", label: "Budget pace" },
    { icon: "🏛️", label: "Cultural" },
  ];
  return (
    <div className="rounded-2xl bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient-lg)] dark:bg-dm-card">
      <p className="label-caps text-[10px] tracking-[0.18em] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        Group preferences
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={
              chip.accent
                ? "inline-flex items-center gap-1.5 rounded-full bg-[#f3d6cd] px-3 py-1.5 text-[12px] font-medium text-[#a0463a]"
                : "inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-container-high)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--on-surface)] dark:bg-dm-elevated dark:text-neutral-200"
            }
          >
            <span aria-hidden className="text-[12px] leading-none">
              {chip.icon}
            </span>
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExampleAIDatesCard() {
  const alternates: Array<{ range: string; reason: string }> = [
    { range: "May 23 to 26", reason: "Marcus busy Thu" },
    { range: "Jun 6 to 9", reason: "Flights +$220" },
  ];
  return (
    <div className="rounded-2xl bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient-lg)] dark:bg-dm-card">
      <p className="label-caps inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
        <span aria-hidden>✦</span> Conci picked these dates
      </p>
      <div className="mt-4 rounded-xl bg-[color:var(--surface-container-low)] px-4 py-3 ring-1 ring-[color:var(--sage)]/30 dark:bg-dm-elevated dark:ring-[color:var(--sage-soft)]/25">
        <p className="font-display text-[18px] font-semibold leading-tight tracking-tight text-[color:var(--on-surface)] dark:text-neutral-100">
          May 16 to 19
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          Everyone&apos;s free, flights run ~$120 cheaper, and the forecast is the warmest of the three options.
        </p>
      </div>
      <p className="mt-4 label-caps text-[10px] tracking-[0.18em] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        Why not the others
      </p>
      <ul className="mt-2 space-y-2">
        {alternates.map((alt) => (
          <li
            key={alt.range}
            className="flex items-center justify-between gap-3 rounded-lg bg-[color:var(--surface-container)] px-3 py-2 dark:bg-dm-elevated"
          >
            <span className="text-[12px] font-medium text-[color:var(--on-surface-variant)] dark:text-neutral-300">
              {alt.range}
            </span>
            <span className="text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
              {alt.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExampleCostCard() {
  return (
    <div className="rounded-2xl bg-[color:var(--surface-container-lowest)] p-6 shadow-[var(--shadow-ambient-lg)] dark:bg-dm-card">
      <p className="label-caps text-[10px] tracking-[0.18em] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
        Est. per person
      </p>
      <p className="mt-2 font-display text-[34px] font-semibold leading-none tracking-tight text-[color:var(--on-surface)] dark:text-neutral-100">
        $840
      </p>
      <p className="mt-2 text-[12px] text-[color:var(--on-surface-muted)] dark:text-neutral-400">
        3 of 4 contributed
      </p>
      <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-[color:var(--surface-container-high)] dark:bg-dm-elevated">
        <div className="h-full w-[75%] rounded-full bg-[color:var(--sage)]" />
      </div>
    </div>
  );
}

function GroupCollabMockup() {
  return (
    <ScrollReveal delay={0.2} direction="left" className="relative">
      <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-tr from-[color:var(--sage)]/20 to-transparent blur-2xl dark:from-[color:var(--sage-soft)]/10 pointer-events-none" />
      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/60 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#151515]/80 sm:p-8"
      >
        <div className="absolute inset-0 rounded-[2.5rem] ring-1 ring-inset ring-white/20 pointer-events-none" />
        <div className="flex items-center justify-between border-b border-[color:var(--hairline)] pb-4 dark:border-white/10">
        <p className="font-display text-lg font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
          Lisbon · 4 travelers
        </p>
        <span className="rounded-full bg-[color:var(--sage)]/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-[color:var(--on-sage)] dark:bg-[color:var(--sage)]/20 dark:text-[color:var(--sage-soft)]">
          3 of 4 contributed
        </span>
      </div>

      <div className="mt-2 flex flex-col">
        {memberRows.map((member) => (
          <div
            key={member.initials}
            className="flex items-center gap-4 border-b border-[color:var(--hairline)] py-4 last:border-0 dark:border-white/5"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide text-white ${member.bg}`}
            >
              {member.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[color:var(--on-surface)] dark:text-neutral-100">
                {member.name}
                {member.role ? (
                  <span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                    · {member.role}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--on-surface-muted)] dark:text-neutral-400">
                {member.pref}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${
                member.statusTone === "good"
                  ? "bg-[color:var(--sage)]/20 text-[color:var(--on-sage)] dark:bg-[color:var(--sage)]/25 dark:text-[color:var(--sage-soft)]"
                  : "bg-[color:var(--surface-container-high)] text-[color:var(--on-surface-variant)] dark:bg-dm-page dark:text-neutral-400"
              }`}
            >
              {member.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-[color:var(--surface-container)] p-5 dark:bg-[#1a1a1a]">
        <p className="label-caps flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
          <span aria-hidden>✦</span> Conci suggestion
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          Marcus flagged the Day 3 restaurant (it has shellfish). I found <strong className="font-medium text-[color:var(--on-surface)] dark:text-white">Bodega da Mouraria</strong>, similar vibe, allergy-friendly, about $15 less per person. Swap it?
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#1c1c17] px-4 py-2 text-[11px] font-semibold tracking-wide text-[color:var(--surface)] transition hover:bg-[#2a2a23] dark:bg-white dark:text-[#1c1c17] dark:hover:bg-neutral-200">
            Accept change
          </span>
          <span className="rounded-full border border-[color:var(--hairline-strong)] px-4 py-2 text-[11px] font-medium tracking-wide text-[color:var(--on-surface-variant)] transition hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/5">
            Keep original
          </span>
        </div>
      </div>
      </div>
    </ScrollReveal>
  );
}
