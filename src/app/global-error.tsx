"use client";

import { useEffect } from "react";

import { GlassCard } from "@/frontend/components/cards";
import { Button } from "@/frontend/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return;
    }

    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-dm-page text-[#ebe9e4]">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-6 py-16">
          <GlassCard className="w-full border-white/10 bg-dm-card p-8 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-[#ebe9e4]">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-neutral-400">
              We could not load this screen. Please try again.
            </p>
            <div className="mt-6 flex justify-center">
              <Button type="button" onClick={reset} variant="default" size="pill">
                Try again
              </Button>
            </div>
          </GlassCard>
        </main>
      </body>
    </html>
  );
}
