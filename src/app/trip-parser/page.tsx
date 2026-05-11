import Link from "next/link";
import TripParser from "@/frontend/components/TripParser";
import { TripParserJoinCta } from "@/frontend/components/trip-parser-join-cta";
import { UserMenu } from "@/frontend/components/user-menu";
import { PRIMARY_APP_NAV } from "@/shared/app-nav";

export default function TripParserPage() {
  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <header className="sticky top-0 z-20 border-b border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)]/90 px-5 py-5 shadow-[var(--shadow-ambient-sm)] backdrop-blur-xl dark:border-white/10 dark:bg-[#141414]/90 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 items-center text-[color:var(--on-surface)] transition hover:opacity-90 dark:text-[#ebe9e4]"
          >
            <span className="font-display text-2xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-[#ebe9e4]">
              Conci
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <UserMenu />
          </div>
        </div>
        <nav
          aria-label="Main"
          className="mx-auto mt-5 flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-[color:var(--hairline)] pt-5 dark:border-white/10 sm:gap-x-8"
        >
          {PRIMARY_APP_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="label-caps text-[color:var(--on-surface-variant)] transition hover:text-[color:var(--on-surface)] dark:text-[#9c9a96] dark:hover:text-[#ebe9e4]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-2 sm:px-6 sm:pt-4">
        <TripParser />
        <TripParserJoinCta />
      </main>
    </div>
  );
}
