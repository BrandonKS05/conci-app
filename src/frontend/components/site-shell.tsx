"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { UserMenu } from "@/frontend/components/user-menu";
import { PRIMARY_APP_NAV } from "@/shared/app-nav";

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
  title: string;
  eyebrow?: string;
  children: ReactNode;
  tripTypography?: boolean;
  titleRight?: ReactNode;
  contentWide?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#0f0f0f] dark:text-neutral-200">
      <div
        className={`mx-auto flex min-h-screen w-full flex-col px-5 py-5 sm:px-6 lg:px-8 lg:py-6 ${contentWide ? "max-w-[min(100%,1800px)]" : "max-w-6xl"}`}
      >
        <header className="sticky top-3 z-20 mb-7 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)]/90 shadow-[var(--shadow-ambient-sm)] backdrop-blur-xl dark:border-white/10 dark:bg-dm-elevated dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:px-5">
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1c1c17] text-sm font-semibold text-[color:var(--surface)] dark:bg-neutral-100 dark:text-dm-page">
                C
              </div>
              <div>
                <p className="label-caps text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Conci</p>
                <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-500">
                  Everyone&apos;s Personal &ldquo;Executive&rdquo; Assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <UserMenu />
              <span className="hidden rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-1 text-xs font-medium text-[color:var(--on-surface-muted)] dark:border-white/10 dark:bg-dm-card dark:text-neutral-500 md:inline">
                Consumer-first flow
              </span>
            </div>
          </div>
          <nav className="mt-0 hidden items-center gap-1 overflow-x-auto border-t border-[color:var(--hairline)] px-4 pb-4 pt-3 dark:border-white/10 md:flex md:gap-2">
            {PRIMARY_APP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="label-caps rounded-lg px-4 py-2.5 text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] hover:text-[color:var(--on-surface)] dark:text-neutral-400 dark:hover:bg-dm-card dark:hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <section className="mb-7 lg:mb-9">
          {eyebrow ? (
            <p className="label-caps mb-3 text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">{eyebrow}</p>
          ) : null}
          <div
            className={`flex flex-col gap-6${titleRight ? " lg:flex-row lg:items-start lg:justify-between lg:gap-8 xl:gap-12" : ""}`}
          >
            <h1 className="min-w-0 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {titleRight ? (
              <div className="w-full shrink-0 lg:max-w-3xl">{titleRight}</div>
            ) : null}
          </div>
        </section>

        <div className={`flex-1 pb-24 sm:pb-10${tripTypography ? " font-display" : ""}`}>{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)]/95 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-dm-elevated md:hidden">
          <div
            className={`mx-auto flex items-center justify-between gap-2 ${contentWide ? "max-w-[min(100%,1800px)]" : "max-w-6xl"}`}
          >
            {PRIMARY_APP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 rounded-xl px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)] transition hover:bg-[color:var(--surface-container-low)] hover:text-[color:var(--on-surface)] dark:text-neutral-400 dark:hover:bg-dm-card dark:hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
