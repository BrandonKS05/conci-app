const WIKI_API = "https://en.wikipedia.org/w/api.php";

/**
 * Best-effort landmark / city photo from English Wikipedia for a short place query
 * (e.g. first segment of `plan.location`). Cached via fetch `next.revalidate`.
 */
export async function fetchWikipediaThumbnailForQuery(rawQuery: string): Promise<string | null> {
  const q = rawQuery.split(",")[0]?.trim() ?? rawQuery.trim();
  if (q.length < 2 || /^tbd$/i.test(q)) return null;

  const headers = {
    "User-Agent": "ConciApp/1.0 (destination cover images; contact via site support)",
  };

  try {
    const searchUrl = new URL(WIKI_API);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", q);
    searchUrl.searchParams.set("srlimit", "1");
    searchUrl.searchParams.set("format", "json");

    const sRes = await fetch(searchUrl.toString(), {
      next: { revalidate: 86400 },
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!sRes.ok) return null;
    const sJson: unknown = await sRes.json();
    const title = (sJson as { query?: { search?: { title?: string }[] } })?.query?.search?.[0]?.title;
    if (!title) return null;

    const imgUrl = new URL(WIKI_API);
    imgUrl.searchParams.set("action", "query");
    imgUrl.searchParams.set("titles", title);
    imgUrl.searchParams.set("prop", "pageimages");
    imgUrl.searchParams.set("piprop", "thumbnail");
    imgUrl.searchParams.set("pithumbsize", "640");
    imgUrl.searchParams.set("format", "json");

    const iRes = await fetch(imgUrl.toString(), {
      next: { revalidate: 86400 },
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!iRes.ok) return null;
    const iJson: unknown = await iRes.json();
    const pages = (iJson as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } })?.query
      ?.pages;
    if (!pages || typeof pages !== "object") return null;
    for (const p of Object.values(pages)) {
      const src = p?.thumbnail?.source;
      if (typeof src === "string" && src.startsWith("http")) return src;
    }
    return null;
  } catch {
    return null;
  }
}
