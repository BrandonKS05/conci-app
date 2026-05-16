"use client";

import type { ReactNode } from "react";
import { AppTopNav } from "@/frontend/components/app-top-nav";

export function SiteShell({
  title,
  eyebrow,
  children,
  /** When true, page body under the hero uses the same display serif as the title (e.g. saved trip home). */
  tripTypography = false,
  /** Optional content aligned to the right of the page title (e.g. host setup completion card). */
  titleRight,
  /** Wider main column for dense layouts (e.g. host setup month calendar). */
  contentWide = false,
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  tripTypography?: boolean;
  titleRight?: ReactNode;
  contentWide?: boolean;
}) {
  const hasHero = Boolean((title && title.trim()) || eyebrow || titleRight);
  return (
    <main className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <AppTopNav />
      <div
        className={`mx-auto flex min-h-[calc(100vh-4.5rem)] w-full flex-col px-5 py-6 sm:px-6 lg:px-8 ${contentWide ? "max-w-[min(100%,1800px)]" : "max-w-6xl"}`}
      >
        {hasHero ? (
          <section className="mb-7 lg:mb-9">
            {eyebrow ? (
              <p className="label-caps mb-3 text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">{eyebrow}</p>
            ) : null}
            <div
              className={`flex flex-col gap-6${titleRight ? " lg:flex-row lg:items-start lg:justify-between lg:gap-8 xl:gap-12" : ""}`}
            >
              {title && title.trim() ? (
                <h1 className="min-w-0 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-5xl lg:text-6xl">
                  {title}
                </h1>
              ) : null}
              {titleRight ? (
                <div className="w-full shrink-0 lg:max-w-3xl">{titleRight}</div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className={`flex-1 pb-10${tripTypography ? " font-display" : ""}`}>{children}</div>
      </div>
    </main>
  );
}
