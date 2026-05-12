# Fix report — Landing / nav / CTA alignment slice

**Slice implemented:** First "small fixes now" group from [PRODUCT_GAP_AUDIT.md](PRODUCT_GAP_AUDIT.md):
- Hero CTA "Join with a code" → `/join?from=create`.
- Landing nav splits **Start a trip** vs **Join a trip** with distinct destinations.
- Landing copy rewritten to reflect the "super simple, zero-friction, AI-led group trip planning" vision.
- Create vs join paths made visually distinct on the landing page.
- Kept the existing Cool Luxury Travel visual system (same tokens, fonts, hairlines, shadows).

**Branch:** working off the current dev branch (uncommitted; this slice does not touch git config).

---

## What changed

### `src/frontend/components/landing-tw-plus-hero.tsx`
- Top nav now exposes two clearly separated entries:
  - `Start a trip` → `/trip-parser` (create flow, unchanged path).
  - `Join a trip` → `/join?from=create` (was previously `/trip-parser`).
- Mobile menu mirrors the same two entries, both with the corrected `href`s. The misleading "(no account)" label is gone.
- Hero eyebrow: `"Conci — Cool Luxury Travel"` → `"Conci — AI for group trips"`.
- Hero `h1`: `"Turn messy group chats into a real plan."` → `"Group trips, planned by AI."` (italic on "planned by AI").
- Hero subcopy rewritten to lead with the AI-led, zero-friction promise: "Describe the trip in one message. Conci builds a full itinerary, blends everyone's preferences, and keeps the plan moving — so no one has to babysit the group chat."
- Hero second line replaces the previous **inaccurate** "no login" promise (which contradicted current auth-gated `/join`) with an honest two-paths line: "Two ways in — start your own trip, or join a friend's with an invite code."
- Primary CTA cluster restructured:
  - **`Start a trip`** — filled charcoal pill (`primaryHeroLinkPillClass`), labeled underneath with `Create & host`.
  - **`Join with a code`** — outline pill rendered with design tokens already defined in `globals.css` (`--hairline-strong`, `--surface-container-lowest`, `--on-surface`, `--shadow-ambient-sm`, `--sage` focus ring), labeled underneath with `Invited by a friend`. Routes to `/join?from=create`.
  - Tertiary `See an example →` link unchanged.

### `src/app/page.tsx`
- `metadata.title` → `"Conci — AI for group trips"`; `metadata.description` rewritten to match the new framing.
- `steps[]` rewritten:
  - "Describe the trip in one message" (parser as one-shot, AI does the gap filling).
  - "AI builds the full itinerary for you" (preferences-aware).
  - "Invite the group with a single code" (joiners use invite code, plan updates itself).
- `differentiators[]`:
  - Removed "No app download for your friends" tile (its body promised "no accounts required" which doesn't match current auth). Replaced with "Built for groups, not solo travelers", which is on-vision and accurate.
  - Replaced "Not just suggestions — actual decisions" with "AI does the planning, not you" to land the AI-led pitch.
  - Last two tiles (memory + money) kept verbatim.
- Example section caption: `"Shared link · friends view without signing up · dates and votes layered on next"` → `"One shared plan · friends join with an invite code · votes and dates layered on as you go"` (no longer promises no signup).
- Example section CTA row now has both **`Start a trip`** (filled, existing emphasis class) and **`Join with a code`** (outline, same token-based styling as the hero secondary) — second appearance of the two-paths-obvious pattern.
- Footer "Join a Trip" link target unchanged (was already `/join?from=create`).

---

## Files changed

- `src/frontend/components/landing-tw-plus-hero.tsx`
- `src/app/page.tsx`

Created:
- `FIX_REPORT.md`

No other files modified. No new packages. No CSS, design tokens, env, middleware, auth, schema, or component-library changes.

---

## Build result

`npm run build` — ✅ **passed** (Next 15.5.15).

- 31 / 31 static pages generated.
- TypeScript + ESLint clean for the two edited files.
- One pre-existing lint warning remains in `src/frontend/components/trip-plan-build-progress-overlay-dark.tsx` (raw `<img>`). Not touched in this slice — out of scope per the constraint "smallest safe changes" and the workspace rule to prefer `next/image` only for new UI.

Bundle delta for `/` (landing): `4.36 kB` first chunk / `177 kB` First Load JS — within expected drift for a copy + small JSX restructure.

---

## Remaining issues from `PRODUCT_GAP_AUDIT.md` intentionally not fixed

These are explicitly out of scope per the slice constraints. Listed here so the next pass can pick them up.

### Small fixes deferred
- **Middleware redirect hygiene** (audit item 3) — `/auth` still receives invite query params; cannot fix without touching `src/middleware.ts`, which is excluded.
- **"Everyone can edit the calendar, pins, and flights" copy** inside the trip workspace (audit item 4) — workspace copy lives in `trip-host-setup-dashboard.tsx` and was excluded from this landing-only slice.
- **Page titles** for `/auth`, `/auth/reset-password`, key trip routes (audit item 5) — out of scope (would require touching auth and workspace routes).
- **`PRIMARY_APP_NAV`** (shared nav used on every signed-in surface, in `src/shared/app-nav.ts`) — left alone in this slice; only the public landing `LandingTwPlusHero` nav was updated. The two surfaces still tell slightly different stories until the shared nav is harmonized in a follow-up.

### Medium features deferred
- Resolve **join-without-login vs auth-required**: still inconsistent end-to-end. The landing copy is now honest ("two ways in"), but `/join` itself is still auth-gated by middleware. Real fix requires a product decision (make `/join` public OR rewrite all auth messaging) and a middleware change — both excluded.
- **Calendar-first workspace layout** — unchanged.
- **Per-day transport summary on calendar cells** — unchanged.
- **Always-visible cost rollup strip** at the top of the workspace — unchanged.
- **Non-owner "My preferences" card** on Collaborate / Overview — unchanged.
- **Manual "Search & add" hub per day** — unchanged.

### Big bets deferred
- Shared cross-trip memory + `@handles`.
- Calendar / availability sync.
- Autonomous booking from pooled funds.
- Tested copilot behavior ladder (find → closest → explain → follow-up → fallback) backed by evals.
- True multi-city leg builder with structured transport segments.

### Browser-report items relevant to vision, still outstanding
- Invite query-param leak on `/auth` URL.
- Inconsistent "Join…" targets on **non-landing** surfaces that still pull from `PRIMARY_APP_NAV`.
- Duplicate `<h1>` on `/pricing`.
- `/supabase-test` exposed in prod (deployment / route concern; excluded).

---

## Notes for the next agent / reviewer

- The two-paths-obvious pattern is now used in **two** places on the landing page (hero + example section). The footer still has only one ("Join a Trip" link). Adding a parallel "Start a trip" to the footer would be a one-line change next time.
- The outline button styling for "Join with a code" is implemented inline using existing tokens rather than added to `src/frontend/ui/primary-action.ts`, to keep this slice minimal. If a third place needs the same secondary pill, promote it to a shared class in that file.
- Landing copy is now honest about auth (does not claim "no login" / "no account"). If the team later decides to make `/join` truly public, the copy can be relaxed back to that promise in one place.
