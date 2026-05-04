/** Resend + NUDGE_EMAIL_FROM — shared by structured nudges and host-authored member emails. */

export function isOutboundEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.NUDGE_EMAIL_FROM?.trim());
}

export async function sendOutboundEmail(
  to: string,
  subject: string,
  body: { html?: string; text?: string }
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NUDGE_EMAIL_FROM?.trim();
  if (!key || !from) return { ok: false, detail: "Email not configured" };
  if (!body.html && !body.text) return { ok: false, detail: "Missing body" };

  const payload: Record<string, unknown> = { from, to: [to], subject };
  if (body.html) payload.html = body.html;
  if (body.text) payload.text = body.text;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, detail: t || r.statusText };
  }
  return { ok: true };
}
