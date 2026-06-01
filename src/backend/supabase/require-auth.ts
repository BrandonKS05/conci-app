import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "./auth-server";

type AuthOk = { user: User };
type AuthFail = { response: NextResponse };

/**
 * Call at the top of any Route Handler that requires a logged-in user.
 *
 *   const auth = await requireAuth();
 *   if ('response' in auth) return auth.response; // 401
 *   const { user } = auth;
 */
export async function requireAuth(): Promise<AuthOk | AuthFail> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}
