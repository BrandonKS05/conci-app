/** First token of display name for greetings (never show full name in UI if only first is desired). */
export function firstNameFromUserMetadata(
  meta: Record<string, unknown> | null | undefined,
  emailFallback?: string | null
): string {
  if (!meta || typeof meta !== "object") {
    return emailFallback?.split("@")[0]?.trim() || "there";
  }
  const given = typeof meta.given_name === "string" ? meta.given_name.trim() : "";
  if (given) return given;
  const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  const firstFromFull = full.split(/\s+/).filter(Boolean)[0] ?? "";
  const firstFromName = name.split(/\s+/).filter(Boolean)[0] ?? "";
  const first = firstFromFull || firstFromName;
  if (first) return first;
  const local = emailFallback?.split("@")[0]?.trim();
  return local || "there";
}
