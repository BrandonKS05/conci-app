import * as Sentry from "@sentry/nextjs";

/**
 * Runs once per server process (Node.js) when Next.js starts.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const raw = process.env.STRIPE_SECRET_KEY;
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  // Next.js loads `.env.local` (and `.env`) into `process.env` for the server — no extra file read needed.
  if (process.env.NODE_ENV === "production") {
    console.log(
      "[Conci Stripe startup] STRIPE_SECRET_KEY:",
      trimmed ? `set (length=${trimmed.length})` : "missing or empty"
    );
  } else {
    console.log(
      "[Conci Stripe startup] STRIPE_SECRET_KEY raw:",
      raw === undefined ? "undefined" : raw === "" ? '""' : JSON.stringify(raw)
    );
    console.log(
      "[Conci Stripe startup] STRIPE_SECRET_KEY after trim():",
      trimmed ? JSON.stringify(trimmed) : "(empty — checkout will return Stripe is not configured)"
    );
    if (typeof raw === "string" && raw !== trimmed) {
      console.log("[Conci Stripe startup] Note: key had leading/trailing whitespace; app uses trim().");
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
