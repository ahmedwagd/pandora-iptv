import { TAURI_DEFAULT_HEADERS, XHR_SAFE_HEADERS } from "./constants";

export function buildRequestHeaders(
  contextHeaders: Record<string, string> | undefined,
  rangeStart?: number,
  rangeEnd?: number
): Record<string, string> {
  const headers: Record<string, string> = { ...(contextHeaders ?? {}) };
  if (rangeStart !== undefined && rangeEnd !== undefined) {
    headers["Range"] = `bytes=${rangeStart}-${rangeEnd - 1}`;
  } else if (rangeStart !== undefined) {
    headers["Range"] = `bytes=${rangeStart}-`;
  }
  if (!headers["User-Agent"] && !headers["user-agent"]) {
    headers["User-Agent"] = TAURI_DEFAULT_HEADERS["User-Agent"];
  }
  if (!headers["Accept"]) headers["Accept"] = TAURI_DEFAULT_HEADERS.Accept;
  return headers;
}

export function filterSafeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (XHR_SAFE_HEADERS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

export function correctTypo(url: string): { url: string; corrected: boolean } {
  if (url.includes("frequancy.stream")) {
    return { url: url.replace(/frequancy\.stream/g, "frequency.stream"), corrected: true };
  }
  return { url, corrected: false };
}
