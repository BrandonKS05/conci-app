"use client";

import { ElDialog, ElDialogPanel } from "@tailwindplus/elements/react";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggleButton } from "@/frontend/components/theme-provider";
import { UserMenu } from "@/frontend/components/user-menu";
import { primaryHeroLinkPillClass, primaryNavPillClass } from "@/frontend/ui/primary-action";

export function LandingTwPlusHero() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-50">
        <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center">
            <Link href="/" className="-m-1.5 flex min-w-0 items-center gap-2.5 p-1.5 outline-none">
              <span className="sr-only">Conci</span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-dm-page">
                C
              </span>
              <span className="font-display text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                Conci
              </span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggleButton variant="landing" className="inline-flex" />
            <Link href="/join" className={primaryNavPillClass}>
              <span className="sm:hidden">Join trip</span>
              <span className="hidden sm:inline">Join a trip</span>
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
              <ElDialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white p-6 dark:bg-dm-card sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:sm:ring-white/10">
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
                      <div className="mb-4 px-1">
                        <ThemeToggleButton variant="landing" className="w-full justify-center" />
                      </div>
                      <a
                        href="/join"
                        className="-mx-3 block w-full rounded-lg px-3 py-2.5 text-left text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-dm-elevated"
                        {...({ command: "close", commandfor: "mobile-menu" } as object)}
                      >
                        Join a trip (no account)
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
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 dark:hidden sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          />
        </div>

        <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
          <div className="text-center">
            <h1 className="font-display text-5xl font-semibold tracking-tight text-balance text-gray-900 dark:text-white sm:text-7xl">
              Turn messy group chats into a real plan
            </h1>
            <p className="mt-8 text-lg font-medium text-pretty text-gray-500 dark:text-slate-400 sm:text-xl/8">
              Paste a text, link, or screenshot. Get a shareable trip plan in seconds.
            </p>
            <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-gray-600 dark:text-slate-400">
              Friends can join with an invite code—vote and RSVP with no login. Creators sign in to build plans.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap sm:gap-x-6">
              <Link href="/trip-parser" className={primaryHeroLinkPillClass}>
                Start planning
              </Link>
              <Link href="/join" className={primaryHeroLinkPillClass}>
                Join with a code
              </Link>
              <a
                href="#example"
                className="text-sm leading-6 font-semibold text-gray-900 dark:text-slate-200"
              >
                See an example <span aria-hidden="true">→</span>
              </a>
            </div>

            <div className="mt-12 flex flex-col items-center sm:mt-14">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">
                Partnered with
              </p>
              <ul className="mt-5 flex list-none flex-wrap items-center justify-center gap-x-10 gap-y-6 px-2">
                <li className="flex h-14 shrink-0 items-center">
                  <Image
                    src="/partners/stanford.svg"
                    alt="Stanford University"
                    width={52}
                    height={78}
                    className="h-14 w-auto max-w-[4.5rem]"
                  />
                </li>
                <li className="flex h-9 shrink-0 items-center sm:h-10">
                  <Image
                    src="/partners/uchicago.svg"
                    alt="University of Chicago"
                    width={250}
                    height={63}
                    className="h-9 w-auto max-w-[min(92vw,13rem)] sm:h-10 sm:max-w-[14rem]"
                  />
                </li>
                <li className="flex h-10 shrink-0 items-center">
                  <Image
                    src="/partners/vanderbilt.svg"
                    alt="Vanderbilt University"
                    width={200}
                    height={48}
                    className="h-10 w-auto max-w-[min(92vw,12rem)]"
                  />
                </li>
              </ul>
            </div>
          </div>
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
            className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 dark:hidden sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
          />
        </div>
      </div>

    </>
  );
}
