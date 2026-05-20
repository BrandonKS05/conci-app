# Conci — Claude Code Rules

## What Conci Is

Conci is an AI-led group trip planning app. The core problem: group trips get stuck in the group chat. One person ends up doing all the work — collecting preferences, comparing flights, finding lodging, making an itinerary, chasing payments. Conci does that work for the group.

**The goal is not a giant travel dashboard. The goal is the best possible trip with the least possible work.**

## Core Product Model

**Starting a trip:** User describes what they want in plain English. Conci asks useful follow-up questions, then builds a live itinerary. Other people join via link or code.

**What a trip plan includes:**
- Trip dates and destination(s)
- Lodging (with booking links)
- Transportation (flights, trains, transfers)
- Restaurants and experiences
- Estimated costs and cost per person
- Group preferences and votes
- Contribution/payment tracking

**The itinerary is calendar-first.** Each day shows: where the group is staying, what transportation applies, what meals/experiences are planned, and what still needs a decision.

**The AI edits the live plan.** "Move dinner to Saturday," "find cheaper lodging," "add a train to Amsterdam" — Conci updates the actual itinerary, not just a text reply.

## Roles

- **Owner:** Full control. Uses AI to edit itinerary, confirm/replace options, manage contributions.
- **Guests:** Can add preferences, vote, mark interest, suggest alternatives, flag constraints (budget, allergies, dates). Cannot freely edit the plan.
- Conci synthesizes guest input and surfaces the best group plan to the owner.

## Lodging

Think in terms of lodging, not just hotels. Supported types: hotels, Airbnbs, villas, hostels, resorts.

- Single-destination trips: one main lodging for the whole trip is fine as default.
- Multi-city trips: lodging is per date range (e.g. hotel nights 1–2, Airbnb nights 3–5).
- Manual search exists as an override — AI should still autofill and recommend by default.

## Multi-City Trips

Support trips across multiple destinations (e.g. Paris → Amsterdam → London, or NYC → Hamptons). The calendar should handle: lodging per segment, inter-city transportation, activities per city, cost breakdown per leg. Default flow should still feel simple — multi-city is powerful but not the norm.

## Costs and Contributions

- Always estimate total trip cost and cost per person.
- Near-term: users contribute money into the trip, Conci tracks who paid and what's owed, owner withdraws and books manually.
- Long-term: Conci books on behalf of the group.

## Booking Links

Every lodging, flight, restaurant, experience, and activity should have a direct booking link. Until Conci can fully book for the group, the owner should be one click away from completing a purchase.

## Social Layer (Future)

Each user will have a travel profile: places visited, upcoming trips, lodging/restaurant rankings, learned preferences. Social layer aids discovery ("3 people in your group loved Tulum," "Alex ranked this hotel highly") and feeds better AI recommendations over time. Keep it clean — social should make trips better, not add clutter.

## Design Principles

- Travel-focused aesthetic — not a generic SaaS dashboard.
- Simple by default; power features accessible but not in the way.
- Never substitute real travel/API data with mock or fake data.

---

## Tech Stack

Next.js 15 / React 19 / TypeScript / Tailwind CSS / Supabase (auth + DB) / Stripe (payments) / OpenAI (itinerary generation) / Framer Motion

**Key directories:**
- `src/app/api/` — Next.js route handlers (backend)
- `src/app/` — pages and layouts
- `src/frontend/` — reusable UI components

## Commands

```bash
npm run dev       # Start dev server (kills any running instance first)
npm run build     # Production build — run after changes to catch errors
npm run lint      # ESLint check
npm start         # Start production server
```

Always run `npm run build` after non-trivial changes. Fix any build failures before stopping.

## Code Style

- TypeScript types for all new code — no `any` unless unavoidable.
- Prefer `next/image` over raw `<img>` tags.
- Reuse existing components before creating new ones.
- Keep changes minimal and focused — no opportunistic refactoring.
- No comments unless the WHY is non-obvious.
- No unused imports, variables, or dead code.

## Workflow

1. For broad requests: read the relevant files first, then plan the smallest safe change.
2. Work one coherent improvement at a time.
3. After frontend changes, verify in the browser preview before marking done.
4. After any change: run `npm run build`. Fix failures before stopping.
5. Summarize: changed files, user-facing impact, risks, and any follow-ups.

## Safety — Hard Stops

- **Never** read, print, modify, or expose `.env.local` or any secrets.
- **Never** push directly to `main`.
- **Never** touch auth logic unless explicitly asked.
- **Never** touch Stripe, Supabase schema, Vercel config, or deployment settings unless explicitly asked.
- **Never** install new packages without explicit approval.
- **Never** delete files without explicit approval.
- **Do not** modify `globals.css` or `layout.tsx` for unrelated tasks.

## Architecture Notes

- Auth: Supabase SSR (`@supabase/ssr`) — middleware-based session handling.
- Payments: Stripe — webhooks at `src/app/api/webhooks/stripe/route.ts`.
- AI routes stream responses; handle streaming errors carefully.
- AI itinerary generation: `src/app/api/trip-plans/[id]/generate-itinerary/route.ts`
- Places/maps data: Google Places API via `src/app/api/places/`
- Flight search: `src/app/api/trip-plans/[id]/flights/`
- Collab/voting: `src/app/api/trip-plans/[id]/collab/` and `spotlights/`
