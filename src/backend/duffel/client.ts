import { getEnvTrimmed } from "@/backend/env-api-keys";
import { fetchWithRetry } from "@/backend/http-retry";

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

export function getDuffelAccessToken(): string | undefined {
  const t = getEnvTrimmed("DUFFEL_ACCESS_TOKEN");
  return t.length ? t : undefined;
}

export function isDuffelConfigured(): boolean {
  return !!getDuffelAccessToken();
}

function duffelHeaders(): Record<string, string> {
  const token = getDuffelAccessToken();
  if (!token) throw new Error("DUFFEL_ACCESS_TOKEN is not set.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Duffel-Version": DUFFEL_VERSION,
    Accept: "application/json",
  };
}

export async function duffelPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${DUFFEL_BASE}${path}`;
  const retryUnsafeMethods =
    path === "/air/offer_requests" ||
    path === "/stays/search" ||
    path === "/stays/quotes";
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: "POST",
      headers: duffelHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    }, { timeoutMs: 12_000, retryUnsafeMethods });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Duffel network error for POST ${path}: ${msg}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Duffel POST ${path} (${res.status}): ${text.slice(0, 800)}`);
  }
  return JSON.parse(text) as T;
}

export async function duffelGet<T>(path: string): Promise<T> {
  const url = `${DUFFEL_BASE}${path}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: "GET",
      headers: duffelHeaders(),
      cache: "no-store",
    }, { timeoutMs: 12_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Duffel network error for GET ${path}: ${msg}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Duffel GET ${path} (${res.status}): ${text.slice(0, 800)}`);
  }
  return JSON.parse(text) as T;
}

export async function duffelDelete(path: string): Promise<void> {
  const url = `${DUFFEL_BASE}${path}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: "DELETE",
      headers: duffelHeaders(),
      cache: "no-store",
    }, { timeoutMs: 12_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Duffel network error for DELETE ${path}: ${msg}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Duffel DELETE ${path} (${res.status}): ${text.slice(0, 800)}`);
  }
}
