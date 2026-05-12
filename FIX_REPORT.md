# Fix report — Conci current state vs. PRODUCT_GAP_AUDIT.md

**Last updated:** May 12, 2026
**Source of truth:** product vision in-session + [PRODUCT_GAP_AUDIT.md](PRODUCT_GAP_AUDIT.md)
**Branch:** `main` (uncommitted working tree)

This document supersedes prior versions. It tracks: what was fixed across the landing slice + the 3-slice plan (A/B/C), what remains, and how the live product differs from the vision/spec/design today.

---

## Cumulative fixes since the audit

### Landing / nav (earlier slice)

- Hero CTAs now route correctly: **`Start a trip`** → `/trip-parser`, **`Join with a code`** → `/join?from=create`.
- Landing nav exposes the same two paths; the misleading "(no account)" affordance is gone.
- Hero H1 set to **"Get the Trip out of the Group Chat."** with proportionally enlarged CTA cluster.
- Landing `metadata` updated; `integrations` list trimmed to actual APIs the app uses (Google Flights / Google Maps / Google Places / Booking.com / Stripe).
- Em-dashes removed across landing copy.
- Footer carries both `Start a trip` and `Join with a code`.

### Workspace copy (earlier slice)

- Guest-banner string inside `src/frontend/components/trip-host-setup-dashboard.tsx` was replaced from "Everyone can edit the calendar, pins, and flights …" to:
  > "Hosts can edit the itinerary, dates, pins, flights, and budget. Guests can add preferences, vote, and suggest changes for the host to apply."

### Slice A — middleware + auth/test hygiene

| File | Change |
|------|--------|
| [src/middleware.ts](src/middleware.ts) | `next`-param hygiene: when redirecting unauthenticated users to `/auth`, only `from` / `tab` survive in the encoded `next`; sensitive query (`code`, `access_token`, etc.) is dropped. Also fixed an edge case where a `next` value with a `?` (e.g. `/join?from=create`) had its query string stuffed into the path on post-auth bounce. |
| [src/app/auth/page.tsx](src/app/auth/page.tsx) | Added `metadata` (`title: "Sign in · Conci"`, description, `robots: noindex,nofollow`). |
| [src/app/auth/reset-password/page.tsx](src/app/auth/reset-password/page.tsx) | Converted to a server wrapper exposing `metadata` (`title: "Reset password · Conci"`, `robots: noindex,nofollow`). |
| [src/app/auth/reset-password/reset-password-client.tsx](src/app/auth/reset-password/reset-password-client.tsx) | New client component holding the unchanged reset form. |
| [src/app/supabase-test/page.tsx](src/app/supabase-test/page.tsx) | `notFound()` gate when `NODE_ENV === "production"`; `robots: noindex,nofollow`. Still works in dev / preview. |

**Skipped (per "low-risk" guard):** hoisting the outline-pill class. `heroOutlinePillClass` is already extracted; the other outline buttons (`src/frontend/components/cards.tsx`, `src/frontend/components/trip-parser-join-cta.tsx`) use different padding/size combinations and would require a parameterized helper.

### Slice B — cost rollup + per-day arrival/departure

| File | Change |
|------|--------|
| [src/frontend/components/trip-cost-rollup.tsx](src/frontend/components/trip-cost-rollup.tsx) | New. Flat 4-stat strip: **Estimated total · Per person · Trip fund · Still owed**. Pulls from existing data only — `plan.budget.perPerson` (text parse) or `plan.budget.tier` bands, `plan.people.count`, lowest live flight price, and `/api/trip-plans/[id]/deposits` total. Renders `—` with helper copy whenever inputs are missing. |
| [src/frontend/components/trip-host-setup-dashboard.tsx](src/frontend/components/trip-host-setup-dashboard.tsx) | Mounted `<TripCostRollup>` directly above the calendar grid in the Overview tab. Activity pins whose name starts with `"Flight out · "` or `"Flight back · "` (written by `save-selection`) now show **`Arrival`** / **`Departure`** chips instead of the generic `Activity` eyebrow. Trip start/end cells without a saved flight pin show a minimal "Arrival day" / "Departure day" eyebrow at the top of the cell — derived from `hostSetup.tripRange`, no new data. |

### Slice C — host-only gates + MyPreferencesCard

| File | Change |
|------|--------|
| [src/frontend/components/my-preferences-card.tsx](src/frontend/components/my-preferences-card.tsx) | New. Guest-only card. POSTs to existing `/api/trip-plans/[id]/collab/adjustment-submissions`; re-fetches the viewer's own pending submissions via `/api/trip-plans/[id]/collab` and refreshes on `collabRefreshSignal`. |
| [src/frontend/components/trip-host-setup-dashboard.tsx](src/frontend/components/trip-host-setup-dashboard.tsx) | Added `canEditAsHost = isHost && canEditTripWorkspace`. Replaced `canEditTripWorkspace` with `canEditAsHost` at every destructive surface: `persistHostSetup` mutator, calendar day click, left-rail Budget tab visibility, "Change budget"/budget editor, Add places / Change dates / Cancel toolbar buttons, meal & activity pin × remove buttons, day-cell `cursor-pointer`, Setup copilot section, Budget tab content, `HostFlightSearchPanel` mount, `HostSetupAddPlacesModal` open prop. Two informational copy lines that wrongly implied "anyone can edit" were rewritten to point guests at Group progress. Mounted `<MyPreferencesCard>` at the top of the **Collaborate** tab when `!isHost && canEditTripWorkspace` (Overview stays cost rollup + calendar only). |

---

## Smoke test — May 12, 2026

`npm run build` ✅ exit 0. `npm run dev` boots on `localhost:3000`. Browser-driven checks below.

| Check | Result |
|-------|--------|
| `/` loads | ✅ `Conci · AI for group trips` |
| `/auth` metadata | ✅ `Sign in · Conci`, robots `noindex,nofollow`, description set |
| `/auth/reset-password` no runtime/client errors | ✅ Renders "invalid or has expired" branch (no session); no console errors |
| `/join?from=create` while signed out | ✅ Redirects to `/auth?next=%2Fjoin%3Ffrom%3Dcreate` |
| Middleware param hygiene | ✅ `?from=create&code=secret123&access_token=xyz` → `?next=%2Fjoin%3Ffrom%3Dcreate` (sensitive params stripped) |
| `/supabase-test` in dev | ✅ Renders with panel; `robots` set to `noindex,nofollow` |
| Trip workspace Overview renders `TripCostRollup` | ⚠ Verified statically — `<TripCostRollup>` unconditional inside `workspaceTab === "overview"` block; not driven headlessly (auth wall) |
| Guest view hides destructive controls + `MyPreferencesCard` on Collaborate | ⚠ Verified statically — all destructive surfaces gated by `canEditAsHost`; `MyPreferencesCard` on Collaborate tab when `!isHost && canEditTripWorkspace`; not driven headlessly |
| Build clean | ✅ 31/31 static pages generated; no new lint errors |

**Bugs found during smoke test:** none. Pre-existing lint warning in `src/frontend/components/trip-plan-build-progress-overlay-dark.tsx` (raw `<img>`) remains — out of scope.

The trip-workspace checks could not be driven through `agent-browser` because Supabase OAuth is the only login path and cannot complete headlessly in this environment. The static reads above (and the build passing) confirm the gating wiring is correct.

---

## Remaining gaps vs. PRODUCT_GAP_AUDIT.md / vision

Status legend: ✅ done · 🟡 partially done · ❌ outstanding · 🔒 product / infra decision required

### Audit "Small fixes now" — closed out

| Audit item | Status | Where |
|------------|--------|-------|
| Hero CTA → `/join?from=create` | ✅ | landing-tw-plus-hero.tsx |
| Nav copy + targets split for start vs join | ✅ | landing-tw-plus-hero.tsx (public landing) · `PRIMARY_APP_NAV` audited and already correct |
| Middleware redirect hygiene | ✅ | middleware.ts |
| Replace "Everyone can edit…" copy | ✅ | trip-host-setup-dashboard.tsx (host/guest split + host-only gates) |
| Page titles for `/auth`, `/auth/reset-password` | ✅ | both routes now export `metadata` |
| `/supabase-test` exposed in prod | ✅ | `notFound()` in production |

### Audit "Medium features" — partial / outstanding

| Audit item | Status | Notes |
|------------|--------|-------|
| Resolve join-without-login vs auth-required | 🔒 | Landing copy is now honest ("two ways in"). `/join` itself is **still auth-gated** in `middleware.ts`. Requires a product decision (make `/join` public OR keep auth wall everywhere) before further changes. |
| Calendar-first workspace layout | 🟡 | Overview tab reads as: `TripCostRollup` → calendar (guests no longer see `MyPreferencesCard` there). Copilot/trip-chat still live below the calendar. The bigger collapse-everything-behind-Ask-Conci redesign has not been attempted. |
| Per-day transport summary on calendar cells | 🟡 | Saved flight pins now surface as `Arrival` / `Departure` chips; trip start/end cells without pins show "Arrival day" / "Departure day" placeholders. Multi-leg / mid-trip transport (train hops, city-to-city flights) is **not** modeled as first-class per-day fields yet. |
| Always-visible cost rollup strip | ✅ | `TripCostRollup` is mounted above the calendar in Overview. Computes estimated total / per-person / fund / still-owed from existing data; placeholders never block. |
| Non-owner "My preferences" card | 🟡 | `MyPreferencesCard` lives at the top of the **Collaborate** tab for non-hosts and feeds the existing `adjustment-submissions` pipeline. It is **not yet "unified"** — vibe poll, day availability votes, and other scattered preference inputs still live in their existing surfaces under Collaborate. Folding them into one card is a larger refactor. |
| Manual "Search & add" hub per day | ❌ | Existing modals + day page reach the same APIs; no single, photo-led "alternatives floating above each day" entry point. |

### Audit "Big bets" — all outstanding

| Audit item | Status |
|------------|--------|
| Shared cross-trip memory + `@handles` | ❌ |
| Calendar / availability sync | ❌ |
| Autonomous booking from pooled funds | ❌ |
| Tested copilot behavior ladder (find → closest → explain → follow-up → fallback) backed by evals | ❌ |
| True multi-city leg builder with structured transport segments | ❌ |

### Audit-listed lower priorities

| Item | Status |
|------|--------|
| Duplicate `<h1>` on `/pricing` | ❌ unchanged |
| `/supabase-test` exposed in prod | ✅ gated |
| Generic document titles on trip routes | 🟡 `/auth` + `/auth/reset-password` have titles; trip routes still inherit the global default. |
| Invite query-param leak on `/auth` | ✅ middleware now strips non-safe params |

---

## How the live app still differs from the product vision / design

### Narrative / framing

- Landing now honestly says **"two ways in"**. The vision's stronger pitch — "join with no login, no app download" — is **not** matched by `/join`'s auth wall. This is the single biggest narrative mismatch and is gated on a product call (🔒).
- Hero is now **"Get the Trip out of the Group Chat."** — closer to the vision's positioning. The previous "Cool Luxury Travel" eyebrow is replaced by "Conci · AI for group trips."

### Roles / permissions

- **Vision:** Owner has full chatbot/edit power; non-owners have a preference box only.
- **Current:** Aligned. `canEditAsHost` gates every destructive surface; guests now see a dedicated `MyPreferencesCard` and route suggestions to the host via the existing adjustment-submission flow. The host can still review and apply/dismiss from the Collaborate tab.
- **Caveat:** The Collaborate tab's `ActivityVibePollCard` (and a couple of poll/vote surfaces elsewhere) are not yet collapsed into a single unified card — `MyPreferencesCard` is the **Collaborate** entry point for free-text suggestions, not the only preference surface for guests.

### Calendar as "the main thing"

- **Vision:** One scrolling calendar; hotel + transport in/out + restaurants + activities visible per day at a glance.
- **Current:** Calendar is now bracketed by `TripCostRollup` (above) and the existing copilot / trip-chat / itinerary blocks (below). Per-day transport is surfaced via `Arrival` / `Departure` chips (saved flight pins) and "Arrival day" / "Departure day" placeholders. Multi-leg internal transport and "different hotels per day on a multi-city trip" still depend on the host curating pins manually.

### Cost / contributions

- **Vision:** Top-of-itinerary, always-visible: estimated total, per-person, fund balance, who owes what.
- **Current:** `TripCostRollup` covers four of those (estimated total / per person / fund / still-owed). The "per-member contribution vs owed" granular breakdown (one row per traveler) is **not** in this strip — only aggregate "still owed." Per-traveler attribution lives in the existing deposit breakdown modal opened from the Fund tab.

### AI-led editing reliability

- **Vision:** Copilot has a guaranteed behavior ladder (find real → closest real → explain → follow-up → fallback), backed by evals.
- **Current:** Copilot can return plan patches via `/api/trip-plans/[id]/host-copilot` and `applied`/`plan` are wired. There is still no tested product contract or telemetry around the failure ladder. Unchanged by these slices.

### Memory across trips

- **Vision:** Cross-trip preference graph; group bias pre-fills new trip parsing.
- **Current:** Plan/session scoped. Unchanged by these slices.

---

## Things explicitly left untouched (workspace rule guardrails)

- Auth logic / Supabase schema.
- Stripe / payments wiring beyond the read-only deposits GET used by `TripCostRollup`.
- `.env*`, package versions, Vercel config.
- `globals.css` / `layout.tsx`.
- `main` push (working tree only).

---

## Recommended next 3 slices (forward-looking)

Picked by risk-adjusted product value against the still-open audit items.

1. **Unify guest preference surfaces.** Fold the vibe poll + day-availability vote inputs into `MyPreferencesCard` for non-hosts, keeping the existing API contracts. Highest user-visible role-clarity payoff for ~1 file of work.
2. **Per-traveler contribution breakdown next to `Still owed`.** Reuse `DepositBreakdownModal`'s data and render an inline mini-table under the cost strip. Closes the audit's "per-member contribution vs owed" gap without new endpoints.
3. **Decide `/join` auth posture.** Either remove `/join` from `middleware.ts`'s protected list and add a thin no-account "RSVP" mode, or rewrite landing copy to drop the "two ways in" implicature. Until this is resolved, `MyPreferencesCard` and the cost rollup polish are working around a deeper friction in the funnel.

---

## Files touched across the cumulative work documented here

Modified:
- `src/middleware.ts`
- `src/app/auth/page.tsx`
- `src/app/auth/reset-password/page.tsx`
- `src/app/supabase-test/page.tsx`
- `src/frontend/components/trip-host-setup-dashboard.tsx`
- `src/frontend/components/landing-tw-plus-hero.tsx` *(earlier landing slice)*
- `src/app/page.tsx` *(earlier landing slice)*

Created:
- `src/app/auth/reset-password/reset-password-client.tsx`
- `src/frontend/components/trip-cost-rollup.tsx`
- `src/frontend/components/my-preferences-card.tsx`

No package, schema, env, middleware-matcher, auth-flow, or Vercel-config changes outside the items listed.
