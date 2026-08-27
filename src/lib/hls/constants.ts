export const HLS_LOADER_TIMEOUT_MS = 10_000;
export const HLS_MAX_REDIRECTS = 5;
export const HLS_TYPO_PATTERN = /frequancy\.stream/g;
export const HLS_TYPO_REPLACEMENT = "frequency.stream";

// Only CORS-safelisted headers allowed on XHR to avoid preflight.
// User-Agent / Connection / Icy-Metadata are forbidden or trigger preflight rejected by CDN.
export const XHR_SAFE_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-language",
  "content-type",
  "range",
]);

export const TAURI_DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "*/*",
};
