import Link from "next/link";
import { primaryFormButtonClass } from "@/frontend/ui/primary-action";

const JOIN_WITH_CODE_URL = "https://conci-app-wine.vercel.app/join?from=create";

/** Only entry to `/join` from this CTA (`/join?from=create`). Not shown in global nav. */
export function TripParserJoinCta() {
  return (
    <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-5 py-5 shadow-[var(--shadow-ambient-sm)] backdrop-blur-sm dark:border-white/10 dark:bg-[#1a1a1a]/90 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-sm text-[color:var(--on-surface-variant)] dark:text-neutral-300">
        Have an invite code from your host?
      </p>
      <Link href={JOIN_WITH_CODE_URL} className={`inline-flex w-full shrink-0 justify-center sm:w-auto ${primaryFormButtonClass}`}>
        Join a Trip
      </Link>
    </div>
  );
}
