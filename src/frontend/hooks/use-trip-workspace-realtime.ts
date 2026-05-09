"use client";

import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/frontend/supabase/client";

export type TripPlanRealtimeRow = {
  id: string;
  plan: unknown;
  collab_state?: unknown | null;
  status?: string;
  updated_at?: string;
};

/**
 * Streams `trip_plans` UPDATEs to this trip so the workspace stays in sync without refresh.
 * Requires `trip_plans` in `supabase_realtime` publication (see migrations).
 */
export function useTripWorkspaceRealtime(
  tripId: string | undefined,
  onRow: (row: TripPlanRealtimeRow) => void,
  options: {
    enabled: boolean;
    /** After a local PATCH, ignore echoed realtime briefly to avoid double-apply/flicker. */
    suppressRealtimeUntilRef: MutableRefObject<number>;
  }
) {
  const { enabled, suppressRealtimeUntilRef } = options;
  const onRowRef = useRef(onRow);
  onRowRef.current = onRow;

  useEffect(() => {
    if (!enabled || !tripId) return undefined;
    const sb = getSupabaseClient();
    if (!sb) {
      console.warn("[realtime] Supabase browser client unavailable; live sync disabled.");
      return undefined;
    }

    const channel = sb
      .channel(`workspace:tp:${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trip_plans",
          filter: `id=eq.${tripId}`,
        },
        (payload) => {
          if (Date.now() < suppressRealtimeUntilRef.current) return;
          const row = payload.new as TripPlanRealtimeRow;
          if (row?.id === tripId) {
            onRowRef.current(row);
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[realtime] trip_plans subscription error");
        }
      });

    return () => {
      void sb.removeChannel(channel);
    };
  }, [tripId, enabled, suppressRealtimeUntilRef]);
}
