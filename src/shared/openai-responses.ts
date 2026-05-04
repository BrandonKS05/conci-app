/**
 * Raw REST responses from POST /v1/responses do not include `output_text` (that field is
 * SDK-only). Aggregate assistant text from `output` message blocks instead.
 */
export function extractOpenAiResponsesOutputText(payload: unknown): string {
  if (payload == null || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.output_text === "string" && p.output_text.trim()) {
    return p.output_text;
  }
  const output = p.output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "output_text" && typeof b.text === "string") {
        chunks.push(b.text);
      }
    }
  }
  return chunks.join("");
}
