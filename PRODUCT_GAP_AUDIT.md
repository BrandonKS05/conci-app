# Product gap audit — Conci vs. product vision

**Source of truth:** The product vision/spec provided in-session (super simple, zero friction, AI-led group trip planning).

**Evidence used:** [BROWSER_TEST_REPORT.md](BROWSER_TEST_REPORT.md), current routes and components (notably `src/middleware.ts`, `src/app/join/page.tsx`, `src/app/trip-parser/page.tsx`, `src/frontend/components/trip-host-setup-dashboard.tsx`, `src/frontend/components/host-setup-copilot.tsx`, `src/frontend/components/trip-collaboration-panel.tsx`, `src/frontend/components/trip-deposit-tracker.tsx`, `src/frontend/components/booking-checklist.tsx`, `src/frontend/hooks/use-active-trip-tab.ts`).

**Constraints for this document:** No code changes; no edits to auth, Stripe, Supabase schema, `.env`, package versions, or Vercel config.

---

## Executive summary

Conci already has a credible **skeleton** of the vision: parser → persisted plan, a host workspace with calendar + pins, collaboration (preferences, votes, day-level options), a **host copilot** that can return an updated `TripPlan`, deposits/contributions, flight search + curation, per-day deep links, and a booking checklist with outbound links. The gap is mostly **friction, narrative alignment, and depth of the “AI action agent”** — especially for **join without login**, **calendar as the single hero surface**, **transportation embedded in the day story**, **always-on cost rollups**, **non-owner vs owner clarity**, and **shared memory / reliability** called out in the vision.

---

## What already matches the vision

| Vision theme | How the app aligns today |
|--------------|---------------------------|
| **Two entry paths (start vs join)** | Landing and nav expose “start planning” vs join-with-code flows; `/trip-parser` is the create surface; `/join?from=create` exists for code entry. |
| **Describe anything → plan** | `TripParser` chat-style composer persists plans and navigates into host setup after generation (per architecture in repo; not re-tested in browser for this audit). |
| **Calendar + per-day detail** | Host setup shows a calendar; days link to `/trip/[id]/setup/day` for deeper editing; pins (meals, activities, hotel edges) render in cells. |
| **Manual edit** | Host can change dates (with confirm/cancel pattern), add/remove pins, use day page modals and `persistHostSetup` PATCH. |
| **AI that can change data, not only chat** | `HostSetupCopilot` POSTs to `/api/trip-plans/[id]/host-copilot` and calls `onResult` with `plan` + `applied`. Day page uses the same endpoint with `focusDateIso`. |
| **Owner applies group input** | `TripCollaborationPanel` includes an owner path to apply member suggestions via host-copilot + mark submissions applied. |
| **Preferences / voting** | Collaboration state supports polls, day votes, adjustment submissions (per existing types and UI). |
| **“Not interested” / alternatives on flights** | Curated flight rows + curation mutations exist; recent work wired actions and cookies. |
| **Contributions** | `TripDepositTracker` + contribute flow track money into the trip fund (Stripe-backed APIs exist in repo). |
| **Booking links** | Pins use maps URLs / booking URLs where modeled; `BookingChecklist` builds fallback search URLs for hotel/flights/dining. |
| **Realtime-ish collaboration** | Workspace uses realtime subscription to refresh `plan` / status for the group. |
| **Refit on date change** | After confirming a new range, client calls existing `generate-itinerary` and merges preserved pins (recent implementation). |

---

## What is missing (vs vision)

### Start / join — zero friction

- **Vision:** Join with a code or a link with minimal friction; marketing copy says friends can join **with no login**.
- **Reality:** `middleware.ts` treats `/join` as **protected** — unauthenticated users are redirected to `/auth` with `next=/join…`. That contradicts the hero promise on the landing page.
- **Reality:** Hero “Join with a code” still links to `/trip-parser` (create path), not `/join` — see [BROWSER_TEST_REPORT.md](BROWSER_TEST_REPORT.md) P1.
- **Reality:** Invite query params leak onto `/auth` URLs (privacy + confusion) — browser report P1.

### Main itinerary / calendar — “calendar is the main thing”

- **Vision:** One dominant calendar; on each day: hotel, **transportation in/out**, restaurants, experiences, other activities; multi-city shows different hotels/flights per applicable day.
- **Reality:** Calendar is strong but shares the main column with copilot, trip chat, invite strip, tabs, etc. **Transportation was moved to its own tab** — good for decluttering, but it **splits the “day story”** the vision describes (hotel + transport + meals on one glance).
- **Reality:** Flight **in/out per day** is not modeled as first-class fields on each calendar cell; transport is largely a **separate rail/tab** (search + curated rows + schedule component) rather than inline “this day’s arrival leg.”
- **Multi-city:** `hotelStays[]` and multiple pins support multi-stop *in data*, but the UX does not clearly read as “multi-city itinerary” with distinct inter-city legs unless the host curates it manually.

### AI-led editing — “always an AI” + reliability

- **Vision:** Always-available AI that **reliably** moves dinner, finds cheaper hotels, finds cheapest flights, never fails silently, never hallucinates; shared memory across people and past trips.
- **Reality:** Copilot exists and **can** apply plan patches when the server returns `applied` + `plan`, but there is no product-level guarantee of the behavior ladder (find real → closest real → explain → follow-up → fallback) from the vision.
- **Reality:** No **cross-trip / cross-user memory** in product (usernames on the trip, preferences from past trips) — parser and copilot are largely **session/plan scoped**.
- **Vision:** Parser “asks a few specific questions” — parser UX may still feel open-ended or brittle (called out in vision as “still weird”); not re-litigated here beyond noting **no guided micro-question funnel** is enforced in code review.

### Owner vs non-owner

- **Vision:** Owner has full change-anything chatbot; non-owners have a **preference box** and feedback (“not interested”, suggest alternatives) without full control; AI blends preferences and **suggests changes to the owner**.
- **Reality:** Collaboration + adjustment submissions + owner “apply with copilot” approximates the **suggest → owner merge** loop.
- **Reality:** Dashboard copy still says **“Everyone can edit the calendar, pins, and flights”** when the trip is editable — that is **not** “non-owner gives preferences only”; it collapses owner vs guest mental model and conflicts with the vision’s separation of powers.
- **Reality:** Budget tab behavior for non-owners is thinner than “preference box for budget, allergies, constraints” as a single obvious surface (some exists under Collaborate / polls; not one unified “my preferences” card).

### Manual search / add experience

- **Vision:** Strong intentional search and add; floating alternatives with **pictures** on top of prefilled suggestions when clicking a day.
- **Reality:** Day page and modals add places, but the vision’s “floating rich alternatives with photos on every day click” is **not** the dominant interaction model everywhere; search is split across flights API, hotels API, maps links, and parser — **power exists, discoverability and cohesion lag the pitch**.

### Costs / contributions / booking

- **Vision:** Top of calendar: **estimated total**, **per person**, **who owes what**, **who contributed**; long-term auto-booking from pooled funds; short-term owner withdraws and books.
- **Reality:** Trip fund + contributions exist; **AI-rolled-up estimated trip total** at the top of the itinerary view is not a first-class, always-visible aggregate in the same place as the calendar (budget line exists; full rollup of flights+hotels+meals+experiences as “trip total” is not spelled as the vision demands).
- **Reality:** Owner withdraw-and-book is closer to current Stripe model than “Conci spends the pool automatically” — acceptable as interim, but the **UI story** should spell that interim clearly next to the fund.

### “Super simple / AI-led” feel

- **Reality:** Feature surface is broad (tabs, collaborate, fund, transportation, packing links, chat, copilot, itinerary details). That is appropriate for power users but **dilutes the single hero narrative** (“calendar is the main thing”) unless navigation and copy aggressively prioritize the default path.

---

## What feels different or too complex

1. **Tabs vs single canvas.** The vision reads like one scrolling itinerary canvas; the app uses **Overview | Transportation | Budget | Fund | Collaborate** — correct engineering decomposition, but higher **cognitive load** than “open app → see your trip days.”
2. **“Everyone can edit”** vs differentiated roles — increases chaos and contradicts the vision’s owner/non-owner story.
3. **Multiple “join” labels and destinations** (browser report P2) — undermines trust in a “simple” product.
4. **Auth wall on `/join`** while marketing promises no-login join — feels like a **bait-and-switch** to a new user.

---

## Browser report issues that matter most for the vision

| Browser finding | Why it hurts the vision |
|-----------------|-------------------------|
| **Join with a code → `/trip-parser`** | Breaks “type a code or open a link” simplicity; sends joiners into create flow. |
| **`/join` behind auth + “no login” copy** | Directly violates zero-friction join; blocks the whole “friends RSVP without an app download” story unless product explicitly requires accounts. |
| **Query param leak on `/auth`** | Invites are sensitive; friction + trust issue for a social product. |
| **Inconsistent “Join…” nav targets** | Users don’t know whether they are joining or creating; opposite of “super simple.” |

Lower priority for vision (still worth fixing): duplicate `<h1>` on pricing, generic document titles, `/supabase-test` public in prod.

---

## Recommended fixes — ranked by priority

### Small fixes now (low risk, high alignment)

1. **Hero CTA:** Point “Join with a code” at `/join?from=create` (and preserve `code` query when pasted from marketing links).
2. **Nav copy + targets:** Split “Create a trip” vs “Join with a code” in `PRIMARY_APP_NAV` / hero so labels and destinations are **one story**.
3. **Middleware redirect hygiene:** When redirecting unauthenticated users to `/auth`, **strip non-`next` query params** from the auth URL (keep invite code only inside `next` if needed).
4. **Replace “Everyone can edit…” copy** with something accurate: e.g. host vs guest capabilities, or gate destructive edits to host only if that matches product.
5. **Page titles** for `/auth`, `/auth/reset-password`, key trip routes — tab bar clarity for people living in 12 tabs.

### Medium features (substantial UX / product design)

1. **Resolve join-without-login vs auth-required:** Either (a) make `/join` (and maybe read-only trip preview) **public** with progressive signup at commit, or (b) rewrite **all** marketing to “create a free account to join.” Pick one; half measures hurt most.
2. **Calendar-first layout:** Default Overview to **calendar + day strip** occupying above-the-fold; collapse copilot/chat behind a single “Ask Conci” entry point until opened.
3. **Per-day transport summary on the calendar cell** (even one line: “Arrival flight”, “Train to X”) synced from saved flight pins / legs — so Transportation tab supplements rather than replaces the day story.
4. **Cost strip:** One module at top: estimated total / per person / fund balance / per-member contribution vs “owed” (even if some numbers are heuristic with disclaimers).
5. **Non-owner “My preferences” card** on Collaborate (or Overview): free text + structured chips that feed the same adjustment pipeline the owner already applies.
6. **Manual search hub:** One obvious “Search & add” affordance per day that opens the existing modals/search with consistent imagery (reuse place preview cards everywhere).

### Later / big product bets

1. **Shared memory & @handles:** Cross-trip preference graph; invite by username; pre-fill group bias when parser starts.
2. **Calendar sync + availability optimization** (“when most people are free”) — integrations, privacy, ranking — multi-quarter bet.
3. **Autonomous booking from pooled funds** — legal, payments, reconciliation, supplier APIs — clearly beyond “withdraw and book” but is the north-star in the vision.
4. **Guaranteed copilot behavior ladder** (find / closest / explain / follow-up / fallback) as a **tested product contract** backed by evals and telemetry, not only prompt engineering.
5. **True multi-city leg builder** (city A → B → C) with explicit transport segments and per-segment booking links generated from structured data, not only maps search fallbacks.

---

## What was not validated in this audit

- Signed-in flows end-to-end (parser generation, workspace tabs, refit, flight buttons) — blocked in browser session per [BROWSER_TEST_REPORT.md](BROWSER_TEST_REPORT.md); gaps above still hold from **code + vision** comparison.
- Stripe payout correctness, production Supabase rules, mobile ergonomics of every modal.
- Quality of LLM outputs under adversarial prompts.

---

## Closing note

The codebase is **closer to the vision than a generic itinerary app** (copilot applies patches, collaboration exists, money and booking links exist). The largest **product** gaps are **join friction vs marketing**, **role clarity (owner vs guest)**, **calendar + transport + cost as one story**, and **AI reliability + memory** — which are exactly where the vision spends most of its words.

No code was changed in producing this file.
