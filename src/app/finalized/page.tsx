"use client";

import { useCallback, useRef, useState } from "react";
import { SiteShell } from "@/frontend/components/site-shell";
import { primaryFilledInteractive } from "@/frontend/ui/primary-action";

export default function FinalizedDemoPage() {
  const printRootRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const downloadPdf = useCallback(async () => {
    const el = printRootRef.current;
    if (!el) return;
    setPdfErr(null);
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [14, 12, 14, 12],
          filename: "Cancun-Getaway-Itinerary.pdf",
          image: { type: "jpeg", quality: 0.94 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (e) {
      setPdfErr(e instanceof Error ? e.message : "Could not create PDF.");
    } finally {
      setPdfBusy(false);
    }
  }, []);

  return (
    <SiteShell
      title="Cancun Getaway 🌴"
      eyebrow="Demo itinerary · Direct link only (no navigation)"
      contentWide
      tripTypography
    >
      <div className="mx-auto max-w-4xl space-y-10 pb-32">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-teal-600/90 dark:text-teal-400/90">
          Preview · Not linked from site nav
        </p>

        <div
          ref={printRootRef}
          id="cancun-itinerary-pdf-root"
          className="space-y-10 rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#141816] to-dm-card px-5 py-8 shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:px-10 sm:py-12"
        >
          {/* Trip header */}
          <header className="border-b border-white/10 pb-8 text-center">
            <h2 className="font-display text-3xl font-normal tracking-tight text-white sm:text-4xl">
              Cancun Getaway 🌴
            </h2>
            <p className="mt-4 text-sm font-medium text-neutral-300">
              Departure: Los Angeles (LAX) → Cancun (CUN)
            </p>
            <p className="mt-2 text-sm text-neutral-400">Dates: December 15–18, 2026</p>
            <p className="mt-2 text-sm text-neutral-400">People: 4 travelers</p>
            <p className="mt-4 inline-flex rounded-full border border-teal-500/30 bg-teal-950/40 px-4 py-1.5 text-sm font-semibold text-teal-100">
              Total per person: ~$1,400
            </p>
          </header>

          {/* Budget */}
          <section>
            <h3 className="font-display text-xl font-semibold tracking-tight text-white">Budget Breakdown</h3>
            <ul className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 px-5 py-5 text-sm leading-relaxed text-neutral-300">
              <li className="flex justify-between gap-4 border-b border-white/5 pb-3">
                <span>✈️ Flights (round trip)</span>
                <span className="shrink-0 font-medium text-white">$480/person</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-white/5 pb-3">
                <span>🏨 Hotel (3 nights, split 4 ways)</span>
                <span className="shrink-0 font-medium text-white">$90/person</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-white/5 pb-3">
                <span>🍽️ Food & drinks</span>
                <span className="shrink-0 font-medium text-white">$270/person</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-white/5 pb-3">
                <span>🎯 Experiences & activities</span>
                <span className="shrink-0 font-medium text-white">$160/person</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-white/5 pb-3">
                <span>🚗 Transport (airport, ferry, uber)</span>
                <span className="shrink-0 font-medium text-white">$100/person</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-white/5 pb-3">
                <span>📦 Buffer</span>
                <span className="shrink-0 font-medium text-white">$300/person</span>
              </li>
              <li className="flex justify-between gap-4 pt-1 font-semibold text-white">
                <span>Total</span>
                <span className="shrink-0">~$1,400/person</span>
              </li>
            </ul>
          </section>

          {/* Flights */}
          <section>
            <h3 className="font-display text-xl font-semibold tracking-tight text-white">Flight</h3>
            <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-neutral-300">
              <p>
                <span className="text-neutral-500">Outbound · </span>
                Dec 15 — United Airlines UA 1245 — LAX 7:00 AM → CUN 2:45 PM (nonstop, 4h 45m)
              </p>
              <p>
                <span className="text-neutral-500">Return · </span>
                Dec 18 — United Airlines UA 1246 — CUN 4:00 PM → LAX 7:30 PM (nonstop, 4h 30m)
              </p>
              <p className="pt-2 text-neutral-400">Price: ~$480/person round trip</p>
              <p>
                Book via:{" "}
                <a
                  href="https://www.united.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-teal-400 underline-offset-2 hover:underline"
                >
                  united.com
                </a>
              </p>
            </div>
          </section>

          {/* Hotel */}
          <section>
            <h3 className="font-display text-xl font-semibold tracking-tight text-white">Hotel</h3>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-neutral-300">
              <p className="font-semibold text-white">Residence Inn by Marriott Cancun Hotel Zone</p>
              <p className="mt-2">Location: Blvd. Kukulcan Km 9.5, Zona Hotelera</p>
              <p className="mt-2">
                Price: ~$180/night (split 4 ways = $45/person/night)
              </p>
              <p className="mt-2">Rating: 8.8/10</p>
              <p className="mt-3 text-neutral-400">
                Includes: Free breakfast, pool, airport shuttle, beach access, kitchen in room
              </p>
            </div>
          </section>

          {/* Day by day */}
          <section>
            <h3 className="font-display text-xl font-semibold tracking-tight text-white">Day by Day Itinerary</h3>
            <div className="mt-6 space-y-8">
              <article className="rounded-2xl border border-teal-500/20 bg-teal-950/20 p-5 sm:p-6">
                <h4 className="font-display text-lg font-semibold text-teal-100">Day 1 - Dec 15 (Arrival)</h4>
                <ul className="mt-4 list-none space-y-2.5 text-sm leading-relaxed text-neutral-300">
                  <li>7:00 AM Depart LAX on United UA 1245</li>
                  <li>2:45 PM Arrive Cancun CUN — hotel shuttle to Residence Inn (~25 min)</li>
                  <li>4:00 PM Check in, drop bags, hit the pool</li>
                  <li>6:30 PM Walk to Playa Langosta beach for sunset (free)</li>
                  <li>8:00 PM Dinner at La Habichuela Downtown — Yucatan seafood, ~$25/person</li>
                  <li>10:00 PM Nightcap at Coco Bongo strip</li>
                </ul>
              </article>

              <article className="rounded-2xl border border-teal-500/20 bg-teal-950/20 p-5 sm:p-6">
                <h4 className="font-display text-lg font-semibold text-teal-100">Day 2 - Dec 16 (Ruins & Beach)</h4>
                <ul className="mt-4 list-none space-y-2.5 text-sm leading-relaxed text-neutral-300">
                  <li>8:00 AM Free breakfast at hotel</li>
                  <li>10:00 AM El Rey Ruins — ancient Mayan site + iguanas, $3 entry</li>
                  <li>12:30 PM Lunch at Mercado 28 — tacos & ceviche, ~$8/person</li>
                  <li>2:30 PM Playa Delfines — best free public beach in Cancun, sunset views</li>
                  <li>5:00 PM Back to hotel, freshen up</li>
                  <li>7:30 PM Dinner at Roots Jazz Club & Restaurant — live music + cocktails, ~$35/person</li>
                  <li>10:00 PM Nightlife on Kukulcan Blvd</li>
                </ul>
              </article>

              <article className="rounded-2xl border border-teal-500/20 bg-teal-950/20 p-5 sm:p-6">
                <h4 className="font-display text-lg font-semibold text-teal-100">Day 3 - Dec 17 (Isla Mujeres)</h4>
                <ul className="mt-4 list-none space-y-2.5 text-sm leading-relaxed text-neutral-300">
                  <li>8:00 AM Hotel breakfast</li>
                  <li>9:00 AM Uber to Puerto Juarez ferry terminal (~$12)</li>
                  <li>9:30 AM Ferry to Isla Mujeres (~$10 round trip/person, 20 min)</li>
                  <li>10:00 AM Rent golf carts to tour the island (~$45 split 4 ways)</li>
                  <li>12:00 PM Lunch at Playa Norte — fresh fish tacos on the beach, ~$12/person</li>
                  <li>2:30 PM MUSA Underwater Museum snorkeling tour — ~$40/person</li>
                  <li>5:30 PM Ferry back to Cancun</li>
                  <li>7:30 PM Dinner at El Fish Fritanga — casual seafood, ~$15/person</li>
                  <li>9:30 PM Rooftop drinks at La Vaquita</li>
                </ul>
              </article>

              <article className="rounded-2xl border border-teal-500/20 bg-teal-950/20 p-5 sm:p-6">
                <h4 className="font-display text-lg font-semibold text-teal-100">Day 4 - Dec 18 (Departure)</h4>
                <ul className="mt-4 list-none space-y-2.5 text-sm leading-relaxed text-neutral-300">
                  <li>8:00 AM Last hotel breakfast</li>
                  <li>10:00 AM Final swim + pack up</li>
                  <li>12:00 PM Checkout</li>
                  <li>1:00 PM Hotel shuttle to CUN airport</li>
                  <li>4:00 PM Depart CUN on United UA 1246</li>
                  <li>7:30 PM Arrive LAX</li>
                </ul>
              </article>
            </div>
          </section>

          {/* Experiences */}
          <section>
            <h3 className="font-display text-xl font-semibold tracking-tight text-white">Experiences</h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-300 marker:text-teal-500">
              <li>El Rey Ruins — $3/person</li>
              <li>Isla Mujeres ferry — $10/person round trip</li>
              <li>Golf cart rental — $45 split 4 ways</li>
              <li>MUSA Underwater Museum snorkel — $40/person</li>
              <li>Playa Delfines — free</li>
            </ul>
          </section>

          {/* Restaurants */}
          <section>
            <h3 className="font-display text-xl font-semibold tracking-tight text-white">Restaurants</h3>
            <ul className="mt-4 space-y-3 text-sm text-neutral-300">
              <li className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                La Habichuela Downtown — Yucatan cuisine, $$, Av. Margaritas 25
              </li>
              <li className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                Mercado 28 — street food market, $, Downtown Cancun
              </li>
              <li className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                Roots Jazz Club — live jazz & dinner, $$$, Zona Hotelera
              </li>
              <li className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                El Fish Fritanga — casual seafood, $, Isla Mujeres
              </li>
              <li className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                La Vaquita — rooftop bar & drinks, $$, Zona Hotelera
              </li>
            </ul>
          </section>
        </div>

        <div className="sticky bottom-6 z-10 mx-auto max-w-xl px-2">
          {pdfErr ? (
            <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-950/50 px-4 py-2 text-center text-sm text-rose-200">
              {pdfErr}
            </p>
          ) : null}
          <button
            type="button"
            disabled={pdfBusy}
            onClick={() => void downloadPdf()}
            className={`flex w-full items-center justify-center rounded-2xl px-6 py-5 text-base font-semibold shadow-lg shadow-black/40 ${primaryFilledInteractive}`}
          >
            {pdfBusy ? "Preparing PDF…" : "Download Itinerary PDF"}
          </button>
        </div>
      </div>
    </SiteShell>
  );
}
