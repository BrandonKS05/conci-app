"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggleButton } from "@/frontend/components/theme-provider";
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
    <main className="min-h-screen bg-transparent text-ink dark:text-neutral-200">
      <div
        className={`mx-auto flex min-h-screen w-full flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6 ${contentWide ? "max-w-[min(100%,1800px)]" : "max-w-6xl"}`}
      >
        <header className="sticky top-3 z-20 mb-7 rounded-[1.75rem] border border-white/80 bg-white/75 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-dm-elevated dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:px-5">
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 dark:bg-neutral-100 dark:text-dm-page dark:shadow-none">
                C
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-700 dark:text-neutral-400">
                  Conci
                </p>
                <p className="text-sm text-slate-500 dark:text-neutral-500">AI executive assistant MVP</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggleButton />
              <UserMenu />
              <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-white/10 dark:bg-dm-card dark:text-neutral-500 md:inline">
                Consumer-first flow
              </span>
            </div>
          </div>
          <nav className="mt-0 hidden items-center gap-2 overflow-x-auto border-t border-slate-200/80 px-4 pb-4 pt-3 dark:border-white/10 md:flex">
            {PRIMARY_APP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-transparent px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-ink dark:text-neutral-400 dark:hover:border-white/10 dark:hover:bg-dm-card dark:hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <section className="mb-7 lg:mb-9">
          {eyebrow ? (
            <p
              className={`mb-3 text-xs font-semibold uppercase tracking-[0.34em] text-brand-600 dark:text-neutral-500${tripTypography ? " font-display" : ""}`}
            >
              {eyebrow}
            </p>
          ) : null}
          <div
            className={`flex flex-col gap-6${titleRight ? " lg:flex-row lg:items-start lg:justify-between lg:gap-8 xl:gap-12" : ""}`}
          >
            <h1 className="min-w-0 max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-ink dark:text-white sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {titleRight ? (
              <div className="w-full shrink-0 lg:max-w-sm xl:max-w-md">{titleRight}</div>
            ) : null}
          </div>
        </section>

        <div className={`flex-1 pb-24 sm:pb-10${tripTypography ? " font-display" : ""}`}>{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/70 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-dm-elevated md:hidden">
          <div
            className={`mx-auto flex items-center justify-between gap-2 ${contentWide ? "max-w-[min(100%,1800px)]" : "max-w-6xl"}`}
          >
            {PRIMARY_APP_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 rounded-2xl px-3 py-3 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-ink dark:text-neutral-400 dark:hover:bg-dm-card dark:hover:text-white"
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
