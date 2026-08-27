import { DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS } from "./constants";
import type { FetchFn } from "./types";

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  if (!timeoutMs) return signal;
  const timeoutSignal =
    typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
  if (!timeoutSignal) return signal;
  if (!signal) return timeoutSignal;
  const combined = new AbortController();
  const onAbort = () => combined.abort(signal.reason ?? timeoutSignal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", () => combined.abort(timeoutSignal.reason), { once: true });
  return combined.signal;
}

export async function fetchJson<T>(
  fetchFn: FetchFn,
  url: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number; retries?: number }
): Promise<T> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal = withTimeout(opts?.signal, timeoutMs);
      const res = await fetchFn(url, signal ? { signal } : undefined);
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (attempt < retries) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("HTTP") && !msg.includes("HTTP 5")) throw e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
