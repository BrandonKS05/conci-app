import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { extractOpenAiResponsesOutputText } from "@/shared/openai-responses";
import { normalizePackingListText } from "@/shared/packing-list-import";
import { isUuid } from "@/shared/is-uuid";

export const runtime = "nodejs";

const MAX_TEXT_BYTES = 512_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SYSTEM_IMAGE =
  "You extract a travel packing list. Output plain text only: one item per line, no numbering or bullets unless the source clearly uses them as labels. Skip section headers that are not items. Merge obvious duplicates. If nothing is readable, output a single line: (could not read items)";

async function parseWithOpenAiVision(dataUrl: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM_IMAGE },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "List every packable item mentioned in this image (checklist, note, photo of a list, or scattered gear).",
            },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err.slice(0, 500));
  }
  const payload = await response.json();
  const text = extractOpenAiResponsesOutputText(payload).trim();
  return text || null;
}

function isProbablyTextFile(file: File, nameLower: string): boolean {
  const t = file.type;
  if (t.startsWith("text/")) return true;
  if (t === "application/json" || t === "application/xml") return true;
  return (
    nameLower.endsWith(".txt") ||
    nameLower.endsWith(".md") ||
    nameLower.endsWith(".csv") ||
    nameLower.endsWith(".json") ||
    nameLower.endsWith(".xml")
  );
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }

  const { data: row, error: rowErr } = await svc
    .from("trip_plans")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (row.status === "finalized") {
    return NextResponse.json({ error: "This trip is finalized — packing import is locked." }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form with a file field." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1) {
    return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  }

  const nameLower = file.name.toLowerCase();

  if (isProbablyTextFile(file, nameLower)) {
    if (file.size > MAX_TEXT_BYTES) {
      return NextResponse.json({ error: "Text file is too large (max ~500 KB)." }, { status: 400 });
    }
    try {
      const raw = await file.text();
      const packingList = normalizePackingListText(raw);
      return NextResponse.json({ packingList });
    } catch {
      return NextResponse.json({ error: "Could not read text from this file." }, { status: 400 });
    }
  }

  if (file.type.startsWith("image/")) {
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 5 MB)." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    const b64 = buf.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    if (dataUrl.length > 900_000) {
      return NextResponse.json({ error: "Image payload is too large." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        {
          error:
            "Image parsing requires OPENAI_API_KEY on the server. Try a .txt list or paste text instead.",
        },
        { status: 503 }
      );
    }

    try {
      const extracted = await parseWithOpenAiVision(dataUrl);
      if (!extracted) {
        return NextResponse.json({ error: "Could not read items from this image." }, { status: 502 });
      }
      const packingList = normalizePackingListText(extracted);
      return NextResponse.json({ packingList });
    } catch (e) {
      console.error("[packing-import] vision error:", e);
      return NextResponse.json({ error: "Image import failed. Try a smaller photo or a text file." }, { status: 502 });
    }
  }

  return NextResponse.json(
    {
      error: "Unsupported type. Use a text file (.txt, .md, .csv) or an image (JPEG, PNG, WebP, GIF).",
    },
    { status: 400 }
  );
}
