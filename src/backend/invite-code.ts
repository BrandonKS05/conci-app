import type { SupabaseClient } from "@supabase/supabase-js";

/** Unambiguous uppercase alphanumeric (no O/0/I/1/L confusion). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRawInviteCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
  }
  return s;
}

/** Normalize user input to stored 6-char form (no hyphen). */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

/** Display as AAA-BBB (6 chars → 3 + hyphen + 3). */
export function formatInviteCodeDisplay(raw: string): string {
  const n = normalizeInviteCode(raw);
  if (n.length !== 6) return raw;
  return `${n.slice(0, 3)}-${n.slice(3)}`;
}

/** Allocate a globally unique invite_code using service-role reads. */
export async function allocateUniqueInviteCode(svc: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const raw = generateRawInviteCode();
    const { data } = await svc.from("trip_plans").select("id").eq("invite_code", raw).maybeSingle();
    if (!data) {
      return raw;
    }
  }
  throw new Error("Could not allocate a unique invite code.");
}
