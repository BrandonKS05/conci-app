import type { Metadata } from "next";
import Link from "next/link";
import { LandingTwPlusHero } from "@/frontend/components/landing-tw-plus-hero";

const CREATE_URL = "/trip-parser";
const JOIN_WITH_CODE_URL = "/join?from=create";

export const metadata: Metadata = {
  title: "Conci · AI for group trips",
  description:
    "Describe the trip in one message. Conci's AI builds the full itinerary for your whole group. No spreadsheets, no twenty tabs.",
};

const steps = [
  {
    title: "Describe the trip in one message",
    body: "Paste your group chat, drop a link, or write a sentence. Conci reads it, fills the gaps, and asks only what it actually needs.",
  },
  {
    title: "AI builds the full itinerary for you",
    body: "Dates, destinations, stays, and day-by-day plans appear instantly, already shaped by everyone's preferences.",
  },
  {
    title: "Invite the group with a single code",
    body: "Friends join with an invite code, drop their preferences, and vote. The plan keeps updating itself as you go.",
  },
];

const integrations = [
  "Google Flights",
  "Google Maps",
  "Google Places",
  "Booking.com",
  "Stripe",
];

const features = [
  {
    title: "Full itinerary from one prompt",
    body: "Describe the trip in plain language. Conci returns flights, stays, dining, and experiences day by day, already pre-filled.",
  },
  {
    title: "Live cost estimator",
    body: "Specific costs for flights and hotels, sensible estimates for dining. Conci keeps a running total per person as the plan changes.",
  },
  {
    title: "Preference blending",
    body: "One person needs beachfront. Another has a shellfish allergy. Another is budget-conscious. Conci synthesizes constraints into one plan that actually works.",
  },
  {
    title: "AI that edits, not just suggests",
    body: "Ask Conci to swap a hotel, move dinner, or find a cheaper flight, and it updates the itinerary in place. The chat does the work, not your notes app.",
  },
  {
    title: "Date voting & group calendar",
    body: "Send out a date poll or let everyone drop their availability. Conci proposes the window where the most people are free.",
  },
  {
    title: "Direct booking links",
    body: "Every hotel, flight, restaurant, and experience card links straight to the source. The host sees everything in one place and can book through.",
  },
];

const collabFeatures = [
  {
    title: "Vote on anything",
    body: "Dates, hotels, day plans, restaurants. Anyone in the group can vote. Conci tracks consensus and nudges the itinerary toward what everyone actually wants.",
  },
  {
    title: "Pooled contributions, one place",
    body: "Everyone contributes their share to the trip fund. The host sees a clear view of who has paid and can pull from the pool to book.",
  },
  {
    title: "Group memory across trips",
    body: "Conci remembers your group. Dietary needs, budget comfort, preferred hotel tier, pace, and applies that context the next time you plan.",
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
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-dm-page dark:text-neutral-200">
      <LandingTwPlusHero />

      {/* Integrations strip */}
      <section className="border-y border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] py-6 dark:border-white/10 dark:bg-dm-card">
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

      {/* How it works */}
      <section className="relative border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] py-24 dark:border-white/10 dark:bg-dm-elevated sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              Three steps from group chat to plan
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
              No blank canvas. No spreadsheets. No twenty tabs.
            </p>
          </div>

          <ol className="mt-16 grid gap-12 lg:mt-20 lg:grid-cols-3 lg:gap-10">
            {steps.map((step, i) => (
              <li key={step.title} className="relative">
                <span className="mb-5 inline-flex font-display text-5xl font-semibold leading-none text-[color:var(--sage-soft)] dark:text-[color:var(--sage)]/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What Conci does, feature grid */}
      <section className="border-t border-[color:var(--hairline)] bg-[color:var(--surface)] py-24 dark:border-white/10 dark:bg-dm-page sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
                What Conci does
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
                The AI that actually <span className="italic">does the trip.</span>
              </h2>
            </div>
            <p className="max-w-sm text-sm text-[color:var(--on-surface-variant)] dark:text-slate-400">
              Conci doesn&apos;t just suggest ideas. It writes the plan, blends the group, tracks the money, and links the bookings.
            </p>
          </div>

          <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-8">
            {features.map((item) => (
              <li
                key={item.title}
                className="group relative rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-7 shadow-[var(--shadow-ambient-sm)] transition duration-300 hover:border-[color:var(--hairline-strong)] hover:shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card"
              >
                <span className="mb-5 block h-[3px] w-8 rounded-full bg-[color:var(--sage)]" />
                <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Built for groups, collaboration */}
      <section className="border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] py-24 dark:border-white/10 dark:bg-dm-elevated sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
          <div>
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
              Built for groups
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              Everyone has a voice. <span className="italic">No one is overwhelmed.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {collabFeatures.map((item) => (
                <li
                  key={item.title}
                  className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-5 shadow-[var(--shadow-ambient-sm)] transition duration-300 hover:border-[color:var(--hairline-strong)] dark:border-white/10 dark:bg-dm-card"
                >
                  <h3 className="font-display text-base font-semibold text-[color:var(--on-surface)] dark:text-white">
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
        className="scroll-mt-24 border-t border-[color:var(--hairline)] bg-[color:var(--surface)] py-24 dark:border-white/10 dark:bg-dm-page sm:py-28"
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
      <section className="border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] py-24 dark:border-white/10 dark:bg-dm-elevated sm:py-28">
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

          <div className="mx-auto mt-14 grid max-w-3xl gap-5 sm:grid-cols-2">
            {hostJoinPaths.map((path) => (
              <Link
                key={path.title}
                href={path.href}
                className={`group flex flex-col gap-5 rounded-2xl border bg-[color:var(--surface-container-lowest)] p-7 shadow-[var(--shadow-ambient-sm)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-ambient)] dark:bg-dm-card ${
                  path.accent
                    ? "border-[color:var(--sage)]/60 dark:border-[color:var(--sage-soft)]/40"
                    : "border-[color:var(--hairline-strong)] dark:border-white/10"
                }`}
              >
                <span
                  className={`label-caps ${
                    path.accent
                      ? "text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]"
                      : "text-[color:var(--on-surface-muted)] dark:text-neutral-500"
                  }`}
                >
                  {path.eyebrow}
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
                    {path.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
                    {path.body}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--on-surface)] transition group-hover:text-[color:var(--sage)] dark:text-white">
                  {path.cta}
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[color:var(--surface)] px-5 pb-24 pt-12 dark:bg-dm-page sm:px-6 lg:px-8">
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

      <footer className="border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] py-10 dark:border-white/10 dark:bg-dm-page">
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
          </div>
          <p>© {new Date().getFullYear()} Conci</p>
        </div>
      </footer>

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
      <div className="mx-auto hidden w-full max-w-[1080px] items-stretch gap-6 md:flex">
        <aside className="flex w-[260px] flex-shrink-0 flex-col justify-between gap-5">
          <ExamplePrefsCard />
          <ExampleCostCard />
        </aside>

        <div className="w-[440px] flex-shrink-0">
          <ExampleMainCard days={days} />
        </div>

        <aside className="flex w-[280px] flex-shrink-0 flex-col justify-center">
          <ExampleAIDatesCard />
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
    <div
      aria-hidden="true"
      className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-5 shadow-[var(--shadow-ambient-lg)] dark:border-white/10 dark:bg-dm-card sm:p-6"
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-semibold text-[color:var(--on-surface)] dark:text-white">
          Lisbon · 4 travelers
        </p>
        <span className="rounded-full bg-[color:var(--sage)]/20 px-3 py-1 text-[11px] font-semibold tracking-wide text-[color:var(--on-sage)] dark:bg-[color:var(--sage)]/25 dark:text-[color:var(--sage-soft)]">
          3 of 4 contributed
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {memberRows.map((member) => (
          <div
            key={member.initials}
            className="flex items-center gap-3 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3.5 py-3 dark:border-white/10 dark:bg-dm-elevated"
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

      <div className="mt-4 rounded-xl border border-[color:var(--sage)]/30 bg-gradient-to-br from-[color:var(--surface-container)] to-[color:var(--surface-container-lowest)] p-4 dark:border-[color:var(--sage-soft)]/25 dark:from-dm-elevated dark:to-dm-card">
        <p className="label-caps flex items-center gap-1.5 text-[10px] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
          <span aria-hidden>✦</span> Conci suggestion
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          Marcus flagged the Day 3 restaurant (it has shellfish). I found <strong className="font-semibold text-[color:var(--on-surface)] dark:text-white">Bodega da Mouraria</strong>, similar vibe, allergy-friendly, about $15 less per person. Swap it?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-[#1c1c17] px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[color:var(--surface)] dark:bg-[#ebe9e4] dark:text-[#141414]">
            Accept change
          </span>
          <span className="rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-1.5 text-[11px] font-medium tracking-wide text-[color:var(--on-surface-variant)] dark:border-white/15 dark:bg-dm-elevated dark:text-neutral-300">
            Keep original
          </span>
        </div>
      </div>
    </div>
  );
}
