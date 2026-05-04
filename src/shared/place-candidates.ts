/**
 * Heuristic extraction of venue / hotel / activity names to preview via Places search.
 * Keeps volume low (max 2 queries per message).
 */
export function hasPlaceCandidates(userText: string, locationHint?: string | null): boolean {
  return extractPlaceCandidates(userText, locationHint).length > 0;
}

/** Whole message is only “(plan) a trip to &lt;destination&gt;” style — not a named venue request. */
function isGenericTripDestinationOnly(text: string): boolean {
  const main = text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!main) return false;
  if (
    /\b(?:at|@|from|visit|try|eat at|dinner at|lunch at|brunch at|breakfast at|staying at|stay at|book(?:ed)?|reservation at|check out|hit up|swing by)\b/i.test(
      main
    )
  ) {
    return false;
  }
  return /^(?:plan(?:ning)?\s+)?(?:a\s+)?trip\s+to\s+.+/i.test(main);
}

export function extractPlaceCandidates(userText: string, locationHint?: string | null): string[] {
  if (isGenericTripDestinationOnly(userText)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const q = s.replace(/\s+/g, " ").trim();
    if (q.length < 3 || q.length > 100) return;
    const k = q.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(q);
  };

  const text = userText.replace(/\[[^\]]*\]/g, " ").trim();

  for (const m of text.matchAll(/"([^"]{3,80})"|'([^']{3,80})'/g)) {
    push(m[1] || m[2] || "");
    if (out.length >= 2) return finalize(out, locationHint);
  }

  const trigger =
    /(?:^|\b)(?:at|@|from|visit|try|eat at|dinner at|lunch at|brunch at|breakfast at|staying at|stay at|book(?:ed)?|reservation at|check out|hit up|swing by)\s+([^.!?\n]{3,80})/gi;
  for (const m of text.matchAll(trigger)) {
    const chunk = (m[1] || "").trim();
    if (chunk) push(chunk.replace(/\s+$/g, ""));
    if (out.length >= 2) return finalize(out, locationHint);
  }

  const hotel = /\b(?:The\s+)?([A-Z][\w&]+(?:\s+[A-Z][\w&]+){0,4}\s+(?:Hotel|Inn|Resort|Lodge|Motel))\b/;
  const hm = text.match(hotel);
  if (hm?.[0]) push(hm[0].trim());

  return finalize(out, locationHint);
}

function finalize(queries: string[], locationHint?: string | null): string[] {
  const hint = (locationHint || "").trim();
  const slice = queries.slice(0, 2);
  if (!hint) return slice;
  const hintHead = hint.split(",")[0]!.trim().toLowerCase();
  return slice.map((q) => {
    if (hintHead.length >= 3 && q.toLowerCase().includes(hintHead.slice(0, Math.min(12, hintHead.length)))) return q;
    return `${q}, ${hint}`;
  });
}
