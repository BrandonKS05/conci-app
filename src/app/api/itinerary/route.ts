import { NextResponse } from "next/server";
import { buildItineraryScreenData, getActiveItinerary, initializeItinerary } from "@/backend/itinerary-store";
import { itineraryErrorResponse } from "@/backend/itinerary-errors";
import type { CreateItineraryRequest, ItineraryApiResponse } from "@/shared/itinerary-contract";
import { logItineraryDiagnostic } from "@/backend/itinerary-debug";

export const runtime = "nodejs";

export async function GET() {
  try {
    logItineraryDiagnostic("route.entry.get_itinerary");
    const itinerary = await getActiveItinerary();
    const response: Partial<ItineraryApiResponse> & { itinerary: typeof itinerary } = itinerary
      ? buildItineraryScreenData(itinerary)
      : { itinerary: null };

    logItineraryDiagnostic("route.response.get_itinerary", {
      hasItinerary: Boolean(response.itinerary),
      itineraryId: response.itinerary?.id || null,
      sectionCount: "sections" in response && response.sections ? response.sections.length : 0,
    });
    return NextResponse.json(response);
  } catch (error) {
    return itineraryErrorResponse(error, "Failed to load itinerary.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CreateItineraryRequest;
    logItineraryDiagnostic("route.entry.create_itinerary", {
      hasParsed: Boolean(body.parsed),
      requestPreview: body.request || "",
      parsedCategory: body.parsed?.category || null,
      parsedFlowMode: body.parsed?.flow_mode || null,
    });

    if (!body.parsed) {
      return NextResponse.json(
        {
          error: {
            message: "Parsed request is required.",
            code: "bad_insert_payload",
          },
        },
        { status: 400 }
      );
    }

    const itinerary = await initializeItinerary({
      prompt: body.request ?? "",
      parsed: body.parsed,
    });

    const response: ItineraryApiResponse = buildItineraryScreenData(itinerary);

    logItineraryDiagnostic("route.response.create_itinerary", {
      itineraryId: response.itinerary?.id || null,
      category: response.itinerary?.category || null,
      itemCount: response.itinerary?.itinerary_items.length || 0,
      selectionCount: response.itinerary?.selections.length || 0,
      sectionCount: response.sections.length,
    });
    return NextResponse.json(response);
  } catch (error) {
    return itineraryErrorResponse(error, "Failed to create itinerary.");
  }
}
