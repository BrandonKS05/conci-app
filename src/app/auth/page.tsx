import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthFormClient } from "./auth-form-client";

export const metadata: Metadata = {
  title: "Sign in · Conci",
  description: "Sign in to plan and join group trips with Conci.",
  robots: { index: false, follow: false },
};

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          Loading…
        </div>
      }
    >
      <AuthFormClient />
    </Suspense>
  );
}
