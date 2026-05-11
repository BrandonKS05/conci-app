import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinTripByCodeForm } from "@/frontend/components/join-trip-by-code-form";
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
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <header className="sticky top-0 z-20 border-b border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)]/90 px-4 py-5 shadow-[var(--shadow-ambient-sm)] backdrop-blur-xl dark:border-white/10 dark:bg-[#141414]/90 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 text-[color:var(--on-surface)] transition hover:opacity-90 dark:text-[#ebe9e4]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1c1c17] text-sm font-semibold text-[color:var(--surface)] dark:bg-[#1f1f1f] dark:text-[#ebe9e4]">
              C
            </span>
            <span className="min-w-0">
              <span className="label-caps block text-[color:var(--sage)] dark:text-[#9c9a96]">
                Conci
              </span>
              <span className="block truncate text-sm text-[color:var(--on-surface-variant)] dark:text-[#c4c2be]">Join a trip</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <UserMenu />
          </div>
        </div>
        <nav
          aria-label="Main"
          className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-[color:var(--hairline)] pt-4 dark:border-white/10 sm:gap-x-8"
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
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <JoinTripByCodeForm initialCode={initialCode} />
        <p className="mt-8 text-center text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          <Link href="/trip-parser" className="font-medium text-[color:var(--on-surface)] hover:text-[color:var(--sage)] hover:underline dark:text-indigo-400">
            ← Back to Create a Trip
          </Link>
        </p>
      </main>
    </div>
  );
}
