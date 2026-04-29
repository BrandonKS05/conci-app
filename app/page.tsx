"use client";

import type { ParsedRequest } from "@/lib/request-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteShell } from "@/components/site-shell";
import { GlassCard, Pill, SecondaryButton, SectionTitle } from "@/components/cards";
import { createActiveItinerary, ItineraryApiError } from "@/lib/itinerary-api";
import { examplePrompt } from "@/lib/app-defaults";

export default function HomePage() {
  const router = useRouter();
  const [request, setRequest] = useState(examplePrompt);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorDetails, setSubmitErrorDetails] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitErrorDetails(null);

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ request }),
      });

      if (!response.ok) {
        const body = (await response.text()) || "Unable to parse request.";
        setSubmitError(`Parse request failed: ${body}`);
        return;
      }

      const data = (await response.json()) as { parsed: ParsedRequest };
      await createActiveItinerary(request, data.parsed);
      router.push("/results");
    } catch (error) {
      if (error instanceof ItineraryApiError) {
        setSubmitError(error.message);
        setSubmitErrorDetails(formatErrorDetails(error.code, error.details));
      } else if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Failed to create itinerary.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SiteShell
      title="Your assistant for trips that need to feel effortless."
      eyebrow="Home prompt"
    >
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <GlassCard className="overflow-hidden p-0">
          <div className="bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92),rgba(79,70,229,0.88))] px-5 py-6 text-white sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-white/70">
              <span>Executive trip planning</span>
              <span className="hidden h-1 w-1 rounded-full bg-white/40 sm:inline-block" />
              <span>Prompt to itinerary</span>
            </div>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.05em] sm:text-4xl">
              Tell Conci the trip once, then let it shape the rest.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/[0.78] sm:text-base">
              A premium, consumer-friendly assistant for flights, dining, and things to
              do, all in one place.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-8">
            <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Prompt
                </p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                  Ready
                </span>
              </div>
              <textarea
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                rows={5}
                className="w-full resize-none border-0 bg-transparent text-[1.05rem] leading-8 text-slate-800 outline-none placeholder:text-slate-400 sm:text-[1.1rem]"
                placeholder="Describe the trip, dinner, or experience you want..."
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Pill>Flight timing</Pill>
              <Pill>Restaurant reservation</Pill>
              <Pill>Things to do</Pill>
              <Pill>Booking handoff ready</Pill>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-slate-950 via-slate-900 to-brand-700 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(15,23,42,0.22)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Parsing request..." : "Generate recommendations"}
              </button>
              <button
                type="button"
                onClick={() => setRequest(examplePrompt)}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-slate-50"
              >
                Load example
              </button>
            </div>

            {submitError ? (
              <div className="rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                <div className="font-medium">{submitError}</div>
                {submitErrorDetails ? (
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-2xl bg-white/70 p-3 text-xs leading-5 text-rose-800">
                    {submitErrorDetails}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </form>
        </GlassCard>

        <div className="grid gap-6">
          <GlassCard className="bg-slate-950 p-6 text-white sm:p-7">
            <SectionTitle
              title="What Conci assembles"
              description="A premium planning surface, not a generic form."
            />
            <div className="mt-6 grid gap-4">
              <MiniPreview
                label="Flight"
                title="Morning arrival"
                supportingText="Best balance of price and timing"
              />
              <MiniPreview
                label="Dinner"
                title="Quiet premium restaurant"
                supportingText="Good for client dinners and low-friction pacing"
              />
              <MiniPreview
                label="Activity"
                title="Short cultural stop"
                supportingText="Fits cleanly into a shifting executive schedule"
              />
            </div>
          </GlassCard>

          <GlassCard className="p-6 sm:p-7">
            <SectionTitle title="Assistant behavior" description="What the MVP should feel like." />
            <div className="grid gap-3 text-sm text-slate-600">
              <div className="rounded-[1.4rem] bg-slate-50 p-4">
                Fast, calm, and useful.
              </div>
              <div className="rounded-[1.4rem] bg-slate-50 p-4">
                Understands travel, dining, and activities together.
              </div>
              <div className="rounded-[1.4rem] bg-slate-50 p-4">
                Leaves room for booking handoff instead of pretending to complete bookings.
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </SiteShell>
  );
}

function formatErrorDetails(code: string, details: unknown) {
  const payload = {
    code,
    details,
  };

  if (typeof details === "string") {
    return `${code}\n${details}`;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return `${code}\nUnable to serialize error details.`;
  }
}

function MiniPreview({
  label,
  title,
  supportingText,
}: {
  label: string;
  title: string;
  supportingText: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/[0.55]">{label}</p>
      <p className="mt-2 font-display text-lg font-semibold tracking-[-0.03em]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-white/[0.68]">{supportingText}</p>
    </div>
  );
}
