import Link from "next/link";
import { JoinTripByCodeForm } from "@/frontend/components/join-trip-by-code-form";
import { AppTopNav } from "@/frontend/components/app-top-nav";

/**
 * Invite-code join. Direct invite URLs and Create-trip handoffs both land here.
 */
export default async function JoinTripPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; code?: string }>;
}) {
  const { code } = await searchParams;

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
