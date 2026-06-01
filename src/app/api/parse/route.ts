import { NextResponse } from "next/server";
import { parseRequestWithLLM } from "@/backend/request-parser";
import { requireAuth } from "@/backend/supabase/require-auth";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { request?: string };
  const parsed = await parseRequestWithLLM(body.request ?? "");

  return NextResponse.json({ parsed });
}
