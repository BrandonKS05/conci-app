import type { Metadata } from "next";
import Link from "next/link";

const JOIN_WITH_CODE_URL = "https://conci-app-wine.vercel.app/join?from=create";

export const metadata: Metadata = {
  title: "Conci — Group travel, zero friction",
  description:
    "AI-powered group travel planning that turns messy chats into shareable itineraries, votes, budgets, and booking-ready plans.",
};

const steps = [
  {
    icon: "Chat",
    title: "Just describe it",
    body: "Tell Conci anything: five days in Tokyo, eight people, foodies and outdoorsy types, mid-range budget. The AI builds a complete starting plan.",
  },
  {
    icon: "Vote",
    title: "Everyone joins and votes",
    body: "Share a link or code. Each person adds preferences, budgets, and availability while Conci reconciles the group into one clear direction.",
  },
  {
    icon: "Go",
    title: "Book and go",
    body: "Costs, dates, activities, and next steps stay in one place so the group can move from maybe to booked without another spreadsheet.",
  },
];

const features = [
  {
    icon: "Map",
    title: "Full itinerary from a sentence",
    body: "Describe your trip in plain language and Conci generates a day-by-day plan with destinations, stays, meals, and experiences.",
  },
  {
    icon: "Cost",
    title: "Live cost awareness",
    body: "Estimated flights, hotels, food, and activity costs roll up per person before anyone commits to the trip.",
  },
  {
    icon: "Prefs",
    title: "Preference blending",
    body: "One traveler needs vegetarian options, another wants nightlife, another has a hard budget. Conci keeps the plan workable for everyone.",
  },
  {
    icon: "AI",
    title: "AI that edits the plan",
    body: "Ask for a cheaper hotel, a calmer first day, or a better dinner option and Conci updates the itinerary instead of just suggesting.",
  },
  {
    icon: "Dates",
    title: "Date voting and invites",
    body: "Friends can join by link or code, vote on date windows, and RSVP without turning planning into a second job.",
  },
  {
    icon: "Book",
    title: "Booking-ready cards",
    body: "Keep hotels, flights, restaurants, and activities organized as cards the group can understand and act on.",
  },
];

const travelers = [
  {
    initials: "SL",
    name: "Sarah L.",
    preference: "Organizer - loves culture",
    status: "Ready",
    color: "#4E9A8C",
    ready: true,
  },
  {
    initials: "MR",
    name: "Marcus R.",
    preference: "No shellfish - budget-conscious",
    status: "Ready",
    color: "#9B6BC4",
    ready: true,
  },
  {
    initials: "JK",
    name: "Jamie K.",
    preference: "Beach vibes - nightlife",
    status: "Voting",
    color: "#D4834A",
    ready: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#FDF8F0] text-[#0B1929]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#0B1929]/10 bg-[#FDF8F0]/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-12" aria-label="Global">
          <Link href="/" className="font-display text-3xl font-semibold tracking-[-0.03em] text-[#0B1929]">
            Conci<span className="text-[#E8603C]">.</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#how" className="text-sm text-[#4A3F30] transition hover:text-[#0B1929]">
              How it works
            </a>
            <a href="#features" className="text-sm text-[#4A3F30] transition hover:text-[#0B1929]">
              Features
            </a>
            <a href="#collab" className="text-sm text-[#4A3F30] transition hover:text-[#0B1929]">
              Collaboration
            </a>
            <Link
              href="/trip-parser"
              className="rounded-full bg-[#0B1929] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#E8603C]"
            >
              Get early access
            </Link>
          </div>
          <Link
            href="/trip-parser"
            className="rounded-full bg-[#0B1929] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#E8603C] md:hidden"
          >
            Start
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid min-h-screen max-w-7xl items-center gap-16 px-6 pb-16 pt-32 lg:grid-cols-2 lg:px-12 lg:pt-36">
          <div className="flex flex-col gap-8">
            <div className="flex w-fit items-center gap-2 rounded-full bg-[#EFE3CC] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4A3F30] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#E8603C]">
              AI-powered group travel
            </div>
            <div>
              <h1 className="font-display text-6xl font-semibold leading-[0.95] tracking-[-0.04em] text-[#0B1929] sm:text-7xl lg:text-8xl">
                Group trips,
                <br />
                <em className="font-normal text-[#E8603C]">zero friction.</em>
              </h1>
              <p className="mt-8 max-w-xl text-lg font-light leading-8 text-[#7A7060]">
                Describe your dream trip, invite your crew, and let Conci build a plan around everyone&apos;s
                preferences, budgets, and schedules. No spreadsheets. No group chat chaos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/trip-parser"
                className="inline-flex rounded-full bg-[#E8603C] px-8 py-3.5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#D04E2A]"
              >
                Plan a trip free
              </Link>
              <Link
                href={JOIN_WITH_CODE_URL}
                className="inline-flex rounded-full border border-[#0B1929]/15 px-7 py-3.5 text-sm font-medium text-[#0B1929] transition hover:-translate-y-0.5 hover:border-[#0B1929]"
              >
                Join a trip
              </Link>
            </div>
            <div className="flex items-center gap-3 text-sm text-[#7A7060]">
              <div className="flex">
                {["SL", "MR", "JK", "AT"].map((avatar, index) => (
                  <span
                    key={avatar}
                    className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#FDF8F0] text-[10px] font-bold text-white first:ml-0"
                    style={{ backgroundColor: ["#4E9A8C", "#9B6BC4", "#D4834A", "#5880C4"][index] }}
                  >
                    {avatar}
                  </span>
                ))}
              </div>
              <span>Join travelers planning smarter together</span>
            </div>
          </div>

          <div className="relative mx-auto h-[560px] w-full max-w-[560px] lg:h-[620px]">
            <div className="absolute right-0 top-0 w-[360px] overflow-hidden rounded-[22px] bg-white shadow-[0_20px_60px_rgba(11,25,41,0.12),0_4px_16px_rgba(11,25,41,0.06)]">
              <div className="flex items-center gap-3 bg-[#0B1929] px-6 py-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8603C] text-sm font-bold text-white">
                  BA
                </div>
                <div>
                  <h2 className="text-sm font-medium text-white">Barcelona - 6 days</h2>
                  <p className="mt-0.5 text-xs text-white/55">7 travelers - Jun 14-20</p>
                </div>
                <div className="ml-auto rounded-full bg-[#E8603C]/20 px-3 py-1 text-xs font-semibold text-[#FF9070]">
                  ~$2,340/pp
                </div>
              </div>
              <div className="px-6 py-4">
                {[
                  ["Day 1 - Jun 14", "JFK to BCN - American AA112", "Departs 7:45 PM - 8h 20m", "#0B1929"],
                  ["Day 2 - Jun 15", "Hotel Arts Barcelona", "Check-in + Barceloneta beach evening", "#E8603C"],
                  ["Day 3 - Jun 16", "Disfrutar + Sagrada Familia", "Dinner reservation at 8:30 PM", "#E8603C"],
                  ["Day 6 - Jun 20", "BCN to JFK - Iberia IB6253", "Departs 11:20 AM - returns evening", "#D9C9A8"],
                ].map(([day, title, detail, color]) => (
                  <div key={day} className="flex gap-4 border-b border-[#F5F0E8] py-3 last:border-0">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7060]">{day}</p>
                      <p className="mt-1 text-sm font-semibold text-[#0B1929]">{title}</p>
                      <p className="mt-0.5 text-xs text-[#7A7060]">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mx-6 mb-5 flex items-center gap-3 rounded-2xl bg-[#F8F4EE] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#0B1929] text-xs text-[#E8603C]">
                  *
                </span>
                <p className="text-xs text-[#4A3F30]">Find a cheaper hotel option for days 3-5</p>
                <span className="ml-auto h-4 w-px animate-pulse bg-[#E8603C]" />
              </div>
            </div>

            <div className="absolute left-0 top-36 w-56 rounded-[20px] bg-white p-5 shadow-[0_20px_60px_rgba(11,25,41,0.12)]">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A7060]">Group preferences</p>
              <div className="flex flex-wrap gap-2">
                {["Beach", "No shellfish", "Nightlife", "Budget-conscious", "Culture"].map((chip) => (
                  <span
                    key={chip}
                    className={`rounded-full px-3 py-1 text-xs ${
                      chip === "No shellfish" ? "bg-[#E8603C]/10 text-[#E8603C]" : "bg-[#EFE3CC] text-[#4A3F30]"
                    }`}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="absolute bottom-20 right-0 w-52 rounded-[20px] bg-white p-5 shadow-[0_20px_60px_rgba(11,25,41,0.12)]">
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A7060]">Date vote</p>
              {[
                ["Jun 14-20", "80%", "5"],
                ["Jun 21-27", "28%", "2"],
                ["Jul 5-11", "14%", "1"],
              ].map(([date, width, count]) => (
                <div key={date} className="mb-3 flex items-center gap-2 last:mb-0">
                  <span className="w-16 text-xs text-[#0B1929]">{date}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0EBE2]">
                    <span className="block h-full rounded-full bg-[#E8603C]" style={{ width }} />
                  </span>
                  <span className="w-4 text-right text-xs text-[#7A7060]">{count}</span>
                </div>
              ))}
            </div>

            <div className="absolute bottom-4 left-12 w-44 rounded-[20px] bg-white p-5 shadow-[0_20px_60px_rgba(11,25,41,0.12)]">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A7060]">Est. per person</p>
              <p className="mt-1 font-display text-4xl font-semibold text-[#0B1929]">$2,340</p>
              <p className="mt-1 text-xs text-[#7A7060]">4 of 7 contributed</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#F0EBE2]">
                <div className="h-full w-[62%] rounded-full bg-[#4E9A8C]" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-y border-[#0B1929]/10 px-6 py-6">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A7060]">Organizes the chaos from</span>
          {["Group chats", "Flights", "Hotels", "Restaurants", "Shared links"].map((item) => (
            <span key={item} className="font-display text-xl font-semibold text-[#D9C9A8]">
              {item}
            </span>
          ))}
        </section>

        <section id="how" className="mx-auto max-w-7xl px-6 py-24 lg:px-12 lg:py-32">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8603C]">How it works</p>
          <h2 className="mt-4 max-w-2xl font-display text-5xl font-semibold leading-tight tracking-[-0.03em] text-[#0B1929]">
            Three steps from idea to <em className="font-normal text-[#E8603C]">packing.</em>
          </h2>
          <div className="mt-16 grid gap-10 lg:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="relative">
                <p className="font-display text-7xl font-semibold leading-none text-[#EFE3CC]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0B1929] text-xs font-bold text-[#E8603C]">
                  {step.icon}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-[#0B1929]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#7A7060]">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="bg-[#0B1929]">
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-12 lg:py-32">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#F2895E]">Features</p>
                <h2 className="mt-4 max-w-2xl font-display text-5xl font-semibold leading-tight tracking-[-0.03em] text-[#FDF8F0]">
                  The AI that actually <em className="font-normal text-[#F2895E]">does things.</em>
                </h2>
              </div>
              <Link href="/trip-parser" className="text-sm font-medium text-[#D9C9A8] transition hover:text-[#FDF8F0]">
                Start with a prompt
              </Link>
            </div>
            <div className="mt-16 grid overflow-hidden rounded-3xl border border-white/5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="border border-white/5 bg-[#162235] p-8 transition hover:bg-[#1E3350]">
                  <div className="mb-5 h-1 w-9 rounded-full bg-[#E8603C]" />
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2895E]">{feature.icon}</p>
                  <h3 className="mt-3 text-lg font-semibold text-[#FDF8F0]">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#FDF8F0]/55">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="collab" className="mx-auto max-w-7xl px-6 py-24 lg:px-12 lg:py-32">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8603C]">Built for groups</p>
              <h2 className="mt-4 font-display text-5xl font-semibold leading-tight tracking-[-0.03em] text-[#0B1929]">
                Everyone has a voice. <em className="font-normal text-[#E8603C]">No one&apos;s</em> overwhelmed.
              </h2>
              <div className="mt-10 space-y-4">
                {[
                  ["Vote on anything", "Dates, hotels, activities, or tradeoffs. Conci tracks consensus and nudges the plan toward what the group actually wants."],
                  ["Commitment without chaos", "Costs, RSVPs, and milestones are visible early so the organizer knows who is in before booking pressure hits."],
                  ["Group memory", "Dietary needs, budget comfort zones, and favorite trip styles can carry forward instead of starting from zero each time."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-[#0B1929]/10 bg-[#FDF8F0] p-5 transition hover:border-[#D9C9A8] hover:shadow-lg">
                    <h3 className="font-semibold text-[#0B1929]">{title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#7A7060]">{body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-6 shadow-[0_24px_64px_rgba(11,25,41,0.10)]">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0B1929]">Barcelona - 7 travelers</h3>
                <span className="rounded-full bg-[#E8F6F2] px-3 py-1 text-xs font-bold text-[#2D8B70]">4 of 7 ready</span>
              </div>
              <div className="space-y-3">
                {travelers.map((traveler) => (
                  <div key={traveler.name} className="flex items-center gap-3 rounded-2xl border border-[#F0EBE2] bg-[#FDFAF7] px-4 py-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: traveler.color }}
                    >
                      {traveler.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#0B1929]">{traveler.name}</p>
                      <p className="truncate text-xs text-[#7A7060]">{traveler.preference}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        traveler.ready ? "bg-[#E8F6F2] text-[#2D8B70]" : "bg-[#FEF3E8] text-[#C4621A]"
                      }`}
                    >
                      {traveler.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-[#D9C9A8] bg-gradient-to-br from-[#FDF8F0] to-[#F5EDD8] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#E8603C]">Conci suggestion</p>
                <p className="mt-3 text-sm leading-7 text-[#4A3F30]">
                  Marcus flagged the Day 3 restaurant for shellfish. I found an allergy-friendly tapas spot with a
                  similar vibe for $15 less per person. Swap it in?
                </p>
                <div className="mt-4 flex gap-3">
                  <button className="rounded-full bg-[#0B1929] px-4 py-2 text-xs font-semibold text-white">Accept change</button>
                  <button className="rounded-full bg-[#EFE3CC] px-4 py-2 text-xs font-semibold text-[#4A3F30]">Keep original</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-10 lg:px-12">
          <div className="relative overflow-hidden rounded-[32px] bg-[#0B1929] px-6 py-20 text-center shadow-[0_24px_64px_rgba(11,25,41,0.12)] sm:px-12">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(232,96,60,0.15),transparent_55%),radial-gradient(ellipse_at_80%_20%,rgba(78,154,140,0.10),transparent_45%)]" />
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#F2895E]">Ready to go?</p>
              <h2 className="mx-auto mt-4 max-w-3xl font-display text-5xl font-semibold leading-tight tracking-[-0.03em] text-[#FDF8F0]">
                Your best trip is one <em className="font-normal text-[#F2895E]">conversation away.</em>
              </h2>
              <p className="mt-5 text-[#FDF8F0]/60">Stop planning in group chats. Start in Conci.</p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <Link
                  href="/trip-parser"
                  className="rounded-full bg-[#E8603C] px-8 py-3.5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-[#D04E2A]"
                >
                  Plan a trip free
                </Link>
                <Link
                  href={JOIN_WITH_CODE_URL}
                  className="rounded-full border border-[#FDF8F0]/20 px-8 py-3.5 text-sm font-medium text-[#FDF8F0]/75 transition hover:border-[#FDF8F0]/50 hover:text-[#FDF8F0]"
                >
                  Join with a code
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#0B1929]/10 px-6 py-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-[#7A7060] sm:flex-row">
          <div className="font-display text-2xl font-semibold text-[#0B1929]">
            Conci<span className="text-[#E8603C]">.</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/trip-parser" className="transition hover:text-[#0B1929]">
              Start planning
            </Link>
            <Link href={JOIN_WITH_CODE_URL} className="transition hover:text-[#0B1929]">
              Join a trip
            </Link>
            <a href="#features" className="transition hover:text-[#0B1929]">
              Features
            </a>
          </div>
          <p>© {new Date().getFullYear()} Conci</p>
        </div>
      </footer>
    </div>
  );
}
