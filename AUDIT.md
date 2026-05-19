# Conci App — UX & Visual Audit

**Audited:** 2026-05-19  
**Viewport:** 1280×800 desktop + 375×812 mobile  
**Method:** Live accessibility tree snapshots, DOM inspection, interaction testing via Preview tools on local dev server (localhost:3000). All Supabase/OpenAI/Stripe failures noted below are **local-only** (env vars not in worktree) — the live Vercel app has these configured and they work.

---

## Severity Key

| Label | Meaning |
|-------|---------|
| 🔴 Broken | Doesn't work at all, crashes, or blocks the user entirely |
| 🟡 Friction | Works but confusing, missing feedback, or produces wrong behavior |
| 🔵 Polish | Minor visual, copy, or accessibility improvement |

---

## 1. Landing Page (`/`)

### Copy & Labelling
- 🟡 **Three different labels for the same Join action** on the same page: `"Join a trip"` (desktop nav), `"Join trip"` (mobile nav), `"Join with a code"` (hero, footer, CTA section). Pick one and be consistent throughout.
- 🔵 **Logo link text is `"ConciConci"`** in DOM (expected — sr-only span + visible span), but one instance reads `"ConciCConci"` (extra `C`). Typo in a second header component or duplicate render.
- 🔵 **"SEE AN EXAMPLE" / "See an example"** — inconsistent casing between nav label and inline link.

### Navigation
- 🔵 **No Pricing link in landing page nav** — the app nav (post-login) has a Pricing link but the public landing page header doesn't. Users can't discover pricing without exploring.
- 🔵 **Hamburger menu (mobile) doesn't close on Escape key** — pressing Escape does nothing; only the × button closes it. Standard WCAG pattern requires Escape to dismiss.
- 🟡 **Hamburger `aria-expanded` stays `"true"` after close button click** — the state doesn't reset, breaking screen reader announcements.

### Content
- 🔵 **Footer contains only 2 links** (`Start a trip`, `Join with a code`) — no Privacy Policy, Terms of Service, or Help/Support link. Required before any public launch.
- 🔵 **One destination card image fails to load** (Unsplash URL returns no image locally; check CDN/proxy configuration on live app too).
- 🔵 **"STEP 01/02/03" labels** are rendered as two separate DOM elements (`<p>STEP 0</p><p>1</p>`) — visually they may merge, but the accessibility tree sees `"STEP 0"` and `"1"` as separate text nodes, making no semantic sense to a screen reader.
- 🔵 **Globe canvas has `width: 0, height: 0`** in `getBoundingClientRect` — the WebGL globe may not render in certain environments/browsers. No fallback image.

### Dark Mode
- 🟡 **Dark mode is not implemented end-to-end** — the codebase has extensive `dark:` Tailwind classes throughout every component, but the `dark` class is never added to `<html>`. The OS `prefers-color-scheme: dark` signal is ignored. There is no toggle. All that dark-mode CSS is dead code until this is wired up.

---

## 2. App Top Nav (all authenticated pages — `/trip-parser`, `/pricing`, etc.)

- 🟡 **Two `<nav>` elements rendered simultaneously** — `aria-label="Main"` (desktop) and `aria-label="Main (mobile)"` (scroll strip). The desktop nav's parent is `display:none` on mobile, but the links themselves still have `display: inline`, so they appear in the accessibility tree as interactive even when visually hidden. Screen readers will announce 10 links instead of 5.
- 🔵 **Mobile nav is a horizontal scroll strip** (`overflow-x: auto`, no scroll indicator) — 5 links laid out in a single nowrap row. Users have no affordance that it's scrollable; the last 1–2 links may be clipped.
- 🔵 **"Sign in" appears outside the nav element** in the DOM — it's a sibling, not a nav item. Minor semantic inconsistency.

---

## 3. Trip Parser — Input Phase (`/trip-parser`)

- 🟡 **Error from a failed Parse attempt persists into the form phase** — if a user types text, clicks "Parse & continue" (which fails), then clicks "Skip — fill in manually", the red error banner is still visible at the top of the "Confirm trip details" form. The error should clear when the phase transitions.
- ✅ **Empty parse validation works** — "Add some text or screenshots to parse." shown correctly.
- ✅ **Upload zone drag-and-drop structure** — click target correct, file input hidden correctly, up to 3 image limit enforced in state.
- 🔵 **Page title** — `"Conci — Everyone's Personal "Executive" Assistant"` uses curly quotes, looks odd in browser tab. Other pages use `"Title · Conci"` format. Should be `"Plan a Trip · Conci"`.
- 🔵 **No keyboard shortcut to submit** — pressing Enter in the textarea does not trigger Parse. Expected UX for a chat-input-style field.

---

## 4. Trip Parser — Form Phase (after "Skip")

- ✅ **Vibe tag buttons** toggle correctly — selected state uses `border-indigo-500 bg-indigo-50 text-indigo-700`, unselected is plain white. Visual difference is clear.
- ✅ **Pace buttons** (`packed`, `relaxed`, `balanced`) toggle correctly with same indigo selected state.
- ✅ **Destination required validation** — "Where are you going? Add a destination." shown on empty submit.
- ✅ **Date required validation** — "When is the trip? Add at least a start date." shown when destination is filled but no date.
- 🟡 **"Generate trip plan" failure shows `"Could not save trip."`** — generic message gives the user no information about what went wrong (auth? network? server?). Should distinguish between "not signed in" vs a real error.
- 🔵 **Number input for "How many people?"** uses a `<spinbutton>` (number input) with no min/max constraints visible — user can type `0` or `-5` without client-side validation.
- 🔵 **Date inputs have no placeholder** — the native `<input type="date">` shows `mm/dd/yyyy` on most browsers, but there's no label hint about expected format or relative guidance ("at least 2 weeks out").
- 🔵 **"Back" button** returns to input phase but doesn't restore the text or images the user typed — state is wiped.

---

## 5. Auth Page (`/auth`)

- 🔴 **No "Forgot password?" link** — users who forget their password have no recovery path at all. This is a blocker for any user who's been away for a while.
- 🟡 **Sign in / Sign up toggle is at the bottom of the form** — "Don't have an account? Sign up" sits below the submit button, easy to miss. Many users will try to sign in with a new email and get confused by the error rather than finding the toggle.
- 🟡 **Email/password inputs have no placeholder text** — just labels. Most auth forms include `placeholder="you@example.com"` for the email field. Minor but increases friction.
- 🔵 **Sign up form doesn't collect a display name** — the user is immediately in the app with no name set. Profile completeness will be low and the experience will feel impersonal.
- 🔵 **"Back to home" link** sits below the card in small text — hard to spot for users who land here by mistake.
- 🔵 **No confirmation that a magic-link or verification email was sent** — if the app uses email verification, there's no visible success state for it in the current UI.

---

## 6. Join Page (`/join?from=create`)

- 🟡 **`/join` (no query param) redirects to `/trip-parser`** — navigation items and the landing page link to `/join?from=create`, but if someone shares the bare `/join` URL (e.g. copy-pastes from address bar), they land on the trip creator, not the joiner. Confusing.
- 🟡 **Submitting empty code shows `"Could not join."`** — the input has no `required` attribute and no client-side check before the API call. Should show `"Please enter an invite code."` immediately without a network round-trip.
- 🔵 **Page title is generic** `"Conci — Everyone's Personal 'Executive' Assistant"` — should be `"Join a Trip · Conci"` for clarity in browser history and bookmarks.
- 🔵 **Back link says `"← Back to Create a Trip"`** — the wording assumes the user came from creating a trip, but they may have navigated directly. `"← Back"` or `"← Home"` is more neutral.

---

## 7. Pricing Page (`/pricing`)

- 🟡 **"Testing mode: every tier is $0/mo" banner is user-visible** — this reads as unprofessional to real users who aren't developers. It should be hidden behind an env flag or removed for production.
- 🟡 **"Subscribe" with no session → `"Could not start checkout."`** — instead of a generic error, the button should redirect to `/auth?next=/pricing` with a clear message: "Sign in first to subscribe."
- 🔵 **Plan card for "Host" has no POPULAR badge visually distinct from text** — the `"POPULAR"` label is present in the DOM but may be easy to miss depending on styling. Inspect shows it's just an inline text element.
- 🔵 **Feature comparison is text-only** — no checkmarks, icons, or visual hierarchy within the feature lists. Hard to scan quickly.
- 🔵 **"Host Pro" features list says "Everything in Host"** but doesn't show Host's features below — users have to read both cards to understand what they'd get.

---

## 8. Profile & My Trips Pages

- 🔴 **`/profile/me` crashes with full-page application error** locally — `createAuthServerClient` throws when Supabase env vars are missing. The page has no error boundary; it serves a blank crash screen instead of a graceful "sign in to view your profile" state. *(Works on Vercel.)*
- 🔴 **`/my-trips` crashes with the same full-page application error** locally. *(Works on Vercel.)*
- 🟡 **Both pages need graceful unauthenticated states** — if a user is somehow not logged in and hits these routes, they should get a redirect to `/auth?next=...` with a clear message, not a 500 crash. The middleware redirect should catch this, but the server component itself should also be defensive.

---

## 9. Mobile Responsiveness (375px)

- ✅ **No horizontal overflow** — `document.body.scrollWidth === 375`. No components break out of viewport.
- ✅ **H1 scales correctly** — 76px desktop → 48px mobile.
- ✅ **Destination cards** stack correctly on mobile.
- 🔵 **Mobile nav scroll strip has no visual affordance** — 5 nav links in `overflow-x: auto` with `nowrap`. There's no fade/gradient at the right edge to hint that it's scrollable. The last link may be clipped.
- 🔵 **Header height jumps to 93px on mobile** due to the scroll nav strip — this pushes content down more than expected and may create a jarring visual gap under the header.

---

## 10. Accessibility

- 🟡 **Two navs in accessibility tree on app pages** — see App Top Nav section. Screen readers will announce duplicate navigation landmarks.
- 🔵 **Destination card links have no visible text** — they rely on `aria-label="Start trip to Tokyo & Kyoto"`. If the aria-label is stripped or JS fails, the link is opaque.
- 🔵 **Vibe/pace buttons have no `aria-pressed` attribute** — they toggle state visually but don't announce their selected state to screen readers.
- 🔵 **Upload zone is a `<div>` with `onClick`** — not a `<button>` or `<label>`, so it's not keyboard-focusable by default. Keyboard-only users can't trigger the file picker.
- 🔵 **Form labels on auth page** — `<label>` elements are present and associated, which is correct.

---

## Summary Table

| # | Page | Severity | Issue |
|---|------|----------|-------|
| 1 | Landing | 🟡 | "Join" has 3 different labels |
| 2 | Landing | 🟡 | Hamburger `aria-expanded` doesn't reset on close |
| 3 | Landing | 🟡 | Dark mode not wired up despite dark: CSS everywhere |
| 4 | Landing | 🔵 | Logo renders "ConciCConci" (extra C typo) |
| 5 | Landing | 🔵 | No Pricing link in public nav |
| 6 | Landing | 🔵 | Escape key doesn't close hamburger menu |
| 7 | Landing | 🔵 | Footer missing Privacy Policy & Terms |
| 8 | App nav | 🟡 | Two `<nav>` elements both visible in a11y tree |
| 9 | App nav | 🔵 | Mobile scroll strip has no scroll affordance |
| 10 | Trip Parser | 🟡 | Error from Parse phase bleeds into Skip/form phase |
| 11 | Trip Parser | 🟡 | "Could not save trip." — generic, no user guidance |
| 12 | Trip Parser | 🔵 | Page title doesn't follow site convention |
| 13 | Trip Parser | 🔵 | "Back" loses all form state |
| 14 | Trip Parser | 🔵 | Number input has no min/max |
| 15 | Trip Parser | 🔵 | Upload zone not keyboard-accessible |
| 16 | Trip Parser | 🔵 | Vibe/pace buttons missing `aria-pressed` |
| 17 | Auth | 🔴 | No "Forgot password?" recovery flow |
| 18 | Auth | 🟡 | Sign up toggle hidden at bottom of form |
| 19 | Auth | 🟡 | No placeholder text on email/password fields |
| 20 | Auth | 🔵 | No display name collected on sign up |
| 21 | Join | 🟡 | `/join` (bare) redirects to trip creator, not joiner |
| 22 | Join | 🟡 | Empty code hits API before client-side check |
| 23 | Join | 🔵 | "Back to Create a Trip" label assumes wrong context |
| 24 | Pricing | 🟡 | "Testing mode" banner visible to real users |
| 25 | Pricing | 🟡 | Subscribe with no auth → generic error, no redirect |
| 26 | Profile | 🔴 | `/profile/me` crashes (no error boundary) — local only |
| 27 | My Trips | 🔴 | `/my-trips` crashes (no error boundary) — local only |
| 28 | Mobile | 🔵 | Nav scroll strip has no scroll indicator |

---

## Quick Wins (fix in < 30 min each)

1. **Clear error state on phase transition** — `setError(null)` when entering form phase
2. **"Forgot password?" link** — add below sign-in button, route to Supabase reset flow
3. **Consistent "Join" label** — pick one, use it everywhere (`"Join with a code"`)
4. **Empty join code validation** — `if (!code.trim()) { setError("Enter an invite code."); return; }`
5. **`aria-pressed` on vibe/pace buttons** — `aria-pressed={isSelected}`
6. **Privacy Policy & Terms links in footer** — even placeholder pages
7. **Remove or gate "Testing mode" banner** — `{process.env.NODE_ENV === 'development' && <TestingBanner />}`
8. **Page titles** — standardise to `"Page Name · Conci"` across all routes
9. **Fix hamburger `aria-expanded` on close**
10. **`/join` redirect** — handle bare `/join` → `/join?from=create` in middleware
