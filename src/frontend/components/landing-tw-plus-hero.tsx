"use client";

import { ElDialog, ElDialogPanel } from "@tailwindplus/elements/react";
import Link from "next/link";
import { UserMenu } from "@/frontend/components/user-menu";
import { primaryNavPillClass } from "@/frontend/ui/primary-action";

/**
 * Oversized hero CTA pills — local to the landing hero only.
 * (Do not migrate `primaryHeroLinkPillClass` to these sizes: it is reused
 * by the home example strip where the smaller size is correct.)
 */
const heroFilledPillClass =
  "inline-flex items-center justify-center rounded-full bg-[#1c1c17] px-9 py-4 text-base font-semibold tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] sm:px-10 sm:py-4 sm:text-lg dark:bg-white dark:text-[#1c1c17] dark:hover:bg-neutral-200";

const heroOutlinePillClass =
  "inline-flex items-center justify-center rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-9 py-4 text-base font-semibold tracking-wide text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[color:var(--surface-container-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] sm:px-10 sm:py-4 sm:text-lg dark:border-white/10 dark:bg-dm-elevated dark:text-[color:var(--on-surface)] dark:hover:bg-dm-page";

export function LandingTwPlusHero() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-50">
        <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center">
            <Link href="/" className="-m-1.5 flex min-w-0 items-center p-1.5 outline-none">
              <span className="sr-only">Conci</span>
              <span className="font-display text-2xl font-semibold tracking-tight text-[#1c1c17] dark:text-white sm:text-[1.75rem]">
                Conci
              </span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-6">
            <Link
              href="/trip-parser"
              className="label-caps hidden text-[#444748] transition hover:text-[#1c1c17] dark:text-[#9c9a96] dark:hover:text-[#ebe9e4] sm:inline"
            >
              Start a trip
            </Link>
            <Link
              href="/join?from=create"
              className="label-caps hidden text-[#444748] transition hover:text-[#1c1c17] dark:text-[#9c9a96] dark:hover:text-[#ebe9e4] sm:inline"
            >
              Join a trip
            </Link>
            <Link href="/join?from=create" className={`${primaryNavPillClass} sm:hidden`}>
              <span>Join trip</span>
            </Link>
            <div className="hidden lg:block">
              <UserMenu />
            </div>
            <div className="lg:hidden">
              <button
                type="button"
                command="show-modal"
                commandfor="mobile-menu"
                className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700 dark:text-gray-200"
              >
                <span className="sr-only">Open main menu</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                  className="h-6 w-6"
                >
                  <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </nav>
        <ElDialog>
          <dialog id="mobile-menu" className="backdrop:bg-transparent lg:hidden">
            <div tabIndex={0} className="fixed inset-0 focus:outline-none">
              <ElDialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-6 dark:border-white/10 dark:bg-dm-card sm:max-w-sm sm:shadow-[var(--shadow-ambient-lg)]">
                <div className="flex items-center justify-between">
                  <Link href="/" className="-m-1.5 flex items-center gap-2.5 p-1.5">
                    <span className="sr-only">Conci</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-dm-page">
                      C
                    </span>
                    <span className="font-display text-lg font-semibold text-gray-900 dark:text-white">Conci</span>
                  </Link>
                  <button
                    type="button"
                    command="close"
                    commandfor="mobile-menu"
                    className="-m-2.5 rounded-md p-2.5 text-gray-700 dark:text-gray-200"
                  >
                    <span className="sr-only">Close menu</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                      className="h-6 w-6"
                    >
                      <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <div className="mt-6 flow-root">
                  <div className="-my-6 divide-y divide-gray-500/10 dark:divide-white/10">
                    <div className="py-6">
                      <a
                        href="/trip-parser"
                        className="-mx-3 block w-full rounded-lg px-3 py-2.5 text-left text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-dm-elevated"
                        {...({ command: "close", commandfor: "mobile-menu" } as object)}
                      >
                        Start a trip
                      </a>
                      <a
                        href="/join?from=create"
                        className="-mx-3 mt-1 block w-full rounded-lg px-3 py-2.5 text-left text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-dm-elevated"
                        {...({ command: "close", commandfor: "mobile-menu" } as object)}
                      >
                        Join with a code
                      </a>
                    </div>
                    <div className="py-6">
                      <div className="flex justify-start px-1">
                        <UserMenu />
                      </div>
                    </div>
                  </div>
                </div>
              </ElDialogPanel>
            </div>
          </dialog>
        </ElDialog>
      </header>

      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[color:var(--sage-soft)]/25 to-[color:var(--surface-container-highest)]/60 opacity-50 dark:hidden sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          />
        </div>

        <div className="mx-auto flex max-w-4xl flex-col items-center py-28 text-center sm:py-36 lg:py-44">
          <span className="editorial-eyebrow mb-10 text-[13px] tracking-[0.24em] dark:text-[color:var(--sage-soft)] sm:text-sm">
            Conci · AI for group trips
          </span>
          <h1 className="font-display text-[3.75rem] font-semibold leading-[0.96] tracking-[-0.035em] text-balance text-[#1c1c17] dark:text-white sm:text-[5.5rem] lg:text-[6.25rem]">
            Get the Trip out of the <span className="italic">Group Chat.</span>
          </h1>
          <div className="mt-14 flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-8 sm:gap-y-6">
            <div className="flex flex-col items-center gap-2.5">
              <Link href="/trip-parser" className={heroFilledPillClass}>
                Start a trip
              </Link>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--on-surface-muted)] dark:text-slate-500 sm:text-[13px]">
                Host &amp; invite the group
              </span>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <Link href="/join?from=create" className={heroOutlinePillClass}>
                Join with a code
              </Link>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--on-surface-muted)] dark:text-slate-500 sm:text-[13px]">
                Invited by a friend
              </span>
            </div>
          </div>
          <a
            href="#example"
            className="mt-12 text-base leading-6 font-semibold text-[color:var(--on-surface)] transition hover:text-[color:var(--sage)] dark:text-slate-200 dark:hover:text-[color:var(--sage-soft)] sm:text-lg"
          >
            See an example <span aria-hidden="true">→</span>
          </a>
          <div className="hairline-rule mt-16 w-full max-w-xs dark:bg-white/10" />
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[color:var(--surface-container-highest)]/70 to-[color:var(--sage-soft)]/20 opacity-50 dark:hidden sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
          />
        </div>
      </div>

    </>
  );
}
