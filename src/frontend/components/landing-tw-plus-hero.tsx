"use client";

import { ElDialog, ElDialogPanel } from "@tailwindplus/elements/react";
import Link from "next/link";
import { UserMenu } from "@/frontend/components/user-menu";
import { primaryNavPillClass } from "@/frontend/ui/primary-action";
import { LandingGlobe } from "@/frontend/components/landing-globe";
import { motion } from "framer-motion";

/**
 * Oversized hero CTA pills — local to the landing hero only.
 * (Do not migrate `primaryHeroLinkPillClass` to these sizes: it is reused
 * by the home example strip where the smaller size is correct.)
 */
const heroFilledPillClass =
  "inline-flex items-center justify-center rounded-full bg-[color:var(--on-surface)] px-10 py-5 text-base font-medium tracking-wide text-[color:var(--surface)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] sm:px-12 sm:py-5 sm:text-lg dark:bg-white dark:text-[#0f172a] dark:hover:bg-neutral-200";

const heroOutlinePillClass =
  "inline-flex items-center justify-center rounded-full border border-[color:var(--hairline-strong)] px-10 py-5 text-base font-medium tracking-wide text-[color:var(--on-surface)] transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sage)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] sm:px-12 sm:py-5 sm:text-lg dark:border-white/15 dark:text-[color:var(--on-surface)] dark:hover:bg-white/5";

export function LandingTwPlusHero() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-50">
        <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center">
            <Link href="/" className="-m-1.5 flex min-w-0 items-center p-1.5 outline-none">
              <span className="sr-only">Conci</span>
              <span className="font-display text-2xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white sm:text-[1.75rem]">
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


        <div className="mx-auto flex max-w-7xl flex-col items-center py-28 text-center sm:py-36 lg:grid lg:grid-cols-2 lg:gap-12 lg:py-44 lg:text-left">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
            }}
            className="flex max-w-3xl flex-col items-center lg:items-start mx-auto lg:mx-0"
          >

            <motion.h1 
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } } }}
              className="font-display text-[3rem] font-medium leading-[0.96] tracking-[-0.035em] text-balance text-[color:var(--on-surface)] dark:text-white sm:text-[4rem] lg:text-[3.75rem] xl:text-[4.75rem]"
            >
              Get the Trip out of the <span className="italic text-[color:var(--sage)] dark:text-[color:var(--sage-soft)]">Group Chat.</span>
            </motion.h1>
            <motion.div 
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } } }}
              className="mt-14 flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start sm:gap-x-8 sm:gap-y-6"
            >
              <div className="flex flex-col items-center lg:items-start gap-3">
                <Link 
                  href="/trip-parser" 
                  className={`${heroFilledPillClass} relative overflow-hidden group shadow-[0_0_40px_rgba(0,0,0,0.1)] hover:shadow-[0_0_60px_rgba(0,0,0,0.15)] dark:shadow-[0_0_40px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_60px_rgba(255,255,255,0.2)]`}
                >
                  <span className="relative z-10 transition-transform duration-300 group-hover:scale-105">Start a trip</span>
                  <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] dark:via-black/10" />
                </Link>
              </div>
              <div className="flex flex-col items-center lg:items-start gap-3">
                <Link href="/join?from=create" className={`${heroOutlinePillClass} transition-all duration-300 hover:border-[color:var(--sage)]/50 dark:hover:border-white/30 dark:hover:bg-white/5`}>
                  <span className="transition-transform duration-300 hover:scale-105">Join with a code</span>
                </Link>
              </div>
            </motion.div>
            <motion.a
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } } }}
              href="#example"
              className="mt-16 border-b border-[color:var(--hairline-strong)] pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface)] transition-colors hover:border-[color:var(--sage)] hover:text-[color:var(--sage)] dark:border-white/30 dark:text-slate-400 dark:hover:border-[color:var(--sage-soft)] dark:hover:text-[color:var(--sage-soft)]"
            >
              See an example
            </motion.a>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="hidden lg:flex justify-center mt-16 lg:mt-0 relative"
          >

            <LandingGlobe />
          </motion.div>
        </div>


      </div>

    </>
  );
}
