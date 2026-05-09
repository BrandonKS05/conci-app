"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/frontend/supabase/client";
import { firstNameFromUserMetadata } from "@/shared/user-display-name";

export type TripCalendarPeer = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  /** Day cell yyyy-mm-dd the peer is hovering in the month grid */
  focusCellIso: string | null;
  viewYear: number | null;
  viewMonth0: number | null;
};

function hueFromUserId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 33 + id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 72% 42%)`;
}

function buildTrackPayload(args: {
  userId: string;
  email: string | null;
  meta: Record<string, unknown> | undefined;
  color: string;
  avatarUrl: string | null;
  focusCellIso: string | null;
  viewYear: number;
  viewMonth0: number;
}) {
  const name = firstNameFromUserMetadata(args.meta, args.email);
  return {
    user_id: args.userId,
    name,
    avatar_url: args.avatarUrl,
    color: args.color,
    focus_cell_iso: args.focusCellIso,
    view_year: args.viewYear,
    view_month0: args.viewMonth0,
  };
}

type BasePresence = {
  userId: string;
  email: string | null;
  meta: Record<string, unknown> | undefined;
  color: string;
  avatarUrl: string | null;
};

/** Temporary: remove after presence debugging. Filter console with `[trip-cal-presence]`. */
const DBG = "[trip-cal-presence]";

/**
 * Google-Docs-style presence on the trip calendar: who's here + optional cell focus for indicators.
 */
export function useTripCalendarPresence(
  tripId: string | undefined,
  options: {
    enabled: boolean;
    calendarYear: number;
    calendarMonth0: number;
  }
) {
  const { enabled, calendarYear, calendarMonth0 } = options;
  const [peers, setPeers] = useState<TripCalendarPeer[]>([]);
  const selfIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const focusRef = useRef<string | null>(null);
  const lastSentFocus = useRef(0);
  const basePayloadRef = useRef<BasePresence | null>(null);
  const activeChannelRef = useRef<RealtimeChannel | null>(null);

  const syncFromPresence = useCallback((ch: RealtimeChannel, selfId: string) => {
    const state = ch.presenceState() as Record<
      string,
      Array<{
        user_id?: string;
        name?: string;
        avatar_url?: string | null;
        color?: string;
        focus_cell_iso?: string | null;
        view_year?: number;
        view_month0?: number;
      }>
    >;
    const out: TripCalendarPeer[] = [];
    for (const [, presences] of Object.entries(state)) {
      for (const p of presences ?? []) {
        const uid = typeof p.user_id === "string" ? p.user_id : "";
        if (!uid || uid === selfId) continue;
        out.push({
          userId: uid,
          name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Traveler",
          avatarUrl: typeof p.avatar_url === "string" && p.avatar_url.startsWith("http") ? p.avatar_url : null,
          color: typeof p.color === "string" ? p.color : "#6366f1",
          focusCellIso: typeof p.focus_cell_iso === "string" ? p.focus_cell_iso : null,
          viewYear: typeof p.view_year === "number" ? p.view_year : null,
          viewMonth0: typeof p.view_month0 === "number" ? p.view_month0 : null,
        });
      }
    }
    console.log(DBG, "peers state updated", {
      count: out.length,
      peers: out.map((p) => ({ userId: p.userId, name: p.name, focus: p.focusCellIso })),
    });
    setPeers(out);
  }, []);

  useEffect(() => {
    if (!enabled || !tripId) {
      console.log(DBG, "hook disabled or no tripId", { enabled, tripId });
      return undefined;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      console.warn(DBG, "no Supabase browser client — presence disabled");
      return undefined;
    }

    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    void (async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) {
        console.warn(DBG, "no auth session — cannot join presence channel", { cancelled });
        return;
      }

      selfIdRef.current = user.id;
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const email = user.email ?? null;
      const avatarUrl =
        typeof meta?.avatar_url === "string" && meta.avatar_url.startsWith("http")
          ? meta.avatar_url
          : typeof meta?.picture === "string" && meta.picture.startsWith("http")
            ? meta.picture
            : null;
      const color = hueFromUserId(user.id);
      basePayloadRef.current = {
        userId: user.id,
        email,
        meta,
        color,
        avatarUrl,
      };

      const channelName = `presence:trip-cal:${tripId}`;
      console.log(DBG, "joining presence channel", { channelName, selfUserId: user.id });

      ch = sb
        .channel(channelName, {
          config: { presence: { key: user.id } },
        })
        .on("presence", { event: "sync" }, () => {
          console.log(DBG, "presence event: sync");
          if (ch) syncFromPresence(ch, user.id);
        })
        .on("presence", { event: "join" }, (payload) => {
          console.log(DBG, "presence event: join", payload);
          if (ch) syncFromPresence(ch, user.id);
        })
        .on("presence", { event: "leave" }, (payload) => {
          console.log(DBG, "presence event: leave", payload);
          if (ch) syncFromPresence(ch, user.id);
        })
        .subscribe(async (status, err) => {
          console.log(DBG, "channel subscribe callback", {
            status,
            err: err?.message ?? err ?? null,
            channel: channelName,
            tripId,
          });
          if (status !== "SUBSCRIBED" || cancelled || !ch) {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              console.warn(DBG, "presence channel not SUBSCRIBED", { status, err });
            }
            return;
          }
          channelRef.current = ch;
          activeChannelRef.current = ch;
          const track = buildTrackPayload({
            userId: user.id,
            email,
            meta,
            color,
            avatarUrl,
            focusCellIso: focusRef.current,
            viewYear: calendarYear,
            viewMonth0: calendarMonth0,
          });
          try {
            const trackStatus = await ch.track(track);
            console.log(DBG, "subscribed + track() finished", {
              channel: channelName,
              trackStatus,
              payloadPreview: { name: track.name, view: `${calendarYear}-${calendarMonth0}` },
            });
          } catch (e) {
            console.error(DBG, "track() failed", e);
          }
        });
    })();

    return () => {
      console.log(DBG, "cleanup: removing presence channel", { tripId });
      cancelled = true;
      const toRemove = activeChannelRef.current;
      activeChannelRef.current = null;
      channelRef.current = null;
      if (toRemove) {
        void sb.removeChannel(toRemove);
      }
      setPeers([]);
    };
  }, [tripId, enabled, syncFromPresence]);

  const trackRef = useCallback(async () => {
    const ch = channelRef.current;
    const base = basePayloadRef.current;
    if (!ch || !base) return;
    await ch.track(
      buildTrackPayload({
        userId: base.userId,
        email: base.email,
        meta: base.meta,
        color: base.color,
        avatarUrl: base.avatarUrl,
        focusCellIso: focusRef.current,
        viewYear: calendarYear,
        viewMonth0: calendarMonth0,
      })
    );
  }, [calendarYear, calendarMonth0]);

  useEffect(() => {
    if (!enabled || !tripId) return;
    void trackRef();
  }, [calendarYear, calendarMonth0, enabled, tripId, trackRef]);

  const setFocusedCell = useCallback(
    (iso: string | null) => {
      focusRef.current = iso;
      const now = Date.now();
      if (iso !== null && now - lastSentFocus.current < 100) return;
      lastSentFocus.current = iso === null ? 0 : now;
      void trackRef();
    },
    [trackRef]
  );

  const peersByCellIso = useMemo(() => {
    const m = new Map<string, TripCalendarPeer[]>();
    for (const p of peers) {
      if (!p.focusCellIso) continue;
      const list = m.get(p.focusCellIso) ?? [];
      list.push(p);
      m.set(p.focusCellIso, list);
    }
    return m;
  }, [peers]);

  return {
    peers,
    peersByCellIso,
    setFocusedCell,
    selfUserId: selfIdRef.current,
  };
}
