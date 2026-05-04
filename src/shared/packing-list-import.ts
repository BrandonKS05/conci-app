/** Normalize pasted or extracted text into a clean one-item-per-line packing list (max 20k chars). */

const MAX_LEN = 20000;

export function normalizePackingListText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    line = line.replace(/^[-–—•*·]\s*/u, "").replace(/^\d+[.)]\s+/, "");
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  const joined = out.join("\n");
  return joined.length > MAX_LEN ? joined.slice(0, MAX_LEN) : joined;
}

/** Append imported items under the current list, re-normalizing and capping length. */
export function appendPackingListBlocks(existing: string, incoming: string): string {
  const a = existing.trim();
  const b = normalizePackingListText(incoming);
  if (!a) return b;
  if (!b) return a;
  const merged = `${a}\n\n${b}`;
  return merged.length > MAX_LEN ? merged.slice(0, MAX_LEN) : merged;
}
