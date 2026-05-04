import { NextResponse } from "next/server";
import { parseRequestWithLLM } from "@/backend/request-parser";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { request?: string };
  const parsed = await parseRequestWithLLM(body.request ?? "");

  return NextResponse.json({ parsed });
}
