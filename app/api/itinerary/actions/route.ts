import { NextResponse } from "next/server";
import { applyItineraryAction, buildItineraryScreenData } from "@/lib/itinerary-store";
import { itineraryErrorResponse } from "@/lib/itinerary-errors";
import type { ItineraryApiResponse, MutateItineraryRequest } from "@/lib/itinerary-contract";
import { logItineraryDiagnostic } from "@/lib/itinerary-debug";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as MutateItineraryRequest;
    logItineraryDiagnostic("route.entry.mutate_itinerary", {
      actionType: body.action?.type || null,
      itemId: body.action && "item_id" in body.action ? body.action.item_id : null,
    });

    if (!body.action) {
      return NextResponse.json(
        {
          error: {
            message: "Action is required.",
            code: "bad_insert_payload",
          },
        },
        { status: 400 }
      );
    }

    const itinerary = await applyItineraryAction(body.action);
    const response: Partial<ItineraryApiResponse> & { itinerary: typeof itinerary } = itinerary
      ? buildItineraryScreenData(itinerary)
      : { itinerary: null };

    logItineraryDiagnostic("route.response.mutate_itinerary", {
      actionType: body.action.type,
      itineraryId: response.itinerary?.id || null,
      itemCount: response.itinerary?.itinerary_items.length || 0,
      selectionCount: response.itinerary?.selections.length || 0,
      sectionCount: "sections" in response && response.sections ? response.sections.length : 0,
    });
    return NextResponse.json(response);
  } catch (error) {
    return itineraryErrorResponse(error, "Failed to mutate itinerary.");
  }
}
