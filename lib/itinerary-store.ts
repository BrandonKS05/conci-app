import "server-only";

import fs from "node:fs";
import path from "node:path";
import { activities, flights, restaurants } from "@/lib/mock-data";
import { examplePrompt } from "@/lib/app-defaults";
import type { ItinerarySection, ItineraryScreenData } from "@/lib/itinerary-view";
import {
  hasSupabaseItineraryPersistence,
  loadCurrentItineraryFromSupabase,
  persistItineraryToSupabase,
  safeLoadCurrentItineraryFromSupabase,
  seedSupabaseItineraryIfNeeded,
} from "@/lib/itinerary-supabase";
import type {
  Itinerary,
  ItineraryActionRequest,
  ItineraryBudget,
  ItineraryItem,
  ItineraryItemKind,
  ItinerarySelection,
  ItinerarySnapshot,
  ItineraryStore,
  ItinerarySeedInput,
} from "@/lib/itinerary-model";
import { logItineraryDiagnostic } from "@/lib/itinerary-debug";
import { parseRequestWithLLM } from "@/lib/request-parser";
import type { ParsedRequest } from "@/lib/request-types";

const STORE_PATH = path.join(process.cwd(), "data", "conci-store.json");

function now() {
  return new Date().toISOString();
}

function createEmptyStore(): ItineraryStore {
  return {
    active_itinerary_id: null,
    itineraries: {},
  };
}

function ensureDirectoryExists() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

function readStoreFile(): ItineraryStore | null {
  if (!fs.existsSync(STORE_PATH)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as ItineraryStore;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.active_itinerary_id !== "string" && parsed.active_itinerary_id !== null ||
      !parsed.itineraries ||
      typeof parsed.itineraries !== "object"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStoreFile(store: ItineraryStore) {
  ensureDirectoryExists();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function normalizeBudget(value: string | null | undefined, fallback: ItineraryBudget = "mid-range"): ItineraryBudget {
  const lower = value?.toLowerCase() ?? "";

  if (lower.includes("premium") || lower.includes("luxury") || lower.includes("high-end")) {
    return "premium";
  }

  if (lower.includes("budget") || lower.includes("cheap") || lower.includes("affordable") || lower.includes("value")) {
    return "budget-friendly";
  }

  if (lower.includes("mid")) {
    return "mid-range";
  }

  return fallback;
}

function itineraryDateLabel(itinerary: Pick<Itinerary, "start_date" | "end_date">) {
  if (itinerary.start_date && itinerary.end_date) {
    return `${itinerary.start_date} - ${itinerary.end_date}`;
  }

  return itinerary.start_date || itinerary.end_date || null;
}

function categoryKind(category: ParsedRequest["category"]): ItineraryItemKind {
  if (category === "flights") return "flight";
  if (category === "restaurants") return "restaurant";
  return "activity";
}

function snapshot(item: ItineraryItem): ItinerarySnapshot {
  return {
    id: item.id,
    slot_key: item.slot_key,
    kind: item.kind,
    provider_id: item.provider_id,
    title: item.title,
    details: item.details,
    meta: item.meta,
    price: item.price,
    tone: item.tone,
    position: item.position,
    status: item.status,
  };
}

function dedupeSelections(selections: ItinerarySelection[]) {
  const seen = new Set<string>();

  return selections
    .filter((selection) => {
      const key = `${selection.status}:${selection.itinerary_item_id || "all"}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function createSelection(itinerary: Itinerary, action: ItineraryActionRequest): ItinerarySelection {
  return {
    id: crypto.randomUUID(),
    request_id: itinerary.id,
    itinerary_item_id: "item_id" in action ? action.item_id : null,
    status: action.type,
    created_at: now(),
  };
}

function routeLabel(parsed: ParsedRequest) {
  if (parsed.origin && parsed.destination) {
    return `${parsed.origin} -> ${parsed.destination}`;
  }

  return parsed.destination || parsed.location || "Flexible route";
}

function scoreFlightIndex(parsed: ParsedRequest, index: number) {
  const budget = normalizeBudget(parsed.budget);
  const baseScores = budget === "premium" ? [3, 1, 2] : budget === "budget-friendly" ? [2, 3, 1] : [1, 2, 3];
  return baseScores[index % baseScores.length];
}

function scoreRestaurantIndex(parsed: ParsedRequest, index: number) {
  const budget = normalizeBudget(parsed.budget);
  const cuisine = (parsed.cuisine || "").toLowerCase();
  const location = (parsed.location || "").toLowerCase();

  const restaurant = restaurants[index % restaurants.length];
  const matchesCuisine = restaurant.cuisine.toLowerCase().includes(cuisine) ? 3 : 0;
  const matchesLocation = restaurant.neighborhood.toLowerCase().includes(location) ? 2 : 0;
  const budgetScore = budget === "premium" ? 3 : budget === "budget-friendly" ? 1 : 2;

  return matchesCuisine + matchesLocation + budgetScore;
}

function scoreActivityIndex(parsed: ParsedRequest, index: number) {
  const time = (parsed.time || "").toLowerCase();
  const vibe = (parsed.vibe || "").toLowerCase();
  const nightBoost = time.includes("night") || vibe.includes("night") ? 3 : 0;
  const funBoost = vibe.includes("fun") || vibe.includes("energetic") ? 2 : 0;
  const locationBoost = parsed.location ? 1 : 0;

  return nightBoost + funBoost + locationBoost + index;
}

function buildFlightSelection(parsed: ParsedRequest, slotIndex: number, position: number): ItineraryItem {
  const sorted = [...flights].sort(
    (left, right) => scoreFlightIndex(parsed, flights.indexOf(left)) - scoreFlightIndex(parsed, flights.indexOf(right))
  );
  const flight = sorted[slotIndex % sorted.length];

  return {
    id: crypto.randomUUID(),
    slot_key: `flight-${slotIndex + 1}`,
    kind: "flight",
    provider_id: flight.id,
    title: flight.airline,
    details: routeLabel(parsed),
    meta: [parsed.date_range || parsed.date || flight.depart, parsed.time, normalizeBudget(parsed.budget)]
      .filter(Boolean)
      .join(" · "),
    price: flight.price,
    tone:
      position === 0
        ? "from-sky-50 via-white to-white"
        : position === 1
          ? "from-amber-50 via-white to-white"
          : "from-emerald-50 via-white to-white",
    position,
    status: "active",
  };
}

function buildRestaurantSelection(parsed: ParsedRequest, slotIndex: number, position: number): ItineraryItem {
  const sorted = [...restaurants].sort(
    (left, right) => scoreRestaurantIndex(parsed, restaurants.indexOf(right)) - scoreRestaurantIndex(parsed, restaurants.indexOf(left))
  );
  const restaurant = sorted[slotIndex % sorted.length];

  return {
    id: crypto.randomUUID(),
    slot_key: `restaurant-${slotIndex + 1}`,
    kind: "restaurant",
    provider_id: restaurant.id,
    title: restaurant.name,
    details: [parsed.cuisine || restaurant.cuisine, parsed.location || restaurant.neighborhood].filter(Boolean).join(" · "),
    meta: [
      parsed.party_size ? `Party of ${parsed.party_size}` : null,
      parsed.date_range || parsed.date || null,
      parsed.time || null,
      parsed.vibe ? `${parsed.vibe} vibe` : restaurant.summary,
    ]
      .filter(Boolean)
      .join(" · "),
    price: restaurant.price,
    tone:
      position === 0
        ? "from-amber-50 via-white to-white"
        : position === 1
          ? "from-rose-50 via-white to-white"
          : "from-orange-50 via-white to-white",
    position,
    status: "active",
  };
}

function buildActivitySelection(parsed: ParsedRequest, slotIndex: number, position: number): ItineraryItem {
  const sorted = [...activities].sort(
    (left, right) => scoreActivityIndex(parsed, activities.indexOf(right)) - scoreActivityIndex(parsed, activities.indexOf(left))
  );
  const activity = sorted[slotIndex % sorted.length];

  return {
    id: crypto.randomUUID(),
    slot_key: `activity-${slotIndex + 1}`,
    kind: "activity",
    provider_id: activity.id,
    title: activity.name,
    details: [parsed.location || activity.location, parsed.vibe || activity.type].filter(Boolean).join(" · "),
    meta: [
      parsed.date_range || parsed.date || null,
      parsed.time || activity.time,
      parsed.party_size ? `Party of ${parsed.party_size}` : null,
      activity.summary,
    ]
      .filter(Boolean)
      .join(" · "),
    price: activity.time,
    tone:
      position === 0
        ? "from-emerald-50 via-white to-white"
        : position === 1
          ? "from-cyan-50 via-white to-white"
          : "from-lime-50 via-white to-white",
    position,
    status: "active",
  };
}

function defaultItemCount(parsed: ParsedRequest) {
  return parsed.flow_mode === "single_step" ? 1 : parsed.category === "travel" ? 3 : 1;
}

function buildItemsFromParsed(parsed: ParsedRequest, count: number) {
  const items: ItineraryItem[] = [];

  if (parsed.category === "travel") {
    const builders = [buildFlightSelection, buildRestaurantSelection, buildActivitySelection];
    const targetCount = Math.min(Math.max(count, 1), builders.length);

    for (let index = 0; index < targetCount; index += 1) {
      items.push(builders[index](parsed, 0, index));
    }

    return items;
  }

  const kind = categoryKind(parsed.category);
  for (let index = 0; index < Math.max(count, 1); index += 1) {
    if (kind === "flight") {
      items.push(buildFlightSelection(parsed, index, index));
    } else if (kind === "restaurant") {
      items.push(buildRestaurantSelection(parsed, index, index));
    } else {
      items.push(buildActivitySelection(parsed, index, index));
    }
  }

  return items;
}

function buildItineraryFromParsed(parsed: ParsedRequest, prompt: string, existing?: Itinerary): Itinerary {
  const nextItems = buildItemsFromParsed(parsed, existing ? existing.itinerary_items.filter((item) => item.status === "active").length || 1 : defaultItemCount(parsed));
  const existingBySlot = new Map(existing?.itinerary_items.map((item) => [item.slot_key, item]) || []);

  const itineraryItems = nextItems.map((item, position) => {
    const existingItem = existingBySlot.get(item.slot_key);
    if (!existingItem) {
      return item;
    }

    return {
      ...item,
      id: existingItem.id,
      title: existingItem.title,
      details: existingItem.details,
      meta: existingItem.meta,
      price: existingItem.price,
      tone: existingItem.tone,
      position,
      status: existingItem.status,
    };
  });

  return {
    id: existing?.id || crypto.randomUUID(),
    prompt,
    category: parsed.category,
    budget: normalizeBudget(existing?.budget || parsed.budget),
    guest_count: existing?.guest_count || parsed.party_size || 1,
    location: existing?.location || parsed.location || parsed.destination || null,
    start_date: existing?.start_date || parsed.date || parsed.date_range || null,
    end_date: existing?.end_date || parsed.date_range || null,
    time_hint: existing?.time_hint || parsed.time || null,
    itinerary_items: itineraryItems,
    removed_items: existing?.removed_items || [],
    selections: existing ? dedupeSelections(existing.selections) : [],
    parsed_request: parsed,
    created_at: existing?.created_at || now(),
  };
}

async function seedStoreIfNeeded(store: ItineraryStore): Promise<ItineraryStore> {
  if (hasSupabaseItineraryPersistence()) {
    const seeded = await seedSupabaseItineraryIfNeeded(async () => {
      const parsed = await parseRequestWithLLM(examplePrompt);
      return buildItineraryFromParsed(parsed, examplePrompt);
    });

    return {
      active_itinerary_id: seeded.id,
      itineraries: { [seeded.id]: seeded },
    };
  }

  if (store.active_itinerary_id && store.itineraries[store.active_itinerary_id]) {
    return store;
  }

  const parsed = await parseRequestWithLLM(examplePrompt);
  const itinerary = buildItineraryFromParsed(parsed, examplePrompt);
  return {
    active_itinerary_id: itinerary.id,
    itineraries: { [itinerary.id]: itinerary },
  };
}

async function loadStore() {
  if (hasSupabaseItineraryPersistence()) {
    const { itinerary, error } = await safeLoadCurrentItineraryFromSupabase();
    if (error) {
      logItineraryDiagnostic("store.load_store.supabase_error", error);
    }
    if (!itinerary) {
      return createEmptyStore();
    }

    return {
      active_itinerary_id: itinerary.id,
      itineraries: { [itinerary.id]: itinerary },
    };
  }

  const loaded = readStoreFile() || createEmptyStore();
  const seeded = await seedStoreIfNeeded(loaded);
  if (seeded !== loaded) {
    writeStoreFile(seeded);
  }
  return seeded;
}

async function saveStore(store: ItineraryStore) {
  if (hasSupabaseItineraryPersistence()) {
    const activeId = store.active_itinerary_id;
    if (!activeId) {
      return store;
    }

    const itinerary = store.itineraries[activeId];
    if (itinerary) {
      await persistItineraryToSupabase(itinerary);
    }

    return store;
  }

  writeStoreFile(store);
  return store;
}

export async function getStore() {
  return loadStore();
}

export async function getActiveItinerary() {
  logItineraryDiagnostic("store.get_active_itinerary.begin", {
    persistence: hasSupabaseItineraryPersistence() ? "supabase" : "local",
  });
  if (hasSupabaseItineraryPersistence()) {
    const { itinerary: current, error } = await safeLoadCurrentItineraryFromSupabase();
    logItineraryDiagnostic("store.get_active_itinerary.supabase_result", {
      hasItinerary: Boolean(current),
      itineraryId: current?.id || null,
      errorMessage: error?.message || null,
      errorCode: error?.code || null,
      errorOperation: error?.operation || null,
    });
    if (current) {
      return current;
    }

    if (error) {
      return null;
    }

    try {
      const parsed = await parseRequestWithLLM(examplePrompt);
      const seeded = buildItineraryFromParsed(parsed, examplePrompt);
      await persistItineraryToSupabase(seeded);
      logItineraryDiagnostic("store.get_active_itinerary.seeded_default", {
        itineraryId: seeded.id,
      });
      return seeded;
    } catch (error) {
      logItineraryDiagnostic("store.get_active_itinerary.seed_error", {
        message: error instanceof Error ? error.message : "Unknown seed error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  try {
    const store = await loadStore();
    const itinerary = store.active_itinerary_id ? store.itineraries[store.active_itinerary_id] || null : null;
    logItineraryDiagnostic("store.get_active_itinerary.local_result", {
      hasItinerary: Boolean(itinerary),
      itineraryId: itinerary?.id || null,
    });
    return itinerary;
  } catch (error) {
    logItineraryDiagnostic("store.get_active_itinerary.local_error", {
      message: error instanceof Error ? error.message : "Unknown local store error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

export async function initializeItinerary(input: ItinerarySeedInput) {
  logItineraryDiagnostic("store.initialize_itinerary", {
    promptPreview: input.prompt,
    parsedCategory: input.parsed.category,
    parsedFlowMode: input.parsed.flow_mode,
  });
  const itinerary = buildItineraryFromParsed(input.parsed, input.prompt);

  if (hasSupabaseItineraryPersistence()) {
    await persistItineraryToSupabase(itinerary);
    return itinerary;
  }

  const store = await loadStore();
  const nextStore: ItineraryStore = {
    active_itinerary_id: itinerary.id,
    itineraries: {
      ...store.itineraries,
      [itinerary.id]: itinerary,
    },
  };

  await saveStore(nextStore);
  return itinerary;
}

function activeItems(itinerary: Itinerary) {
  return itinerary.itinerary_items.filter((item) => item.status === "active").sort((left, right) => left.position - right.position);
}

function replacedAlternative(itinerary: Itinerary, item: ItineraryItem, replacementProviderId?: string) {
  return getAlternativesForItem(itinerary, item).find((alternative) => alternative.provider_id === replacementProviderId) || getAlternativesForItem(itinerary, item)[0] || item;
}

function replaceItemWithAlternative(itinerary: Itinerary, itemId: string, replacementProviderId?: string) {
  const currentItem = itinerary.itinerary_items.find((item) => item.id === itemId && item.status === "active");
  if (!currentItem) {
    return itinerary;
  }

  const replacement = replacedAlternative(itinerary, currentItem, replacementProviderId);
  const nextItem: ItineraryItem = {
    ...replacement,
    id: currentItem.id,
    slot_key: currentItem.slot_key,
    position: currentItem.position,
    status: "active",
  };

  return {
    ...itinerary,
    itinerary_items: itinerary.itinerary_items.map((item) => (item.id === itemId ? nextItem : item)),
    selections: [...itinerary.selections, createSelection(itinerary, { type: "replace_item", item_id: itemId })],
  };
}

function removeItem(itinerary: Itinerary, itemId: string) {
  const currentItem = itinerary.itinerary_items.find((item) => item.id === itemId && item.status === "active");
  if (!currentItem) {
    return itinerary;
  }

  return {
    ...itinerary,
    itinerary_items: itinerary.itinerary_items.map((item) =>
      item.id === itemId ? { ...item, status: "removed" as const } : item
    ),
    removed_items: [...itinerary.removed_items, snapshot(currentItem)],
    selections: [...itinerary.selections, createSelection(itinerary, { type: "remove_item", item_id: itemId })],
  };
}

function moveItem(itinerary: Itinerary, itemId: string, direction: -1 | 1) {
  const items = activeItems(itinerary);
  const index = items.findIndex((item) => item.id === itemId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= items.length) {
    return itinerary;
  }

  const nextItems = [...items];
  [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];

  const positions = new Map(nextItems.map((item, position) => [item.id, position]));

  return {
    ...itinerary,
    itinerary_items: itinerary.itinerary_items.map((item) =>
      positions.has(item.id) ? { ...item, position: positions.get(item.id) as number } : item
    ),
    selections: [...itinerary.selections, createSelection(itinerary, { type: "move_item", item_id: itemId, direction })],
  };
}

function editItem(
  itinerary: Itinerary,
  itemId: string,
  patch: Partial<Pick<ItineraryItem, "title" | "details" | "meta" | "price" | "tone">>
) {
  if (!itinerary.itinerary_items.some((item) => item.id === itemId)) {
    return itinerary;
  }

  return {
    ...itinerary,
    itinerary_items: itinerary.itinerary_items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    selections: [...itinerary.selections, createSelection(itinerary, { type: "edit_item", item_id: itemId, patch })],
  };
}

function adjustBudget(itinerary: Itinerary, budget?: ItineraryBudget) {
  const nextBudget =
    budget ||
    (itinerary.budget === "budget-friendly"
      ? "mid-range"
      : itinerary.budget === "mid-range"
        ? "premium"
        : "budget-friendly");

  const parsed: ParsedRequest = {
    ...itinerary.parsed_request,
    budget: nextBudget,
    party_size: itinerary.guest_count,
    location: itinerary.location,
    date: itinerary.start_date,
    date_range: itinerary.end_date ? itineraryDateLabel(itinerary) : itinerary.start_date,
    time: itinerary.time_hint,
  };

  const next = buildItineraryFromParsed(parsed, itinerary.prompt, { ...itinerary, budget: nextBudget });
  return {
    ...next,
    selections: [...itinerary.selections, createSelection(itinerary, { type: "adjust_budget", budget: nextBudget })],
  };
}

function changeGuestCount(itinerary: Itinerary, guestCount: number) {
  const parsed: ParsedRequest = {
    ...itinerary.parsed_request,
    party_size: guestCount,
    location: itinerary.location,
    date: itinerary.start_date,
    date_range: itinerary.end_date ? itineraryDateLabel(itinerary) : itinerary.start_date,
    time: itinerary.time_hint,
  };

  const next = buildItineraryFromParsed(parsed, itinerary.prompt, { ...itinerary, guest_count: guestCount });
  return {
    ...next,
    selections: [...itinerary.selections, createSelection(itinerary, { type: "change_guest_count", guest_count: guestCount })],
  };
}

function shortenItinerary(itinerary: Itinerary) {
  const items = activeItems(itinerary);
  if (items.length <= 1) {
    return itinerary;
  }

  return removeItem(itinerary, items[items.length - 1].id);
}

function regenerateItinerary(itinerary: Itinerary) {
  const parsed: ParsedRequest = {
    ...itinerary.parsed_request,
    budget: itinerary.budget,
    party_size: itinerary.guest_count,
    location: itinerary.location,
    date: itinerary.start_date,
    date_range: itinerary.end_date ? itineraryDateLabel(itinerary) : itinerary.start_date,
    time: itinerary.time_hint,
  };

  const next = buildItineraryFromParsed(parsed, itinerary.prompt, itinerary);
  return {
    ...next,
    selections: [...itinerary.selections, createSelection(itinerary, { type: "regenerate_all" })],
  };
}

export function getAlternativesForItem(itinerary: Itinerary, item: ItineraryItem) {
  if (item.kind === "flight") {
    return flights
      .filter((flight) => flight.id !== item.provider_id)
      .slice(0, 3)
      .map((flight, index) => ({
        id: crypto.randomUUID(),
        slot_key: `${item.slot_key}-alt-${index + 1}`,
        kind: "flight" as const,
        provider_id: flight.id,
        title: flight.airline,
        details: routeLabel(itinerary.parsed_request),
        meta: [itineraryDateLabel(itinerary) || flight.depart, itinerary.time_hint || flight.arrive].filter(Boolean).join(" · "),
        price: flight.price,
        tone: index === 0 ? "from-sky-50 via-white to-white" : index === 1 ? "from-amber-50 via-white to-white" : "from-emerald-50 via-white to-white",
        position: index,
        status: "active" as const,
      }));
  }

  if (item.kind === "restaurant") {
    return restaurants
      .filter((restaurant) => restaurant.id !== item.provider_id)
      .slice(0, 3)
      .map((restaurant, index) => ({
        id: crypto.randomUUID(),
        slot_key: `${item.slot_key}-alt-${index + 1}`,
        kind: "restaurant" as const,
        provider_id: restaurant.id,
        title: restaurant.name,
        details: [itinerary.parsed_request.cuisine || restaurant.cuisine, itinerary.location || restaurant.neighborhood].filter(Boolean).join(" · "),
        meta: [`Party of ${itinerary.guest_count}`, itineraryDateLabel(itinerary), itinerary.time_hint, restaurant.summary].filter(Boolean).join(" · "),
        price: restaurant.price,
        tone: index === 0 ? "from-amber-50 via-white to-white" : index === 1 ? "from-rose-50 via-white to-white" : "from-orange-50 via-white to-white",
        position: index,
        status: "active" as const,
      }));
  }

  return activities
    .filter((activity) => activity.id !== item.provider_id)
    .slice(0, 3)
    .map((activity, index) => ({
      id: crypto.randomUUID(),
      slot_key: `${item.slot_key}-alt-${index + 1}`,
      kind: "activity" as const,
      provider_id: activity.id,
      title: activity.name,
      details: [itinerary.location || activity.location, itinerary.parsed_request.vibe || activity.type].filter(Boolean).join(" · "),
      meta: [itineraryDateLabel(itinerary), itinerary.time_hint || activity.time, `Party of ${itinerary.guest_count}`, activity.summary].filter(Boolean).join(" · "),
      price: activity.time,
      tone: index === 0 ? "from-emerald-50 via-white to-white" : index === 1 ? "from-cyan-50 via-white to-white" : "from-lime-50 via-white to-white",
      position: index,
      status: "active" as const,
    }));
}

export async function applyItineraryAction(action: ItineraryActionRequest) {
  logItineraryDiagnostic("store.apply_action", {
    actionType: action.type,
    itemId: "item_id" in action ? action.item_id : null,
  });

  if (hasSupabaseItineraryPersistence()) {
    const current = await loadCurrentItineraryFromSupabase();
    if (!current) {
      return null;
    }

    const beforeSelections = current.selections.length;
    let next: Itinerary = current;

    switch (action.type) {
      case "regenerate_all":
        logItineraryDiagnostic("store.mutation_branch", { actionType: action.type });
        next = regenerateItinerary(current);
        break;
      case "make_itinerary_shorter":
        logItineraryDiagnostic("store.mutation_branch", { actionType: action.type });
        next = shortenItinerary(current);
        break;
      case "adjust_budget":
        logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, budget: action.budget || null });
        next = adjustBudget(current, action.budget);
        break;
      case "remove_item":
        logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, itemId: action.item_id });
        next = removeItem(current, action.item_id);
        break;
      case "replace_item":
        logItineraryDiagnostic("store.mutation_branch", {
          actionType: action.type,
          itemId: action.item_id,
          replacementProviderId: action.replacement_provider_id || null,
        });
        next = replaceItemWithAlternative(current, action.item_id, action.replacement_provider_id);
        break;
      case "move_item":
        logItineraryDiagnostic("store.mutation_branch", {
          actionType: action.type,
          itemId: action.item_id,
          direction: action.direction,
        });
        next = moveItem(current, action.item_id, action.direction);
        break;
      case "edit_item":
        logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, itemId: action.item_id, patch: action.patch });
        next = editItem(current, action.item_id, action.patch);
        break;
      case "change_guest_count":
        logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, guestCount: action.guest_count });
        next = changeGuestCount(current, action.guest_count);
        break;
    }

    await persistItineraryToSupabase(next, beforeSelections);
    return next;
  }

  const store = await loadStore();
  const activeId = store.active_itinerary_id;
  if (!activeId) {
    return null;
  }

  const current = store.itineraries[activeId];
  if (!current) {
    return null;
  }

  let next: Itinerary = current;
  switch (action.type) {
    case "regenerate_all":
      logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, persistence: "local" });
      next = regenerateItinerary(current);
      break;
    case "make_itinerary_shorter":
      logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, persistence: "local" });
      next = shortenItinerary(current);
      break;
    case "adjust_budget":
      logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, persistence: "local", budget: action.budget || null });
      next = adjustBudget(current, action.budget);
      break;
    case "remove_item":
      logItineraryDiagnostic("store.mutation_branch", { actionType: action.type, persistence: "local", itemId: action.item_id });
      next = removeItem(current, action.item_id);
      break;
    case "replace_item":
      logItineraryDiagnostic("store.mutation_branch", {
        actionType: action.type,
        persistence: "local",
        itemId: action.item_id,
        replacementProviderId: action.replacement_provider_id || null,
      });
      next = replaceItemWithAlternative(current, action.item_id, action.replacement_provider_id);
      break;
    case "move_item":
      logItineraryDiagnostic("store.mutation_branch", {
        actionType: action.type,
        persistence: "local",
        itemId: action.item_id,
        direction: action.direction,
      });
      next = moveItem(current, action.item_id, action.direction);
      break;
    case "edit_item":
      logItineraryDiagnostic("store.mutation_branch", {
        actionType: action.type,
        persistence: "local",
        itemId: action.item_id,
        patch: action.patch,
      });
      next = editItem(current, action.item_id, action.patch);
      break;
    case "change_guest_count":
      logItineraryDiagnostic("store.mutation_branch", {
        actionType: action.type,
        persistence: "local",
        guestCount: action.guest_count,
      });
      next = changeGuestCount(current, action.guest_count);
      break;
  }

  const updatedStore: ItineraryStore = {
    active_itinerary_id: activeId,
    itineraries: {
      ...store.itineraries,
      [activeId]: next,
    },
  };

  await saveStore(updatedStore);
  return next;
}

export function buildItinerarySections(itinerary: Itinerary): ItinerarySection[] {
  return activeItems(itinerary).map((item, index) => ({
    key: item.id,
    label: item.kind === "flight" ? "Flights" : item.kind === "restaurant" ? "Restaurants" : "Things to do",
    title: item.title,
    description: item.details,
    selectedItem: item,
    alternatives: getAlternativesForItem(itinerary, item),
    index,
  }));
}

export function buildItineraryHeadline(itinerary: Itinerary) {
  const dateLabel = itineraryDateLabel(itinerary);

  if (itinerary.category === "flights") {
    if (itinerary.parsed_request.origin && itinerary.parsed_request.destination) {
      return `Flights from ${itinerary.parsed_request.origin} to ${itinerary.parsed_request.destination}`;
    }
    return itinerary.parsed_request.destination ? `Flights to ${itinerary.parsed_request.destination}` : "Flight options tailored to your request";
  }

  if (itinerary.category === "restaurants") {
    if (itinerary.parsed_request.cuisine && itinerary.location && itinerary.guest_count) {
      return `${itinerary.parsed_request.cuisine} for ${itinerary.guest_count} in ${itinerary.location}`;
    }
    return itinerary.location ? `Dining options in ${itinerary.location}` : "Dining options tailored to your request";
  }

  if (itinerary.category === "things_to_do") {
    if (itinerary.time_hint && itinerary.location) {
      return `Things to do in ${itinerary.location} ${itinerary.time_hint}`;
    }
    if (itinerary.time_hint) {
      return `Things to do ${itinerary.time_hint}`;
    }
    if (dateLabel && itinerary.location) {
      return `Things to do in ${itinerary.location} on ${dateLabel}`;
    }
    return itinerary.location ? `Things to do in ${itinerary.location}` : "Activity options tailored to your request";
  }

  if (itinerary.parsed_request.destination && dateLabel) {
    return `Weekend trip to ${itinerary.parsed_request.destination} from ${dateLabel}`;
  }

  return itinerary.parsed_request.destination ? `Weekend trip to ${itinerary.parsed_request.destination}` : "Trip planning results";
}

export function buildItinerarySummary(itinerary: Itinerary) {
  return Array.from(
    new Set(
      [
        itinerary.parsed_request.destination,
        itinerary.parsed_request.origin,
        itinerary.location,
        itineraryDateLabel(itinerary),
        itinerary.time_hint,
        itinerary.budget,
        itinerary.guest_count ? `${itinerary.guest_count} people` : null,
        itinerary.parsed_request.cuisine,
        itinerary.parsed_request.vibe,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

export function buildItineraryScreenData(itinerary: Itinerary): ItineraryScreenData {
  return {
    itinerary,
    sections: buildItinerarySections(itinerary),
    title: buildItineraryHeadline(itinerary),
    summaryChips: buildItinerarySummary(itinerary),
  };
}

export function getRecommendationById(id: string) {
  const flight = flights.find((item) => item.id === id);
  if (flight) {
    return {
      title: flight.airline,
      category: "Flight" as const,
      summary: "Best balance of timing and price for a morning arrival before meetings.",
      details: flight,
    };
  }

  const restaurant = restaurants.find((item) => item.id === id);
  if (restaurant) {
    return {
      title: restaurant.name,
      category: "Restaurant" as const,
      summary: "A polished dinner choice with quiet tables and reliable pacing.",
      details: restaurant,
    };
  }

  const activity = activities.find((item) => item.id === id);
  if (activity) {
    return {
      title: activity.name,
      category: "Activity" as const,
      summary: "A low-lift option that still feels memorable.",
      details: activity,
    };
  }

  return null;
}
