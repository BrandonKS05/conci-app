import type { Metadata } from "next";
import Link from "next/link";
import { LandingTwPlusHero } from "@/frontend/components/landing-tw-plus-hero";
import { primaryHeroEmphasisLinkClass } from "@/frontend/ui/primary-action";

const JOIN_WITH_CODE_URL = "https://conci-app-wine.vercel.app/join?from=create";

export const metadata: Metadata = {
  title: "Conci — Group trips, planned",
  description:
    "Paste a text, link, or screenshot. Turn messy group chats into a shareable trip plan in seconds.",
};

const steps = [
  {
    title: "Paste your group chat or describe your trip",
    body: "Drop the chaos—screenshots, links, or a quick voice-style paragraph. We read between the lines.",
  },
  {
    title: "AI builds a structured plan card instantly",
    body: "Destinations, dates, and decisions surface as a clean itinerary you can actually act on.",
  },
  {
    title: "Share with friends, vote on dates, book together",
    body: "One link for the group. Align on timing before anyone opens ten booking tabs.",
  },
];

const differentiators = [
  {
    title: "Not just suggestions — actual decisions",
    body: "Move from “ideas” to picked dates, stops, and next steps your group can commit to.",
  },
  {
    title: "No app download for your friends",
    body: "Share a link. They vote, comment, or just view—no installs, no accounts required to follow along.",
  },
  {
    title: "Remembers your group's preferences over time",
    body: "Budget vibes, pace, and deal-breakers carry forward so every trip feels less like starting from zero.",
  },
  {
    title: "Money and commitment built in",
    body: "Surface costs and milestones early so the group aligns before deposits and deadlines sneak up.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-dm-page dark:text-neutral-200">
      <LandingTwPlusHero />

      {/* How it works */}
      <section className="relative border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] py-24 dark:border-white/10 dark:bg-dm-elevated sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">How it works</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              From chat dump to clear plan
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">
              Three steps. No blank canvas.
            </p>
          </div>

          <ol className="mt-16 grid gap-12 lg:mt-20 lg:grid-cols-3 lg:gap-10">
            {steps.map((step, i) => (
              <li key={step.title} className="relative">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] text-sm font-semibold text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  {i + 1}
                </span>
                <h3 className="font-display text-xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why it's different */}
      <section className="border-t border-[color:var(--hairline)] bg-[color:var(--surface)] py-24 dark:border-white/10 dark:bg-dm-page sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Why it&apos;s different</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              Built for groups that actually travel
            </h2>
          </div>

          <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:gap-8">
            {differentiators.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-8 shadow-[var(--shadow-ambient-sm)] transition duration-300 hover:border-[color:var(--hairline-strong)] hover:shadow-[var(--shadow-ambient-lg)] dark:border-slate-700/90 dark:bg-slate-800/60 dark:hover:border-slate-600"
              >
                <h3 className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-400">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Example */}
      <section
        id="example"
        className="scroll-mt-24 border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] py-24 dark:border-white/10 dark:bg-dm-elevated sm:py-28"
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Example</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-4xl">
              What you get back
            </h2>
            <p className="mt-4 text-lg text-[color:var(--on-surface-variant)] dark:text-slate-400">
              A single shareable card your group can rally around—not another endless thread.
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-lg">
            <div className="overflow-hidden rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card dark:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)]">
              <div className="border-b border-[color:var(--hairline)] bg-gradient-to-br from-[color:var(--surface-container)] to-[color:var(--surface-container-lowest)] px-6 py-5 dark:border-white/10 dark:from-dm-elevated dark:to-dm-card sm:px-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[color:var(--sage)]/40 bg-[color:var(--surface-container-low)] px-3 py-1 text-xs font-medium text-[color:var(--on-surface)] dark:border-[color:var(--sage-soft)]/30 dark:bg-dm-page dark:text-neutral-200">
                    Lisbon long weekend
                  </span>
                  <span className="rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-1 text-xs font-medium text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-dm-page dark:text-neutral-400">
                    May 16–19 · 4 people
                  </span>
                </div>
                <p className="mt-4 font-display text-xl font-semibold text-[color:var(--on-surface)] dark:text-white">
                  Alfama walks · sunset river · one splurge dinner
                </p>
              </div>
              <ul className="divide-y divide-[color:var(--hairline)] px-6 py-2 dark:divide-white/10 sm:px-8">
                {[
                  { t: "Thu", d: "Arrive PM · Baxia stay · tapas crawl (casual)" },
                  { t: "Fri", d: "Tiles & viewpoints · afternoon free · group vote: fado vs. jazz" },
                  { t: "Sat", d: "Day trip slot · beach or Sintra — pick by Wed" },
                  { t: "Sun", d: "Brunch checkout · airport buffer built in" },
                ].map((row) => (
                  <li key={row.t} className="flex gap-4 py-4">
                    <span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)] dark:text-slate-500">
                      {row.t}
                    </span>
                    <span className="text-sm leading-relaxed text-[color:var(--on-surface-variant)] dark:text-slate-300">{row.d}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-6 py-4 dark:border-white/10 dark:bg-dm-page sm:px-8">
                <p className="text-xs text-[color:var(--on-surface-muted)] dark:text-neutral-500">
                  Shared link · friends view without signing up · dates and votes layered on next
                </p>
              </div>
            </div>
          </div>

          <div className="mt-14 flex justify-center">
            <Link href="/trip-parser" className={primaryHeroEmphasisLinkClass}>
              Start planning
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] py-10 dark:border-white/10 dark:bg-dm-page">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-semibold text-[color:var(--on-surface)] dark:text-white">Conci</span>
            </div>
            <Link
              href={JOIN_WITH_CODE_URL}
              className="font-medium text-[color:var(--on-surface)] underline-offset-2 hover:underline dark:text-neutral-300"
            >
              Join a Trip
            </Link>
          </div>
          <p>© {new Date().getFullYear()} Conci</p>
        </div>
      </footer>
    </div>
  );
}
