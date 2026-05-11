"use client";

import { useEffect, useState } from "react";

export type TripWorkspaceTabId = "overview" | "budget" | "fund" | "collaborate";

type SpyEntry = { id: string; tab: TripWorkspaceTabId };

function buildSpyEntries(canEditTripWorkspace: boolean): SpyEntry[] {
  const entries: SpyEntry[] = [
    { id: "sec-fund", tab: "fund" },
    { id: "sec-dates", tab: "overview" },
  ];
  if (canEditTripWorkspace) entries.push({ id: "sec-setup-copilot", tab: "overview" });
  entries.push(
    { id: "sec-preferences-adjustments", tab: "collaborate" },
    { id: "sec-collab-sidebar", tab: "collaborate" }
  );
  if (canEditTripWorkspace) entries.push({ id: "sec-budget", tab: "budget" });
  entries.push({ id: "sec-trip-chat", tab: "collaborate" });
  return entries;
}

/**
 * Scroll-spy for trip workspace left rail: picks which tab’s section is nearest the top marker.
 */
export function useActiveTripWorkspaceTab(canEditTripWorkspace: boolean): TripWorkspaceTabId {
  const [active, setActive] = useState<TripWorkspaceTabId>("overview");

  useEffect(() => {
    const ordered = buildSpyEntries(canEditTripWorkspace);

    const compute = () => {
      const marker = Math.max(120, window.innerHeight * 0.18);
      let current: TripWorkspaceTabId = "overview";
      for (const { id, tab } of ordered) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= marker) current = tab;
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [canEditTripWorkspace]);

  return active;
}
