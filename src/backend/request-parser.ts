import "server-only";

import type { ParsedRequest } from "@/shared/request-types";

const model = process.env.OPENAI_MODEL || "gpt-4.1";

const requestParseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["flights", "restaurants", "things_to_do", "travel"],
    },
    flow_mode: {
      type: "string",
      enum: ["single_step", "multi_step"],
    },
    uncertain: { type: "boolean" },
    fallback_reason: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    summary: { type: "string" },
    location: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    destination: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    origin: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    date: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    date_range: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    time: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    budget: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    party_size: {
      anyOf: [{ type: "integer" }, { type: "null" }],
    },
    cuisine: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    vibe: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "category",
    "flow_mode",
    "uncertain",
    "fallback_reason",
    "summary",
    "location",
    "destination",
    "origin",
    "date",
    "date_range",
    "time",
    "budget",
    "party_size",
    "cuisine",
    "vibe",
    "keywords",
  ],
} as const;

const parserInstructions = [
  "You are parsing a user request for a consumer travel assistant.",
  "Classify the request into exactly one category: flights, restaurants, things_to_do, or travel.",
  "Also classify the request flow as single_step for one-off recommendations or multi_step for true multi-part itineraries.",
  "Use travel for broad, multi-part, or ambiguous requests that span more than one category.",
  "If the request is uncertain, broad, or ambiguous, set uncertain=true and explain why in fallback_reason.",
  "Extract structured fields only when they are present or strongly implied; otherwise use null.",
  "Use date_range when the request clearly includes a span of time; use date for a single day or relative date.",
  "Normalize party_size to an integer when it is present.",
  "Capture cuisine, neighborhood, budget, time, party size, dates, and vibe when they are mentioned or strongly implied.",
  "Return keywords as a short array of the most useful request terms.",
  "Examples:",
  "- 'Something fun to do Saturday night' => category things_to_do, date 'Saturday night', vibe 'fun'.",
  "- 'Sushi for 2 tomorrow in West Loop' => category restaurants, cuisine 'sushi', party_size 2, date 'tomorrow', location 'West Loop'.",
  "- 'Weekend trip to NYC from Friday to Sunday' => category travel, destination 'NYC', date_range 'Friday to Sunday'.",
].join(" ");

const budgets = [
  { pattern: /(?:budget|cheap|affordable|value|under \$?\d+)/i, value: "budget-friendly" },
  { pattern: /(?:mid-range|midrange|moderate|around \$?\d+)/i, value: "mid-range" },
  { pattern: /(?:premium|luxury|upscale|high-end|splurge)/i, value: "premium" },
];

const flightTerms = [
  "flight",
  "fly",
  "flying",
  "airline",
  "airport",
  "depart",
  "departure",
  "arrival",
  "layover",
  "plane",
  "ticket",
];

const restaurantTerms = [
  "restaurant",
  "dinner",
  "lunch",
  "brunch",
  "cafe",
  "coffee",
  "eat",
  "dining",
  "reservation",
  "meal",
  "sushi",
  "pizza",
  "steak",
  "ramen",
  "tacos",
  "bbq",
];

const activityTerms = [
  "thing to do",
  "things to do",
  "activity",
  "activities",
  "tour",
  "museum",
  "show",
  "experience",
  "walk",
  "sightseeing",
  "event",
  "fun",
  "night",
  "Saturday night",
];

const vibeTerms = [
  "fun",
  "romantic",
  "quiet",
  "lively",
  "casual",
  "upscale",
  "premium",
  "cozy",
  "family friendly",
  "family-friendly",
  "date night",
  "business",
  "energetic",
];

const neighborhoodTerms = [
  "west loop",
  "soho",
  "soma",
  "downtown",
  "midtown",
  "fidi",
  "financial district",
  "mission",
  "bucktown",
  "lincoln park",
  "lakeview",
  "chelsea",
  "upper east side",
  "upper west side",
  "brooklyn",
  "manhattan",
];

function fallbackParsedRequest(request: string, reason: string): ParsedRequest {
  const flowMode = "multi_step";
  return {
    category: "travel",
    flow_mode: flowMode,
    uncertain: true,
    fallback_reason: reason,
    summary: reason,
    location: null,
    destination: null,
    origin: null,
    date: null,
    date_range: null,
    time: null,
    budget: null,
    party_size: null,
    cuisine: null,
    vibe: null,
    keywords: request.trim() ? request.toLowerCase().split(/\s+/).slice(0, 6) : [],
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function findFirstMatch(request: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match?.[0]) {
      return normalizeWhitespace(match[0]);
    }
  }

  return null;
}

function findNeighborhood(request: string) {
  const lower = request.toLowerCase();
  return (
    neighborhoodTerms.find((term) => lower.includes(term))?.replace(/\b\w/g, (char) =>
      char.toUpperCase()
    ) || null
  );
}

function findPartySize(request: string) {
  const partyPatterns = [
    /for\s+(\d+)\s*(?:people|guests|person|persons)?/i,
    /party\s+of\s+(\d+)/i,
    /(\d+)\s*(?:people|guests|person|persons)/i,
  ];

  for (const pattern of partyPatterns) {
    const match = request.match(pattern);
    if (match?.[1]) {
      const number = Number(match[1]);
      if (Number.isFinite(number)) {
        return number;
      }
    }
  }

  return null;
}

function findDateRange(request: string) {
  const rangeMatch = request.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?:[,.]|$)/i
  );

  if (rangeMatch?.[1] && rangeMatch?.[2]) {
    return `${normalizeWhitespace(rangeMatch[1])} to ${normalizeWhitespace(rangeMatch[2])}`;
  }

  const lower = request.toLowerCase();
  if (lower.includes("weekend")) {
    return "weekend";
  }

  return null;
}

function findDate(request: string) {
  const datePatterns = [
    /\btomorrow\b/i,
    /\btoday\b/i,
    /\btonight\b/i,
    /\bsaturday night\b/i,
    /\bsunday night\b/i,
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  ];

  return findFirstMatch(request, datePatterns);
}

function findTime(request: string) {
  const timePatterns = [
    /\b\d{1,2}(:\d{2})?\s?(?:am|pm)\b/i,
    /\bmorning\b/i,
    /\bafternoon\b/i,
    /\bevening\b/i,
    /\blate night\b/i,
    /\bnight\b/i,
    /\bsaturday night\b/i,
    /\bsunday night\b/i,
  ];

  return findFirstMatch(request, timePatterns);
}

function findBudget(request: string) {
  for (const { pattern, value } of budgets) {
    if (pattern.test(request)) {
      return value;
    }
  }

  const explicit = request.match(/\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/);
  return explicit?.[0] ? explicit[0] : null;
}

function findCuisine(request: string) {
  const cuisinePatterns = [
    /sushi/i,
    /italian/i,
    /japanese/i,
    /mexican/i,
    /thai/i,
    /indian/i,
    /mediterranean/i,
    /steak/i,
    /ramen/i,
    /pizza/i,
    /tacos/i,
    /bbq/i,
    /seafood/i,
  ];

  return findFirstMatch(request, cuisinePatterns);
}

function findVibe(request: string) {
  const lower = request.toLowerCase();
  return vibeTerms.find((term) => lower.includes(term)) || null;
}

function detectCategory(request: string) {
  const lower = request.toLowerCase();
  const hasFlight = flightTerms.some((term) => lower.includes(term));
  const hasRestaurant = restaurantTerms.some((term) => lower.includes(term));
  const hasActivity = activityTerms.some((term) => lower.includes(term));

  if (lower.includes("weekend trip") || /\btrip\b/i.test(request)) {
    return "travel" as const;
  }

  if (hasFlight && !hasRestaurant && !hasActivity) return "flights" as const;
  if (hasRestaurant && !hasFlight && !hasActivity) return "restaurants" as const;
  if (hasActivity && !hasFlight && !hasRestaurant) return "things_to_do" as const;

  if ((hasFlight && hasRestaurant) || (hasFlight && hasActivity) || (hasRestaurant && hasActivity)) {
    return "travel" as const;
  }
  if (/\bto do\b/i.test(request) || request.toLowerCase().includes("fun")) return "things_to_do" as const;
  if (findCuisine(request) || findPartySize(request)) return "restaurants" as const;

  return "travel" as const;
}

function buildSummary(category: ParsedRequest["category"], parsed: Partial<ParsedRequest>) {
  const parts: string[] = [];

  if (category === "flights") {
    parts.push("Flight request");
    if (parsed.origin && parsed.destination) {
      parts.push(`from ${parsed.origin} to ${parsed.destination}`);
    } else if (parsed.destination) {
      parts.push(`to ${parsed.destination}`);
    }
  } else if (category === "restaurants") {
    parts.push("Dining request");
    if (parsed.cuisine) parts.push(parsed.cuisine);
    if (parsed.party_size) parts.push(`for ${parsed.party_size}`);
    if (parsed.location) parts.push(`in ${parsed.location}`);
    if (parsed.time) parts.push(`at ${parsed.time}`);
  } else if (category === "things_to_do") {
    parts.push("Things to do request");
    if (parsed.location) parts.push(`in ${parsed.location}`);
    if (parsed.date) parts.push(`on ${parsed.date}`);
    if (parsed.time) parts.push(`at ${parsed.time}`);
  } else {
    parts.push("Trip request");
    if (parsed.destination) parts.push(`to ${parsed.destination}`);
    if (parsed.date_range) parts.push(`from ${parsed.date_range}`);
    if (parsed.time) parts.push(`at ${parsed.time}`);
  }

  if (parsed.vibe) {
    parts.push(`${parsed.vibe} vibe`);
  }

  return normalizeWhitespace(parts.join(" "));
}

function logParser(mode: "mock mode" | "OpenAI mode", parsed: ParsedRequest) {
  if (process.env.DEBUG_CONCI_PARSER !== "1") return;
  console.log(
    `Conci parser: ${mode}`,
    JSON.stringify(
      {
        category: parsed.category,
        flow_mode: parsed.flow_mode,
        uncertain: parsed.uncertain,
        fallback_reason: parsed.fallback_reason,
        fields: {
          location: parsed.location,
          destination: parsed.destination,
          origin: parsed.origin,
          date: parsed.date,
          date_range: parsed.date_range,
          time: parsed.time,
          budget: parsed.budget,
          party_size: parsed.party_size,
          cuisine: parsed.cuisine,
          vibe: parsed.vibe,
        },
      },
      null,
      2
    )
  );
}

function parseLocally(request: string): ParsedRequest {
  const category = detectCategory(request);
  const flowMode = category === "travel" ? "multi_step" : "single_step";
  const location = findNeighborhood(request);
  const destinationMatch = request.match(/\bto\s+([A-Z]{2,}|[A-Z][\w-]+(?:\s+[A-Z][\w-]+)*)/);
  const originMatch = request.match(/\bfrom\s+([A-Z]{2,}|[A-Z][\w-]+(?:\s+[A-Z][\w-]+)*)/);
  const dateRange = findDateRange(request);
  const date = findDate(request);
  const time = findTime(request);
  const budget = findBudget(request);
  const partySize = findPartySize(request);
  const cuisine = findCuisine(request);
  const vibe = findVibe(request);
  const destination = destinationMatch?.[1] ? normalizeWhitespace(destinationMatch[1]) : null;
  const rawOrigin = originMatch?.[1] ? normalizeWhitespace(originMatch[1]) : null;
  const originLooksLikeDate =
    rawOrigin !== null &&
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|next\s+\w+)$/i.test(rawOrigin);
  const origin = dateRange && originLooksLikeDate ? null : rawOrigin;

  const parsed: ParsedRequest = {
    category,
    flow_mode: flowMode,
    uncertain: category === "travel" && !location && !destination && !date && !dateRange && !time,
    fallback_reason:
      category === "travel"
        ? "The request was broad or mixed, so the fallback treated it as general travel planning."
        : null,
    summary: buildSummary(category, {
      location,
      destination,
      origin,
      date,
      date_range: dateRange,
      time,
      budget,
      party_size: partySize,
      cuisine,
      vibe,
    }),
    location,
    destination,
    origin,
    date,
    date_range: dateRange,
    time,
    budget,
    party_size: partySize,
    cuisine,
    vibe,
    keywords: Array.from(
      new Set(
        [
          category,
          location,
          destination,
          origin,
          date,
          dateRange,
          time,
          budget,
          partySize ? `${partySize}` : null,
          cuisine,
          vibe,
        ].filter((value): value is string => Boolean(value))
      )
    ),
  };

  return parsed;
}

function normalizeParsedRequest(value: unknown, request: string): ParsedRequest {
  const parsed = value as Partial<ParsedRequest> | null;

  if (!parsed || typeof parsed !== "object") {
    return fallbackParsedRequest(request, "The parser returned an unexpected response shape.");
  }

  return {
    category:
      parsed.category === "flights" ||
      parsed.category === "restaurants" ||
      parsed.category === "things_to_do" ||
      parsed.category === "travel"
        ? parsed.category
        : "travel",
    flow_mode:
      parsed.flow_mode === "single_step" || parsed.flow_mode === "multi_step"
        ? parsed.flow_mode
        : "multi_step",
    uncertain: Boolean(parsed.uncertain),
    fallback_reason:
      typeof parsed.fallback_reason === "string" ? parsed.fallback_reason : null,
    summary: typeof parsed.summary === "string" ? parsed.summary : "Parsed request.",
    location: typeof parsed.location === "string" ? parsed.location : null,
    destination: typeof parsed.destination === "string" ? parsed.destination : null,
    origin: typeof parsed.origin === "string" ? parsed.origin : null,
    date: typeof parsed.date === "string" ? parsed.date : null,
    date_range: typeof parsed.date_range === "string" ? parsed.date_range : null,
    time: typeof parsed.time === "string" ? parsed.time : null,
    budget: typeof parsed.budget === "string" ? parsed.budget : null,
    party_size:
      typeof parsed.party_size === "number" && Number.isFinite(parsed.party_size)
        ? parsed.party_size
        : null,
    cuisine: typeof parsed.cuisine === "string" ? parsed.cuisine : null,
    vibe: typeof parsed.vibe === "string" ? parsed.vibe : null,
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((keyword): keyword is string => typeof keyword === "string")
      : [],
  };
}

export async function parseRequestWithLLM(request: string): Promise<ParsedRequest> {
  const trimmedRequest = request.trim();

  if (!trimmedRequest) {
    const parsed = fallbackParsedRequest(request, "No prompt was provided.");
    logParser("mock mode", parsed);
    return parsed;
  }

  if (!process.env.OPENAI_API_KEY) {
    const parsed = parseLocally(trimmedRequest);
    parsed.fallback_reason ??=
      "OPENAI_API_KEY is not configured, so the app is using a local fallback.";
    logParser("mock mode", parsed);
    return parsed;
  }

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: parserInstructions,
        },
        {
          role: "user",
          content: trimmedRequest,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "request_parse",
          strict: true,
          schema: requestParseSchema,
        },
      },
    });

    const raw = response.output_text;

    if (!raw) {
      const parsed = parseLocally(trimmedRequest);
      parsed.fallback_reason = "The model returned an empty response.";
      logParser("mock mode", parsed);
      return parsed;
    }

    const parsed = normalizeParsedRequest(JSON.parse(raw), trimmedRequest);
    logParser("OpenAI mode", parsed);
    return parsed;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The parser encountered an unexpected error.";
    const parsed = parseLocally(trimmedRequest);
    parsed.fallback_reason = message;
    logParser("mock mode", parsed);
    return parsed;
  }
}
