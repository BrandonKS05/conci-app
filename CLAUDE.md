# Conci — Claude Code Rules

## What Conci Is

AI-led group trip planning app. One person does all the work in the group chat — Conci does it for them. The output is a live, calendar-first itinerary the whole group can see, vote on, and pay into. Goal: best possible trip, least possible work.

## Current Stage

Launching within a week. Default to the smallest safe change. Stability and polish over new features.

## Commands

```bash
npm run dev       # Start dev server (kills any running instance first)
npm run build     # Production build — always run after non-trivial changes
npm run lint      # ESLint check
```

Always run `npm run build` after changes. Fix failures before stopping.

## Key Directories

```text
src/app/api/                                              — Route handlers
src/app/api/trip-plans/[id]/generate-itinerary/route.ts  — AI itinerary generation
src/app/api/trip-plans/[id]/collab/                       — Voting + collaboration
src/app/api/places/                                       — Google Places
src/app/api/webhooks/stripe/route.ts                      — Stripe webhooks
src/frontend/                                             — Reusable UI components
```

## UI Design System

Do not deviate. Do not introduce new colors, fonts, or shadows.

- Fonts: Playfair Display for headings, Inter for UI/body
- Accent: `#2563EB` via `--sage` CSS variable
- Primary CTA: charcoal `#1c1c17` filled pill
- Background: pure white `#ffffff` — never cream, beige, or off-white
- Cards: `rounded-2xl`, ambient shadows, hairline borders
- Use `globals.css` tokens — no hardcoded hex values that have variables
- No glassmorphism, gradient blobs, sparkles, or purple/violet

## Code Style

- TypeScript types everywhere — no `any` unless unavoidable
- Use `next/image` over raw `<img>`
- Reuse existing components before creating new ones
- No comments unless the WHY is non-obvious
- No unused imports, variables, or dead code
- Never use mock or fake data in production paths

## Architecture Notes

- Auth: Supabase SSR (`@supabase/ssr`) — middleware-based. Do not touch unless asked.
- AI routes: Stream responses — do not change streaming error handling without end-to-end testing.
- Trip Copilot: Must update live Supabase itinerary state — text-only responses without state mutation are broken.
- Itinerary pipeline: generate → overshoot repair → venue enrichment using SerpAPI + Google Maps.

## Hard Stops — Never Do These

- Never read, expose, or modify `.env.local` or any secrets
- Never push to `main`
- Never touch Stripe, Supabase schema, Vercel config, or auth logic unless explicitly asked
- Never install packages or delete files without explicit approval
- Never modify `globals.css` or `layout.tsx` for unrelated tasks
- Never add new Tailwind colors, font imports, or CSS variables without approval

## Not Built Yet — Do Not Implement

- React Native app
- Inngest
- LangGraph
- Whisper
- pgvector/memory
- Google Calendar API
- Stripe Connect
- OpenTable/Resy
- Official Airbnb/Booking.com APIs
- Social travel profiles