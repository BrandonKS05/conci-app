import { isUuid } from "@/shared/is-uuid";

export const dynamic = "force-dynamic";

/** Upper bound on the internal generate-itinerary call so the SSE stream can't hang forever.
 * Generous enough to cover a long trip with a budget-repair pass. */
const STREAM_FETCH_TIMEOUT_MS = 150_000;

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
        emit({ type: "progress", stage: "Analyzing your trip details...", percent: 12, completed: [] });

        // We can't observe the AI route's internal stages without restructuring it, so pace
        // the checklist (lodging → meals → activities) over the expected wait instead of
        // dumping all of it the instant the call returns. The final "budget" item is checked
        // off by the real `complete` event below.
        const steps: { after: number; percent: number; stage: string; completed: ChecklistItem[] }[] = [
          { after: 5000, percent: 35, stage: "Reviewing lodging options...", completed: ["lodging"] },
          { after: 12000, percent: 60, stage: "Curating restaurant picks...", completed: ["lodging", "meals"] },
          { after: 20000, percent: 82, stage: "Scheduling activities...", completed: ["lodging", "meals", "activities"] },
        ];
        const timers = steps.map((s) =>
          setTimeout(
            () => emit({ type: "progress", stage: s.stage, percent: s.percent, completed: s.completed }),
            s.after
          )
        );
        const clearTimers = () => timers.forEach(clearTimeout);

        let generateRes: Response;
        try {
          generateRes = await fetch(`${origin}/api/trip-plans/${id}/generate-itinerary`, {
            method: "POST",
            headers: { cookie: cookieHeader },
            signal: AbortSignal.timeout(STREAM_FETCH_TIMEOUT_MS),
          });
        } catch (e) {
          clearTimers();
          const timedOut = (e as Error)?.name === "TimeoutError";
          emit({
            type: "error",
            message: timedOut
              ? "Itinerary generation timed out. Please try again."
              : "Failed to generate itinerary",
          });
          close();
          return;
        }
        clearTimers();

        if (!generateRes.ok) {
          const errBody = await generateRes.json().catch(() => ({})) as { error?: string };
          emit({ type: "error", message: errBody.error ?? "Failed to generate itinerary" });
          close();
          return;
        }

        const result = await generateRes.json() as { itinerary?: unknown; plan?: unknown };
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
