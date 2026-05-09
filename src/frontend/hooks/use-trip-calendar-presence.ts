"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, Session, User } from "@supabase/supabase-js";
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

type RawPresenceRow = {
  user_id?: string;
  name?: string;
  avatar_url?: string | null;
  color?: string;
  focus_cell_iso?: string | null;
  view_year?: number;
  view_month0?: number;
};

function peerFromRow(p: RawPresenceRow): TripCalendarPeer | null {
  const uid = typeof p.user_id === "string" ? p.user_id : "";
  if (!uid) return null;
  return {
    userId: uid,
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Traveler",
    avatarUrl: typeof p.avatar_url === "string" && p.avatar_url.startsWith("http") ? p.avatar_url : null,
    color: typeof p.color === "string" ? p.color : "#6366f1",
    focusCellIso: typeof p.focus_cell_iso === "string" ? p.focus_cell_iso : null,
    viewYear: typeof p.view_year === "number" ? p.view_year : null,
    viewMonth0: typeof p.view_month0 === "number" ? p.view_month0 : null,
  };
}

function rowScore(presenceKey: string, peer: TripCalendarPeer): number {
  let s = 0;
  if (presenceKey === peer.userId) s += 1000;
  if (peer.focusCellIso) s += 10;
  if (peer.avatarUrl) s += 1;
  return s;
}

/**
 * Collapse Phoenix presence to **one row per `user_id`** payload field.
 * Multiple presence keys (reconnect ghosts) become a single UI row.
 */
function dedupePeersByUserId(
  state: Record<string, RawPresenceRow[]>,
  selfId: string
): TripCalendarPeer[] {
  type Cand = { presenceKey: string; peer: TripCalendarPeer; score: number };
  const byUser = new Map<string, Cand[]>();

  for (const [presenceKey, presences] of Object.entries(state)) {
    for (const p of presences ?? []) {
      const peer = peerFromRow(p);
      if (!peer || peer.userId === selfId) continue;
      const c: Cand = {
        presenceKey,
        peer,
        score: rowScore(presenceKey, peer),
      };
      const list = byUser.get(peer.userId) ?? [];
      list.push(c);
      byUser.set(peer.userId, list);
    }
  }

  const out: TripCalendarPeer[] = [];
  for (const [, cands] of byUser) {
    if (!cands.length) continue;
    cands.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ca = a.presenceKey === a.peer.userId ? 1 : 0;
      const cb = b.presenceKey === b.peer.userId ? 1 : 0;
      return cb - ca;
    });
    out.push(cands[0]!.peer);
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Topic passed to `sb.channel()`; server uses `realtime:${topic}`. */
function presenceChannelName(tripId: string): string {
  return `presence:trip-cal:${tripId}`;
}

function presenceRealtimeTopic(tripId: string): string {
  return `realtime:${presenceChannelName(tripId)}`;
}

async function untrackAndRemoveChannel(sb: ReturnType<typeof getSupabaseClient>, ch: RealtimeChannel) {
  if (!sb) return;
  try {
    await ch.untrack();
  } catch {
    /* channel may already be torn down */
  }
  try {
    await sb.removeChannel(ch);
  } catch {
    /* noop */
  }
}

/**
 * After a full page load, `getSession()` can briefly return null before storage hydration.
 * Wait for `INITIAL_SESSION` / `SIGNED_IN` so we join presence as soon as auth is ready (fixes
 * "disappears after refresh" on the other client).
 */
async function waitForUserSession(
  sb: NonNullable<ReturnType<typeof getSupabaseClient>>,
  cancelled: () => boolean
): Promise<{ user: User; session: Session } | null> {
  const immediate = await sb.auth.getSession();
  if (!cancelled() && immediate.data.session?.user) {
    return { user: immediate.data.session.user, session: immediate.data.session };
  }

  return await new Promise((resolve) => {
    let done = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const finish = (value: { user: User; session: Session } | null) => {
      if (done) return;
      done = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      try {
        subscription?.unsubscribe();
      } catch {
        /* noop */
      }
      resolve(value);
    };

    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled() || done) return;
      if (!session?.user) {
        if (event === "SIGNED_OUT") finish(null);
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        finish({ user: session.user, session });
      }
    });
    subscription = data.subscription;
    timeoutId = setTimeout(() => finish(null), 10_000);

    void sb.auth.getSession().then(({ data: d }) => {
      if (cancelled() || done) return;
      if (d.session?.user) {
        finish({ user: d.session.user, session: d.session });
      }
    });
  });
}

/** Poll interval while tab is visible (5–10s range). */
const PRESENCE_POLL_MS = 8000;

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
  const calendarRef = useRef({ calendarYear, calendarMonth0 });
  calendarRef.current = { calendarYear, calendarMonth0 };

  const syncFromPresence = useCallback((ch: RealtimeChannel, selfId: string) => {
    const state = ch.presenceState() as Record<string, RawPresenceRow[]>;
    setPeers(dedupePeersByUserId(state, selfId));
  }, []);

  const trackRef = useCallback(async () => {
    const ch = channelRef.current;
    const base = basePayloadRef.current;
    if (!ch || !base) return;
    const { calendarYear: y, calendarMonth0: m } = calendarRef.current;
    await ch.track(
      buildTrackPayload({
        userId: base.userId,
        email: base.email,
        meta: base.meta,
        color: base.color,
        avatarUrl: base.avatarUrl,
        focusCellIso: focusRef.current,
        viewYear: y,
        viewMonth0: m,
      })
    );
  }, []);

  useEffect(() => {
    if (!enabled || !tripId) return undefined;
    const sb = getSupabaseClient();
    if (!sb) return undefined;

    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    let lastRealtimeOpen = sb.realtime.isConnected();

    const runPresencePoll = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const topicFull = presenceRealtimeTopic(tripId);
      const live =
        activeChannelRef.current ?? sb.getChannels().find((c) => c.topic === topicFull) ?? null;
      const sid = selfIdRef.current;
      const socketOpen = sb.realtime.isConnected();
      if (live && sid) {
        syncFromPresence(live, sid);
      }
      if (socketOpen && !lastRealtimeOpen) {
        void trackRef();
      }
      lastRealtimeOpen = socketOpen;
    };

    const presencePollTimer = setInterval(runPresencePoll, PRESENCE_POLL_MS);

    void (async () => {
      const auth = await waitForUserSession(sb, () => cancelled);
      if (!auth || cancelled) return;

      const { user, session } = auth;

      if (session.access_token) {
        await sb.realtime.setAuth(session.access_token);
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
        await untrackAndRemoveChannel(sb, stale);
      }
      if (cancelled) return;

      ch = sb
        .channel(channelName, {
          config: {
            presence: { key: user.id, enabled: true },
          },
        })
        .on("presence", { event: "sync" }, () => {
          if (ch) syncFromPresence(ch, user.id);
        })
        .on("presence", { event: "join" }, () => {
          if (ch) syncFromPresence(ch, user.id);
        })
        .on("presence", { event: "leave" }, () => {
          if (ch) syncFromPresence(ch, user.id);
        })
        .subscribe(async (status, err) => {
          if (status !== "SUBSCRIBED" || cancelled || !ch) {
            if (status === "CHANNEL_ERROR") {
              console.warn("[trip-cal-presence] channel error", err?.message ?? err);
            }
            return;
          }
          channelRef.current = ch;
          activeChannelRef.current = ch;
          const cal = calendarRef.current;
          const track = buildTrackPayload({
            userId: user.id,
            email,
            meta,
            color,
            avatarUrl,
            focusCellIso: focusRef.current,
            viewYear: cal.calendarYear,
            viewMonth0: cal.calendarMonth0,
          });
          try {
            await ch.track(track);
          } catch (e) {
            console.warn("[trip-cal-presence] track() failed", e);
          }
        });
    })();

    const onOnline = () => {
      void trackRef();
      const topicFull = presenceRealtimeTopic(tripId);
      const live =
        activeChannelRef.current ?? sb.getChannels().find((c) => c.topic === topicFull) ?? null;
      const sid = selfIdRef.current;
      if (live && sid) {
        syncFromPresence(live, sid);
      }
      lastRealtimeOpen = sb.realtime.isConnected();
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        lastRealtimeOpen = sb.realtime.isConnected();
        void trackRef();
        const topicFull = presenceRealtimeTopic(tripId);
        const live =
          activeChannelRef.current ?? sb.getChannels().find((c) => c.topic === topicFull) ?? null;
        const sid = selfIdRef.current;
        if (live && sid) {
          syncFromPresence(live, sid);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      cancelled = true;
      clearInterval(presencePollTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        document.removeEventListener("visibilitychange", onVisible);
      }
      const topicFull = presenceRealtimeTopic(tripId);
      const toRemove =
        activeChannelRef.current ?? sb.getChannels().find((c) => c.topic === topicFull) ?? null;
      activeChannelRef.current = null;
      channelRef.current = null;
      if (toRemove) {
        void untrackAndRemoveChannel(sb, toRemove);
      }
      setPeers([]);
    };
  }, [tripId, enabled, syncFromPresence, trackRef]);

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
    const m = new Map<string, Map<string, TripCalendarPeer>>();
    for (const p of peers) {
      if (!p.focusCellIso) continue;
      let inner = m.get(p.focusCellIso);
      if (!inner) {
        inner = new Map();
        m.set(p.focusCellIso, inner);
      }
      inner.set(p.userId, p);
    }
    const out = new Map<string, TripCalendarPeer[]>();
    for (const [cell, umap] of m) {
      out.set(cell, [...umap.values()]);
    }
    return out;
  }, [peers]);

  return {
    peers,
    peersByCellIso,
    setFocusedCell,
    selfUserId: selfIdRef.current,
  };
}
