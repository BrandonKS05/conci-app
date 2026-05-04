"use client";

import { useMemo, useState } from "react";

const SYSTEM_PROMPT = `You are a trip planning assistant. Extract trip details from the user's input 
and return ONLY a valid JSON object with these exact fields:

{
  "title": "short catchy trip name",
  "location": "city or region",
  "dates": { "confirmed": false, "options": ["May 10-12", "May 17-19"] },
  "people": { "count": 6, "names": ["Alex", "Jordan"] },
  "budget": { "tier": "mid-range", "perPerson": "$200-300" },
  "vibe": ["beach", "nightlife"],
  "openDecisions": ["Which hotel?", "Flights or drive?"],
  "nextStep": "Create a poll for dates",
  "confidence": 0.85
}

Only return the JSON. No explanation. Use null for unknown fields.`;

function safeParseJson(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Parser did not return valid JSON.");
}

function normalizePlan(value) {
  const plan = value && typeof value === "object" ? value : {};
  const people = plan.people && typeof plan.people === "object" ? plan.people : {};
  const dates = plan.dates && typeof plan.dates === "object" ? plan.dates : {};
  const budget = plan.budget && typeof plan.budget === "object" ? plan.budget : {};

  return {
    title: typeof plan.title === "string" ? plan.title : null,
    location: typeof plan.location === "string" ? plan.location : null,
    dates: {
      confirmed: typeof dates.confirmed === "boolean" ? dates.confirmed : false,
      options: Array.isArray(dates.options) ? dates.options.filter((d) => typeof d === "string") : [],
    },
    people: {
      count: typeof people.count === "number" ? people.count : null,
      names: Array.isArray(people.names) ? people.names.filter((n) => typeof n === "string") : [],
    },
    budget: {
      tier: typeof budget.tier === "string" ? budget.tier : null,
      perPerson: typeof budget.perPerson === "string" ? budget.perPerson : null,
    },
    vibe: Array.isArray(plan.vibe) ? plan.vibe.filter((v) => typeof v === "string") : [],
    openDecisions: Array.isArray(plan.openDecisions)
      ? plan.openDecisions.filter((d) => typeof d === "string")
      : [],
    nextStep: typeof plan.nextStep === "string" ? plan.nextStep : null,
    confidence: typeof plan.confidence === "number" ? Math.max(0, Math.min(1, plan.confidence)) : 0,
  };
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((chunk) => chunk[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

export default function TripParser() {
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const openAiApiKey = process.env.OPENAI_API_KEY;

  const othersCount = useMemo(() => {
    if (!plan?.people?.count) return 0;
    const named = plan.people.names.length;
    return Math.max(plan.people.count - named, 0);
  }, [plan]);

  async function handleSubmit(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    setLoading(true);
    setError(null);

    try {
      if (!openAiApiKey) {
        throw new Error("Missing OPENAI_API_KEY.");
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI request failed (${response.status}): ${body}`);
      }

      const payload = await response.json();
      const outputText = payload?.output_text || "";
      const parsed = normalizePlan(safeParseJson(outputText));
      setPlan(parsed);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown parser error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-3 block text-sm font-semibold text-slate-700">Trip plan input</label>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste a group chat, Instagram link, or just describe your trip idea..."
          className="min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">Text-only input for now. Links/chats supported as pasted text.</p>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Parsing..." : "Create plan"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? <LoadingSkeleton /> : null}

      {!loading && plan ? (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{plan.title || "Untitled trip plan"}</h2>
              <p className="text-sm text-slate-600">{plan.location || "Location TBD"}</p>
            </div>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              ✦ New
            </span>
          </header>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dates</p>
            {plan.dates.options.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {plan.dates.options.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                  >
                    {date}
                  </button>
                ))}
              </div>
            ) : (
              <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-sm text-slate-500">
                TBD
              </span>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">People</p>
            <div className="flex flex-wrap items-center gap-2">
              {plan.people.names.map((name) => (
                <div key={name} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {initials(name)}
                  </span>
                  <span className="text-sm text-slate-700">{name}</span>
                </div>
              ))}
              {othersCount > 0 ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                  +{othersCount} others
                </span>
              ) : null}
              {plan.people.names.length === 0 && !plan.people.count ? (
                <span className="text-sm text-slate-500">People TBD</span>
              ) : null}
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              {plan.budget.tier || "budget TBD"}
            </span>
            <span className="text-sm text-slate-600">{plan.budget.perPerson || "Per-person estimate TBD"}</span>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vibe</p>
            <div className="flex flex-wrap gap-2">
              {plan.vibe.length ? (
                plan.vibe.map((tag, idx) => (
                  <span
                    key={tag}
                    className={`rounded-full px-3 py-1 text-sm ${
                      idx % 3 === 0
                        ? "bg-sky-50 text-sky-700"
                        : idx % 3 === 1
                          ? "bg-violet-50 text-violet-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No vibe tags yet</span>
              )}
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Open decisions</p>
            {plan.openDecisions.length ? (
              <ul className="space-y-2">
                {plan.openDecisions.map((decision) => (
                  <li key={decision} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" readOnly className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                    <span>{decision}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No open decisions detected.</p>
            )}
          </section>

          <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Next step</p>
            <p className="mt-1 text-sm font-medium text-indigo-900">{plan.nextStep || "Pick the first unresolved decision."}</p>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Confidence</span>
              <span>{Math.round(plan.confidence * 100)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900 transition-all"
                style={{ width: `${Math.max(4, Math.round(plan.confidence * 100))}%` }}
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse">
      <div className="h-6 w-1/2 rounded bg-slate-100" />
      <div className="h-4 w-1/3 rounded bg-slate-100" />
      <div className="h-10 w-full rounded-2xl bg-slate-100" />
      <div className="h-10 w-full rounded-2xl bg-slate-100" />
      <div className="h-20 w-full rounded-2xl bg-slate-100" />
    </div>
  );
}
