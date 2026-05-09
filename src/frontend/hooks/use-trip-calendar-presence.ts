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

/** Topic passed to `sb.channel()`; server uses `realtime:${topic}`. */
function presenceChannelName(tripId: string): string {
  return `presence:trip-cal:${tripId}`;
}

function presenceRealtimeTopic(tripId: string): string {
  return `realtime:${presenceChannelName(tripId)}`;
}

/** Debug: filter console with `[trip-cal-presence]` — remove when presence is stable. */
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

  const syncFromPresence = useCallback((ch: RealtimeChannel, selfId: string, source: "sync" | "join" | "leave") => {
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
    console.log(DBG, "presenceState() raw (before filter)", source, {
      presenceKeys: Object.keys(state),
      entries: Object.entries(state).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.map((p) => p?.user_id ?? "?") : v,
      ]),
    });
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
    console.log(DBG, "peers state updated", source, {
      selfId,
      count: out.length,
      peers: out.map((p) => ({
        userId: p.userId,
        name: p.name,
        focus: p.focusCellIso,
        view: p.viewYear != null && p.viewMonth0 != null ? `${p.viewYear}-${p.viewMonth0}` : null,
      })),
    });
    setPeers(out);
  }, []);

  useEffect(() => {
    if (!enabled || !tripId) {
      console.log(DBG, "effect skipped", { enabled, tripId });
      return undefined;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      console.warn(DBG, "no Supabase browser client");
      return undefined;
    }

    console.log(DBG, "effect run", { tripId, enabled });

    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    void (async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) {
        console.warn(DBG, "abort: no user or cancelled after getSession", {
          hasUser: Boolean(user),
          cancelled,
        });
        return;
      }

      console.log(DBG, "session ok", {
        userId: user.id,
        hasAccessToken: Boolean(session?.access_token),
      });

      if (session.access_token) {
        await sb.realtime.setAuth(session.access_token);
        console.log(DBG, "realtime.setAuth(access_token) awaited");
      } else {
        console.warn(DBG, "no session.access_token — realtime may use anon/key fallback");
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

      const channelName = presenceChannelName(tripId);
      const topicFull = presenceRealtimeTopic(tripId);

      const stale = sb.getChannels().find((c) => c.topic === topicFull);
      if (stale) {
        console.log(DBG, "removing stale channel before create", { topic: stale.topic });
        await sb.removeChannel(stale);
      }
      if (cancelled) {
        console.log(DBG, "cancelled after stale removal");
        return;
      }

      console.log(DBG, "creating channel + subscribe", {
        channelName,
        topicFull,
        selfUserId: user.id,
        existingChannels: sb.getChannels().map((c) => c.topic),
      });

      ch = sb
        .channel(channelName, {
          config: {
            presence: { key: user.id, enabled: true },
          },
        })
        .on("presence", { event: "sync" }, () => {
          console.log(DBG, "presence event: sync");
          if (ch) syncFromPresence(ch, user.id, "sync");
        })
        .on("presence", { event: "join" }, (payload) => {
          console.log(DBG, "presence event: join", payload);
          if (ch) syncFromPresence(ch, user.id, "join");
        })
        .on("presence", { event: "leave" }, (payload) => {
          console.log(DBG, "presence event: leave", payload);
          if (ch) syncFromPresence(ch, user.id, "leave");
        })
        .subscribe(async (status, err) => {
          console.log(DBG, "channel subscribe callback", {
            status,
            err: err?.message ?? err ?? null,
            channelName,
            topicFull,
            tripId,
            cancelled,
          });
          if (status !== "SUBSCRIBED" || cancelled || !ch) {
            console.warn(DBG, "subscribe not SUBSCRIBED (early return)", {
              status,
              err: err?.message ?? err ?? null,
              cancelled,
              hasChannel: Boolean(ch),
            });
            return;
          }
          console.log(DBG, "SUBSCRIBED — presence channel ready");
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
            console.log(DBG, "track() after SUBSCRIBED", {
              trackStatus,
              payloadPreview: {
                name: track.name,
                user_id: track.user_id,
                view_year: track.view_year,
                view_month0: track.view_month0,
                focus_cell_iso: track.focus_cell_iso,
              },
            });
          } catch (e) {
            console.warn(DBG, "track() failed", e);
          }
        });
    })();

    return () => {
      console.log(DBG, "cleanup: unmount / deps change", { tripId });
      cancelled = true;
      const topicFull = presenceRealtimeTopic(tripId);
      const toRemove =
        activeChannelRef.current ?? sb.getChannels().find((c) => c.topic === topicFull) ?? null;
      activeChannelRef.current = null;
      channelRef.current = null;
      if (toRemove) {
        console.log(DBG, "cleanup: removeChannel", { topic: toRemove.topic });
        void sb.removeChannel(toRemove);
      } else {
        console.log(DBG, "cleanup: nothing to remove (no ref / no matching topic)");
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
