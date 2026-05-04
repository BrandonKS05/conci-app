import type { PlacePreview } from "@/shared/place-preview";

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the top Maps result is plausibly the place the user named. */
export function isLikelySamePlace(userQuery: string, top: PlacePreview): boolean {
  const q = norm(userQuery);
  const n = norm(top.name);
  if (!q.length || !n.length) return false;
  if (n.includes(q) || q.includes(n.slice(0, Math.min(24, n.length)))) return true;

  const words = q.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return q.length >= 4 && n.includes(q.slice(0, Math.min(q.length, 12)));

  let hits = 0;
  for (const w of words) {
    if (n.includes(w)) hits += 1;
  }
  return hits >= Math.max(1, Math.ceil(words.length * 0.55));
}
