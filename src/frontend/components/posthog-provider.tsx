"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { getSupabaseClient } from "@/frontend/supabase/client";

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <PostHogTracker />
      </Suspense>
    </>
  );
}

function PostHogTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      persistence: "localStorage+cookie",
      loaded: (ph) => {
        if (process.env.NODE_ENV !== "production") ph.debug();
      },
    });
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const query = searchParams.toString();
    posthog.capture("$pageview", {
      $current_url: query ? `${pathname}?${query}` : pathname,
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const syncIdentity = (userId: string | null | undefined) => {
      if (userId) {
        posthog.identify(userId, {});
      } else {
        posthog.reset();
      }
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      syncIdentity(session?.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncIdentity(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
