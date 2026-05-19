import type { Metadata } from "next";
import Link from "next/link";
import { AppTopNav } from "@/frontend/components/app-top-nav";

export const metadata: Metadata = {
  title: "Privacy Policy · Conci",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <AppTopNav />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-12 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
          Privacy Policy
        </h1>
        <p className="mt-4 text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Last updated: May 2026
        </p>
        <div className="prose prose-sm mt-8 max-w-none text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          <p>
            Conci collects the information you provide when creating or joining trips (email address,
            trip preferences) to provide its service. We do not sell your data. We use Supabase
            for authentication and data storage, and Stripe for payments.
          </p>
          <p className="mt-4">
            For questions, contact us at{" "}
            <a href="mailto:hello@conci.app" className="underline underline-offset-2 hover:text-[color:var(--sage)]">
              hello@conci.app
            </a>
            .
          </p>
        </div>
        <p className="mt-10 text-sm">
          <Link href="/" className="font-medium text-[color:var(--on-surface)] underline-offset-2 hover:underline dark:text-indigo-400">
            ← Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
