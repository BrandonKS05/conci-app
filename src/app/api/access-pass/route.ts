import { NextResponse } from "next/server";
import { publicOriginFromRequest } from "@/backend/app-base-url";
import { ACCESS_PASS_COOKIE, accessPassToken } from "@/backend/access-pass";

export const runtime = "nodejs";

// Grants the free-access pass (paywall bypass), then sends the visitor into the
// trip builder. Reached from the /welcome "Try Conci free" button.
export async function GET(request: Request) {
  const origin = publicOriginFromRequest(request);
  const res = NextResponse.redirect(`${origin}/trip-parser`);
  res.cookies.set(ACCESS_PASS_COOKIE, accessPassToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
