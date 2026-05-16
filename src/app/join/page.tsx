import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinTripByCodeForm } from "@/frontend/components/join-trip-by-code-form";
import { AppTopNav } from "@/frontend/components/app-top-nav";

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
      <AppTopNav />
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
