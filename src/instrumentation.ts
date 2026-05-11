/**
 * Runs once per server process (Node.js) when Next.js starts.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const raw = process.env.STRIPE_SECRET_KEY;
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  // Never print the raw secret — log only presence + length so terminal output
  // and any CI logs cannot leak the key.
  console.log(
    "[Conci Stripe startup] STRIPE_SECRET_KEY:",
    trimmed
      ? `set (length=${trimmed.length}, prefix=${trimmed.slice(0, 7)}…)`
      : "missing or empty — /api/checkout will return 'Stripe is not configured'"
  );
  if (typeof raw === "string" && raw !== trimmed) {
    console.log("[Conci Stripe startup] Note: key had surrounding whitespace; app uses trim().");
  }
}
