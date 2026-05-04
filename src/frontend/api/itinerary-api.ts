import type {
  CreateItineraryRequest,
  ItineraryApiResponse,
  MutationErrorShape,
  MutateItineraryRequest,
} from "@/shared/itinerary-contract";
import type { Itinerary, ItineraryActionRequest } from "@/shared/itinerary-model";
import { logItineraryDiagnostic, logItineraryError } from "@/backend/itinerary-debug";
import type { ParsedRequest } from "@/shared/request-types";

export type ApiErrorResponse = MutationErrorShape;

export class ItineraryApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(message: string, code: string, status: number, details: unknown) {
    super(message);
    this.name = "ItineraryApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function classifyClientError(code: string | undefined, status: number, message: string) {
  const lower = `${code || ""} ${message}`.toLowerCase();

  if (code) {
    return code;
  }

  if (status === 401 || status === 403 || lower.includes("rls") || lower.includes("permission")) {
    return "rls_or_permission_issue";
  }

  if (lower.includes("table") || lower.includes("relation")) {
    return "missing_supabase_table";
  }

  if (lower.includes("payload") || lower.includes("invalid") || lower.includes("syntax")) {
    return "bad_insert_payload";
  }

  if (lower.includes("env") || lower.includes("config") || lower.includes("supabase")) {
    return "env_or_config_issue";
  }

  return "unknown";
}

async function readErrorResponse(response: Response) {
  const text = await response.text();
  let json: ApiErrorResponse | null = null;

  if (text) {
    try {
      json = JSON.parse(text) as ApiErrorResponse;
    } catch {
      json = null;
    }
  }

  return {
    text,
    json: json || ({ error: { message: text || "Empty error response from server." } } as ApiErrorResponse),
  };
}

function logClientError(actionName: string, response: Response, errorBody: Awaited<ReturnType<typeof readErrorResponse>>) {
  logItineraryError("client.error", {
    actionName,
    status: response.status,
    rawResponseText: errorBody.text,
    parsedJson: errorBody.json,
  });
}

export async function createActiveItinerary(request: string, parsed: ParsedRequest) {
  const payload: CreateItineraryRequest = { request, parsed };
  logItineraryDiagnostic("client.dispatch.create_itinerary", {
    requestPreview: request,
    parsedCategory: parsed.category,
    parsedFlowMode: parsed.flow_mode,
  });
  logItineraryDiagnostic("client.api_payload.create_itinerary", payload);
  const response = await fetch("/api/itinerary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await readErrorResponse(response);
    const serverMessage = errorBody.json.error?.message || `Request failed with status ${response.status}`;
    const code = classifyClientError(errorBody.json.error?.code, response.status, serverMessage);
    const details = errorBody.json.error?.details;
    logClientError("create", response, errorBody);

    throw new ItineraryApiError(
      `${serverMessage} [${code}]`,
      code,
      response.status,
      details
    );
  }

  return (await response.json()) as ItineraryApiResponse;
}

export async function loadActiveItinerary() {
  logItineraryDiagnostic("client.dispatch.load_itinerary");
  const response = await fetch("/api/itinerary", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await readErrorResponse(response);
    const serverMessage = errorBody.json.error?.message || `Request failed with status ${response.status}`;
    const code = classifyClientError(errorBody.json.error?.code, response.status, serverMessage);
    logClientError("load", response, errorBody);
    throw new ItineraryApiError(
      `${serverMessage} [${code}]`,
      code,
      response.status,
      errorBody.json.error?.details
    );
  }

  return (await response.json()) as Partial<ItineraryApiResponse> & { itinerary: Itinerary | null };
}

export async function mutateActiveItinerary(action: ItineraryActionRequest) {
  const payload: MutateItineraryRequest = { action };
  logItineraryDiagnostic("client.dispatch.mutate_itinerary", {
    actionType: action.type,
    itemId: "item_id" in action ? action.item_id : null,
  });
  logItineraryDiagnostic("client.api_payload.mutate_itinerary", payload);
  const response = await fetch("/api/itinerary/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await readErrorResponse(response);
    const serverMessage = errorBody.json.error?.message || `Request failed with status ${response.status}`;
    const code = classifyClientError(errorBody.json.error?.code, response.status, serverMessage);
    logClientError("mutate", response, errorBody);
    throw new ItineraryApiError(
      `${serverMessage} [${code}]`,
      code,
      response.status,
      errorBody.json.error?.details
    );
  }

  return (await response.json()) as Partial<ItineraryApiResponse> & { itinerary: Itinerary | null };
}
