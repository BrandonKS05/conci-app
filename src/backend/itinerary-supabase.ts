import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { activities, flights, restaurants } from "@/backend/mock-data";
import type { ItineraryItemRow, RequestRow, SelectionRow } from "@/shared/itinerary-contract";
import { logItineraryDiagnostic, logItineraryError } from "@/backend/itinerary-debug";
import type { Itinerary, ItineraryItem } from "@/shared/itinerary-model";
import { parseRequestWithLLM } from "@/backend/request-parser";
import { getSupabaseServerClient } from "@/backend/supabase/server";

type SerializableSupabaseError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  statusText?: string;
  name?: string;
  stack?: string;
  raw?: unknown;
};

export class ItinerarySupabaseError extends Error {
  code: string;
  details: SerializableSupabaseError;
  operation: string;

  constructor(operation: string, message: string, code: string, details: SerializableSupabaseError) {
    super(message);
    this.name = "ItinerarySupabaseError";
    this.operation = operation;
    this.code = code;
    this.details = details;
  }
}

export type SafeItineraryLoadResult = {
  itinerary: Itinerary | null;
  error: {
    message: string;
    code?: string;
    operation?: string;
    stack?: string;
  } | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hasSupabaseItineraryPersistence() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function supabaseOrNull() {
  return hasSupabaseItineraryPersistence() ? getSupabaseServerClient() : null;
}

function serializeSupabaseError(error: unknown): SerializableSupabaseError {
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    return {
      message: typeof candidate.message === "string" ? candidate.message : "Unknown Supabase error",
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      details: typeof candidate.details === "string" ? candidate.details : undefined,
      hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
      status: typeof candidate.status === "number" ? candidate.status : undefined,
      statusText: typeof candidate.statusText === "string" ? candidate.statusText : undefined,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      stack: typeof candidate.stack === "string" ? candidate.stack : undefined,
      raw: candidate,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown Supabase error",
    raw: error,
  };
}

function raiseSupabaseError(operation: string, error: unknown): never {
  const serialized = serializeSupabaseError(error);
  logItineraryError("supabase.error", {
    operation,
    error: serialized,
  });
  throw new ItinerarySupabaseError(operation, serialized.message, serialized.code || "supabase_error", serialized);
}

function normalizeDbUuid(value: string, field: string) {
  if (UUID_PATTERN.test(value)) {
    return value;
  }

  throw new ItinerarySupabaseError("sanitizePayload", `Invalid UUID for ${field}: ${value}`, "bad_insert_payload", {
    message: `Invalid UUID for ${field}: ${value}`,
    raw: { field, value },
  });
}

function sanitizeRequestRow(itinerary: Itinerary): RequestRow {
  return {
    id: normalizeDbUuid(itinerary.id, "requests.id"),
    prompt: itinerary.prompt,
    category: itinerary.category,
    budget: itinerary.budget,
    guest_count: itinerary.guest_count,
    location: itinerary.location,
    start_date: itinerary.start_date,
    end_date: itinerary.end_date,
    created_at: itinerary.created_at,
  };
}

function sanitizeItemRow(requestId: string, item: ItineraryItem, position: number): ItineraryItemRow {
  return {
    id: normalizeDbUuid(item.id, "itinerary_items.id"),
    request_id: normalizeDbUuid(requestId, "itinerary_items.request_id"),
    item_type: item.kind,
    title: item.title,
    details: item.details,
    position,
    created_at: new Date().toISOString(),
  };
}

function sanitizeSelectionRow(
  requestId: string,
  selection: Itinerary["selections"][number],
  validItemIds: Set<string>
): SelectionRow {
  const normalizedItemId =
    selection.itinerary_item_id && validItemIds.has(selection.itinerary_item_id)
      ? normalizeDbUuid(selection.itinerary_item_id, "selections.itinerary_item_id")
      : null;

  return {
    id: normalizeDbUuid(selection.id, "selections.id"),
    request_id: normalizeDbUuid(requestId, "selections.request_id"),
    itinerary_item_id: normalizedItemId,
    status: selection.status,
    created_at: selection.created_at,
  };
}

function normalizedName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function providerForItem(row: ItineraryItemRow) {
  if (row.item_type === "flight") {
    return (
      flights.find((flight) => normalizedName(flight.airline) === normalizedName(row.title)) ||
      flights[0]
    );
  }

  if (row.item_type === "restaurant") {
    return (
      restaurants.find((restaurant) => normalizedName(restaurant.name) === normalizedName(row.title)) ||
      restaurants[0]
    );
  }

  return (
    activities.find((activity) => normalizedName(activity.name) === normalizedName(row.title)) ||
    activities[0]
  );
}

function defaultTone(kind: ItineraryItem["kind"], position: number) {
  if (kind === "flight") {
    return position % 3 === 0
      ? "from-sky-50 via-white to-white"
      : position % 3 === 1
        ? "from-amber-50 via-white to-white"
        : "from-emerald-50 via-white to-white";
  }

  if (kind === "restaurant") {
    return position % 3 === 0
      ? "from-amber-50 via-white to-white"
      : position % 3 === 1
        ? "from-rose-50 via-white to-white"
        : "from-orange-50 via-white to-white";
  }

  return position % 3 === 0
    ? "from-emerald-50 via-white to-white"
    : position % 3 === 1
      ? "from-cyan-50 via-white to-white"
      : "from-lime-50 via-white to-white";
}

function hydrateItem(row: ItineraryItemRow): ItineraryItem {
  const kind = row.item_type;

  if (kind === "flight") {
    const provider = providerForItem(row);
    if (!("depart" in provider && "arrive" in provider && "price" in provider)) {
      throw new ItinerarySupabaseError("hydrateItem", "Flight provider payload did not match expected shape.", "bad_insert_payload", {
        message: "Flight provider payload did not match expected shape.",
        raw: { row, provider },
      });
    }

    return {
      id: row.id,
      slot_key: `${kind}-${row.position + 1}`,
      kind,
      provider_id: provider.id,
      title: row.title,
      details: row.details,
      meta: `${provider.depart} · ${provider.arrive}`,
      price: provider.price,
      tone: defaultTone(kind, row.position),
      position: row.position,
      status: "active",
    };
  }

  if (kind === "restaurant") {
    const provider = providerForItem(row);
    if (!("summary" in provider && "price" in provider)) {
      throw new ItinerarySupabaseError("hydrateItem", "Restaurant provider payload did not match expected shape.", "bad_insert_payload", {
        message: "Restaurant provider payload did not match expected shape.",
        raw: { row, provider },
      });
    }

    return {
      id: row.id,
      slot_key: `${kind}-${row.position + 1}`,
      kind,
      provider_id: provider.id,
      title: row.title,
      details: row.details,
      meta: provider.summary,
      price: provider.price,
      tone: defaultTone(kind, row.position),
      position: row.position,
      status: "active",
    };
  }

  const provider = providerForItem(row);
  if (!("summary" in provider && "time" in provider)) {
    throw new ItinerarySupabaseError("hydrateItem", "Activity provider payload did not match expected shape.", "bad_insert_payload", {
      message: "Activity provider payload did not match expected shape.",
      raw: { row, provider },
    });
  }

  return {
    id: row.id,
    slot_key: `${kind}-${row.position + 1}`,
    kind,
    provider_id: provider.id,
    title: row.title,
    details: row.details,
    meta: provider.summary,
    price: provider.time,
    tone: defaultTone(kind, row.position),
    position: row.position,
    status: "active",
  };
}

async function fetchLatestRequest(client: SupabaseClient) {
  try {
    logItineraryDiagnostic("supabase.read.fetch_latest_request", {
      table: "requests",
      orderBy: "created_at desc",
      limit: 1,
    });
    const { data, error } = await client
      .from("requests")
      .select("id, prompt, category, budget, guest_count, location, start_date, end_date, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RequestRow>();

    if (error) {
      raiseSupabaseError("fetchLatestRequest", error);
    }

    return data || null;
  } catch (error) {
    if (error instanceof ItinerarySupabaseError) throw error;
    raiseSupabaseError("fetchLatestRequest", error);
  }
}

async function fetchItemsByRequestId(client: SupabaseClient, requestId: string) {
  try {
    logItineraryDiagnostic("supabase.read.fetch_items_by_request_id", {
      table: "itinerary_items",
      requestId,
    });
    const { data, error } = await client
      .from("itinerary_items")
      .select("id, request_id, item_type, title, details, position, created_at")
      .eq("request_id", normalizeDbUuid(requestId, "itinerary_items.request_id"))
      .order("position", { ascending: true })
      .returns<ItineraryItemRow[]>();

    if (error) {
      raiseSupabaseError("fetchItemsByRequestId", error);
    }

    return data || [];
  } catch (error) {
    if (error instanceof ItinerarySupabaseError) throw error;
    raiseSupabaseError("fetchItemsByRequestId", error);
  }
}

async function fetchSelectionsByRequestId(client: SupabaseClient, requestId: string) {
  try {
    logItineraryDiagnostic("supabase.read.fetch_selections_by_request_id", {
      table: "selections",
      requestId,
    });
    const { data, error } = await client
      .from("selections")
      .select("id, request_id, itinerary_item_id, status, created_at")
      .eq("request_id", normalizeDbUuid(requestId, "selections.request_id"))
      .order("created_at", { ascending: true })
      .returns<SelectionRow[]>();

    if (error) {
      raiseSupabaseError("fetchSelectionsByRequestId", error);
    }

    return data || [];
  } catch (error) {
    if (error instanceof ItinerarySupabaseError) throw error;
    raiseSupabaseError("fetchSelectionsByRequestId", error);
  }
}

async function writeRequestRow(client: SupabaseClient, itinerary: Itinerary) {
  try {
    const row = sanitizeRequestRow(itinerary);
    logItineraryDiagnostic("supabase.write.requests.upsert", {
      row,
    });
    const { error } = await client.from("requests").upsert(row, { onConflict: "id" });
    if (error) {
      raiseSupabaseError("writeRequestRow", error);
    }
  } catch (error) {
    if (error instanceof ItinerarySupabaseError) throw error;
    raiseSupabaseError("writeRequestRow", error);
  }
}

async function replaceItemsForRequest(client: SupabaseClient, requestId: string, items: ItineraryItem[]) {
  try {
    const normalizedRequestId = normalizeDbUuid(requestId, "itinerary_items.request_id");
    logItineraryDiagnostic("supabase.write.itinerary_items.replace.delete", {
      requestId: normalizedRequestId,
    });
    const { error: deleteError } = await client.from("itinerary_items").delete().eq("request_id", normalizedRequestId);
    if (deleteError) {
      raiseSupabaseError("replaceItemsForRequest.delete", deleteError);
    }

    const activeItems = items.filter((item) => item.status === "active");
    if (activeItems.length === 0) {
      logItineraryDiagnostic("supabase.write.itinerary_items.replace.skip_insert", {
        requestId: normalizedRequestId,
        activeItemCount: 0,
      });
      return;
    }

    const rows = activeItems.map((item, index) => sanitizeItemRow(requestId, item, index));
    logItineraryDiagnostic("supabase.write.itinerary_items.replace.insert", {
      requestId: normalizedRequestId,
      rowCount: rows.length,
      rows,
    });
    const { error: insertError } = await client.from("itinerary_items").insert(rows);
    if (insertError) {
      raiseSupabaseError("replaceItemsForRequest.insert", insertError);
    }
  } catch (error) {
    if (error instanceof ItinerarySupabaseError) throw error;
    raiseSupabaseError("replaceItemsForRequest", error);
  }
}

async function appendSelections(
  client: SupabaseClient,
  requestId: string,
  selections: Itinerary["selections"],
  items: ItineraryItem[]
) {
  if (selections.length === 0) {
    logItineraryDiagnostic("supabase.write.selections.skip_insert", {
      requestId,
      rowCount: 0,
    });
    return;
  }

  try {
    const validItemIds = new Set(
      items
        .filter((item) => item.status === "active")
        .map((item) => item.id)
    );
    const rows = selections.map((selection) => sanitizeSelectionRow(requestId, selection, validItemIds));
    logItineraryDiagnostic("supabase.write.selections.insert", {
      requestId,
      rowCount: rows.length,
      rows,
    });
    const { error } = await client.from("selections").insert(rows);
    if (error) {
      raiseSupabaseError("appendSelections", error);
    }
  } catch (error) {
    if (error instanceof ItinerarySupabaseError) throw error;
    raiseSupabaseError("appendSelections", error);
  }
}

export async function loadCurrentItineraryFromSupabase() {
  logItineraryDiagnostic("supabase.load_current_itinerary.begin");
  const client = supabaseOrNull();
  if (!client) {
    logItineraryDiagnostic("supabase.load_current_itinerary.skipped", {
      reason: "missing_supabase_env",
    });
    return null;
  }

  const request = await fetchLatestRequest(client);
  if (!request) {
    return null;
  }

  const [itemRows, selectionRows, parsed] = await Promise.all([
    fetchItemsByRequestId(client, request.id),
    fetchSelectionsByRequestId(client, request.id),
    parseRequestWithLLM(request.prompt),
  ]);

  const itineraryItems = itemRows.map(hydrateItem).sort((left, right) => left.position - right.position);

  const itinerary = {
    id: request.id,
    prompt: request.prompt,
    category: request.category,
    budget: (request.budget as Itinerary["budget"]) || "mid-range",
    guest_count: request.guest_count,
    location: request.location,
    start_date: request.start_date,
    end_date: request.end_date,
    time_hint: parsed.time,
    itinerary_items: itineraryItems,
    removed_items: [],
    selections: selectionRows,
    parsed_request: parsed,
    created_at: request.created_at,
  } satisfies Itinerary;

  logItineraryDiagnostic("supabase.load_current_itinerary.result", {
    requestId: itinerary.id,
    category: itinerary.category,
    itemCount: itinerary.itinerary_items.length,
    selectionCount: itinerary.selections.length,
  });

  return itinerary;
}

export async function safeLoadCurrentItineraryFromSupabase(): Promise<SafeItineraryLoadResult> {
  try {
    const itinerary = await loadCurrentItineraryFromSupabase();
    logItineraryDiagnostic("supabase.load_current_itinerary.safe_result", {
      hasItinerary: Boolean(itinerary),
      itineraryId: itinerary?.id || null,
    });
    return {
      itinerary,
      error: null,
    };
  } catch (error) {
    const normalized =
      error instanceof ItinerarySupabaseError
        ? {
            message: error.message,
            code: error.code,
            operation: error.operation,
            stack: error.stack,
          }
        : error instanceof Error
          ? {
              message: error.message,
              code: undefined,
              operation: "loadCurrentItineraryFromSupabase",
              stack: error.stack,
            }
          : {
              message: "Unknown itinerary load error",
              code: undefined,
              operation: "loadCurrentItineraryFromSupabase",
              stack: undefined,
            };

    logItineraryError("supabase.load_current_itinerary.safe_error", normalized);
    return {
      itinerary: null,
      error: normalized,
    };
  }
}

export async function persistItineraryToSupabase(itinerary: Itinerary, previousSelectionsCount = 0) {
  const client = supabaseOrNull();
  if (!client) {
    logItineraryDiagnostic("supabase.persist_itinerary.skipped", {
      reason: "missing_supabase_env",
      itineraryId: itinerary.id,
    });
    return;
  }

  logItineraryDiagnostic("supabase.persist_itinerary.begin", {
    itineraryId: itinerary.id,
    category: itinerary.category,
    itemCount: itinerary.itinerary_items.length,
    previousSelectionsCount,
    selectionCount: itinerary.selections.length,
  });
  await writeRequestRow(client, itinerary);
  await replaceItemsForRequest(client, itinerary.id, itinerary.itinerary_items);
  await appendSelections(client, itinerary.id, itinerary.selections.slice(previousSelectionsCount), itinerary.itinerary_items);
  logItineraryDiagnostic("supabase.persist_itinerary.complete", {
    itineraryId: itinerary.id,
  });
}

export async function seedSupabaseItineraryIfNeeded(generator: () => Promise<Itinerary>) {
  const existing = await loadCurrentItineraryFromSupabase();
  if (existing) {
    return existing;
  }

  const seeded = await generator();
  await persistItineraryToSupabase(seeded);
  return seeded;
}
