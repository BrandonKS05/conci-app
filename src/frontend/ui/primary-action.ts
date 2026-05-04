/**
 * TripParser chat Send–aligned filled primary actions: slate pill in light mode,
 * warm off-white pill in dark mode (`#ebe9e4`).
 */
export const primaryFilledInteractive =
  "bg-slate-900 font-semibold text-white transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-40 dark:bg-[#ebe9e4] dark:text-[#141414] dark:hover:bg-white";

export const primaryFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-[#d4d2cd] dark:focus-visible:ring-offset-dm-page";

/** Navbar / landing: full pill (matches TripParser Send shape). */
export const primaryNavPillClass = `inline-flex items-center justify-center rounded-full px-4 py-2 text-xs shadow-sm sm:px-5 sm:text-sm ${primaryFocusRing} ${primaryFilledInteractive}`;

/** Hero CTAs (`Start planning`, `Join with a code` as filled primary — same palette). */
export const primaryHeroLinkPillClass = `inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm shadow-sm ${primaryFocusRing} ${primaryFilledInteractive}`;

/** Taller centered CTA (e.g. home example strip). */
export const primaryHeroEmphasisLinkClass = `inline-flex h-12 items-center justify-center rounded-full px-8 text-sm shadow-sm ${primaryFocusRing} ${primaryFilledInteractive}`;

/** Forms (join code submit, wider tap targets); not forced full-width. */
export const primaryFormButtonClass = `inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold shadow-sm ${primaryFilledInteractive}`;

/** Selected / active compact control (votes, date chips) — same surface as primary CTA. */
export const primarySelectedCompactClass = primaryFilledInteractive;
