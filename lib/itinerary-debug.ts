type DiagnosticPayload = Record<string, unknown> | undefined;

function scrub(payload: DiagnosticPayload) {
  if (!payload) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(payload, (_key, value) => {
      if (typeof value === "string" && value.length > 280) {
        return `${value.slice(0, 277)}...`;
      }

      return value;
    })
  ) as Record<string, unknown>;
}

export function logItineraryDiagnostic(event: string, payload?: DiagnosticPayload) {
  console.log("[conci:itinerary]", {
    event,
    at: new Date().toISOString(),
    ...scrub(payload),
  });
}

export function logItineraryError(event: string, payload?: DiagnosticPayload) {
  console.error("[conci:itinerary]", {
    event,
    at: new Date().toISOString(),
    ...scrub(payload),
  });
}
