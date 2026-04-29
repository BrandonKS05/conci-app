import { NextResponse } from "next/server";
import { ItinerarySupabaseError } from "@/lib/itinerary-supabase";

export function classifyItineraryError(error: unknown) {
  if (error instanceof ItinerarySupabaseError) {
    if (error.code && error.code !== "supabase_error") {
      return error.code;
    }

    const message = `${error.message} ${error.details.message || ""}`.toLowerCase();
    if (message.includes("does not exist") || message.includes("column") || message.includes("relation") || message.includes("table")) {
      return "missing_supabase_schema";
    }
    if (message.includes("permission denied") || message.includes("rls") || message.includes("row-level security")) {
      return "rls_or_permission_issue";
    }
    if (message.includes("invalid") || message.includes("violates") || message.includes("payload") || message.includes("uuid")) {
      return "bad_insert_payload";
    }

    return "supabase_error";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("invalid") || message.includes("payload") || message.includes("uuid")) {
    return "bad_insert_payload";
  }
  return "unknown";
}

export function normalizeItineraryError(error: unknown) {
  if (error instanceof ItinerarySupabaseError) {
    const { raw: _raw, ...details } = error.details;
    return {
      message: error.message,
      code: classifyItineraryError(error),
      details: {
        operation: error.operation,
        ...details,
      },
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: classifyItineraryError(error),
      details: {
        name: error.name,
        stack: error.stack,
      },
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown server error",
    code: classifyItineraryError(error),
    details: error,
  };
}

export function itineraryErrorResponse(error: unknown, fallbackMessage: string) {
  const normalized = normalizeItineraryError(error);
  const status =
    normalized.code === "missing_supabase_schema" || normalized.code === "rls_or_permission_issue"
      ? 500
      : 400;

  console.error("Conci itinerary route error", normalized);

  return NextResponse.json(
    {
      error: {
        message: normalized.message || fallbackMessage,
        code: normalized.code,
        details: normalized.details,
      },
    },
    { status }
  );
}
