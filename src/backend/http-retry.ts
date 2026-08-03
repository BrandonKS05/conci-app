import "server-only";

export type FetchWithRetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  retryUnsafeMethods?: boolean;
  retryStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryResponse(res: Response, init: RequestInit | undefined, opts: Required<FetchWithRetryOptions>): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  const methodSafe = method === "GET" || method === "HEAD" || opts.retryUnsafeMethods;
  return methodSafe && opts.retryStatuses.includes(res.status);
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const opts: Required<FetchWithRetryOptions> = {
    attempts: Math.max(1, options?.attempts ?? 2),
    timeoutMs: Math.max(1000, options?.timeoutMs ?? 12_000),
    retryUnsafeMethods: options?.retryUnsafeMethods ?? false,
    retryStatuses: options?.retryStatuses ?? DEFAULT_RETRY_STATUSES,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (attempt < opts.attempts - 1 && shouldRetryResponse(res, init, opts)) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt >= opts.attempts - 1) break;
      await sleep(250 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed.");
}
