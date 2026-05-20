import { isUuid } from "@/shared/is-uuid";

export const dynamic = "force-dynamic";

type ChecklistItem = "lodging" | "meals" | "activities" | "budget";

interface ProgressPayload {
  type: "progress";
  stage: string;
  percent: number;
  completed: ChecklistItem[];
}

interface CompletePayload {
  type: "complete";
  itinerary: unknown;
  plan: unknown;
}

interface ErrorPayload {
  type: "error";
  message: string;
}

type StreamPayload = ProgressPayload | CompletePayload | ErrorPayload;

function sseChunk(payload: StreamPayload): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}


export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    const body: ErrorPayload = { type: "error", message: "Invalid trip id" };
    return new Response(`data: ${JSON.stringify(body)}\n\n`, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const origin = new URL(req.url).origin;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const emit = (payload: StreamPayload) => {
        if (closed) return;
        try {
          controller.enqueue(sseChunk(payload));
        } catch {
          // client disconnected
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      try {
        emit({ type: "progress", stage: "Getting ready...", percent: 5, completed: [] });
        emit({ type: "progress", stage: "Analyzing your trip details...", percent: 14, completed: [] });
        emit({ type: "progress", stage: "Crafting your perfect itinerary...", percent: 22, completed: [] });

        // Slowly advance percent while the AI call is in flight
        let livePercent = 22;
        const ticker = setInterval(() => {
          if (livePercent < 60) {
            livePercent = Math.min(60, livePercent + 2);
            emit({ type: "progress", stage: "Crafting your perfect itinerary...", percent: livePercent, completed: [] });
          }
        }, 1800);

        const generateRes = await fetch(`${origin}/api/trip-plans/${id}/generate-itinerary`, {
          method: "POST",
          headers: { cookie: cookieHeader },
        });

        clearInterval(ticker);

        if (!generateRes.ok) {
          const errBody = await generateRes.json().catch(() => ({})) as { error?: string };
          emit({ type: "error", message: errBody.error ?? "Failed to generate itinerary" });
          close();
          return;
        }

        const result = await generateRes.json() as { itinerary?: unknown; plan?: unknown };

        emit({ type: "progress", stage: "Reviewing lodging options...", percent: 70, completed: ["lodging"] });
        emit({ type: "progress", stage: "Curating restaurant picks...", percent: 80, completed: ["lodging", "meals"] });
        emit({ type: "progress", stage: "Scheduling activities...", percent: 88, completed: ["lodging", "meals", "activities"] });
        emit({ type: "progress", stage: "Finalizing your budget...", percent: 94, completed: ["lodging", "meals", "activities", "budget"] });
        emit({ type: "complete", itinerary: result.itinerary, plan: result.plan });
        close();
      } catch (err) {
        emit({ type: "error", message: (err as Error)?.message ?? "Something went wrong" });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
