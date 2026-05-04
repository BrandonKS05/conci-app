"use client";

import { useCallback, useState } from "react";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copies `shareMessage`, or the current page URL when `shareMessage` is omitted. */
export function TripPlanShareButton({ shareMessage }: { shareMessage?: string }) {
  const [showToast, setShowToast] = useState(false);

  const handleShare = useCallback(async () => {
    const preset = shareMessage?.trim();
    const fallback = typeof window !== "undefined" ? window.location.href : "";
    const text = preset || fallback;
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setShowToast(true);
      window.setTimeout(() => setShowToast(false), 2200);
    }
  }, [shareMessage]);

  const copiedLabel = shareMessage?.trim() ? "Message copied" : "Link copied";
  const label = shareMessage?.trim() ? "Share Trip" : "Share";

  return (
    <>
      <button
        type="button"
        onClick={() => void handleShare()}
        className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-card"
      >
        {label}
      </button>
      {showToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-lg shadow-slate-900/10 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:shadow-black/40"
        >
          {copiedLabel}
        </div>
      ) : null}
    </>
  );
}
