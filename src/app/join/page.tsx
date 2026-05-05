import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinTripByCodeForm } from "@/frontend/components/join-trip-by-code-form";
import { ThemeToggleButton } from "@/frontend/components/theme-provider";
import { UserMenu } from "@/frontend/components/user-menu";
import { PRIMARY_APP_NAV } from "@/shared/app-nav";

/**
 * Invite-code join — not linked from global nav. Open from Create a Trip only:
 * `/trip-parser` → "Join a Trip" uses `/join?from=create` (required for this page).
 */
export default async function JoinTripPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; code?: string }>;
}) {
  const { from, code } = await searchParams;
  if (from !== "create") {
    redirect("/trip-parser");
  }

  const initialCode = typeof code === "string" ? code : "";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-[#141414] dark:text-[#ebe9e4]">
      <header className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 text-slate-900 transition hover:opacity-90 dark:text-[#ebe9e4]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-semibold text-slate-900 ring-1 ring-slate-200 dark:bg-[#1f1f1f] dark:text-[#ebe9e4] dark:ring-white/10">
              C
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-[#9c9a96]">
                Conci
              </span>
              <span className="block truncate text-sm text-slate-600 dark:text-[#c4c2be]">Join a trip</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggleButton />
            <UserMenu />
          </div>
        </div>
        <nav
          aria-label="Main"
          className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-slate-200 pt-4 dark:border-white/10 sm:gap-x-2"
        >
          {PRIMARY_APP_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-transparent transition hover:bg-slate-200/80 hover:text-slate-900 hover:ring-slate-300/80 dark:text-[#9c9a96] dark:hover:bg-white/5 dark:hover:text-[#ebe9e4] dark:hover:ring-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-2 sm:px-6 sm:pt-4">
        <JoinTripByCodeForm initialCode={initialCode} />
        <p className="mt-8 text-center text-sm text-slate-500 dark:text-neutral-500">
          <Link href="/trip-parser" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            ← Back to Create a Trip
          </Link>
        </p>
      </main>
    </div>
  );
}
