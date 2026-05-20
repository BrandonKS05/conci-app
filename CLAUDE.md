# Conci — Claude Code Rules

## Project Overview

Conci is a Next.js 15 / React 19 web app for AI-led group trip planning. Stack: TypeScript, Tailwind CSS, Supabase (auth + DB), Stripe (payments), OpenAI (itinerary generation), Framer Motion.

Key directories:
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

## Product Priorities

- Core flows: start/join trip, itinerary view, AI-assisted editing, group preferences, voting, booking links, costs, contributions.
- Design: travel-focused aesthetic — not a generic SaaS dashboard.
- Data: never substitute real travel/API logic with mock or fake data.
- AI: itinerary generation uses OpenAI via `src/app/api/trip-plans/[id]/generate-itinerary/route.ts` and related routes.

## Architecture Notes

- Auth: Supabase SSR (`@supabase/ssr`) — middleware-based session handling.
- Payments: Stripe — webhooks at `src/app/api/webhooks/stripe/route.ts`.
- AI routes stream responses; handle streaming errors carefully.
- Places/maps data comes from Google Places API via `src/app/api/places/`.
- Flight search: `src/app/api/trip-plans/[id]/flights/`.
- Collab/voting: `src/app/api/trip-plans/[id]/collab/` and `spotlights/`.
