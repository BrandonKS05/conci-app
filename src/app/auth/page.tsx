import { Suspense } from "react";
import { AuthFormClient } from "./auth-form-client";

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
