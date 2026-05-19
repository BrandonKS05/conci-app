import type { Metadata } from "next";
import Link from "next/link";
import { AppTopNav } from "@/frontend/components/app-top-nav";

export const metadata: Metadata = {
  title: "Terms of Service · Conci",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] dark:bg-[#141414] dark:text-[#ebe9e4]">
      <AppTopNav />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-12 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[color:var(--on-surface)] dark:text-white">
          Terms of Service
        </h1>
        <p className="mt-4 text-[color:var(--on-surface-variant)] dark:text-neutral-400">
          Last updated: May 2026
        </p>
        <div className="prose prose-sm mt-8 max-w-none text-[color:var(--on-surface-variant)] dark:text-neutral-300">
          <p>
            By using Conci you agree to use it for lawful purposes only. You are responsible for
            the content of any trips you create. Conci is provided as-is; we are not liable for
            losses arising from use of the service.
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
