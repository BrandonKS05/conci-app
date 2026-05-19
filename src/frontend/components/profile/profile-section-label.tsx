import type { ReactNode } from "react";

/** Section eyebrow matching trip-parser home cards (Active / Collaborate). */
export function ProfileSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">
      {children}
    </h2>
  );
}

export const profileCardClass =
  "rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-[#1a1a1a]/90 dark:shadow-none";

export const profilePillButtonClass =
  "rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-4 py-1.5 text-sm font-medium text-[color:var(--on-surface)] transition hover:border-[color:var(--on-surface)] hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-[#222] dark:text-[#ebe9e4] dark:hover:bg-[#2a2a2a]";
