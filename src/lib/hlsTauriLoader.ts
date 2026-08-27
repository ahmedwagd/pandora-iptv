import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// Hls.js custom loader that routes all manifest / segment requests through
// Tauri's HTTP plugin (Rust side) to bypass WebView CORS (Xtream servers
// rarely send Access-Control-Allow-Origin). Mirrors the XhrLoader interface.
//
// Reference: hls.js Loader API - load(context, config, callbacks)
// context = { url, responseType, rangeStart, rangeEnd, headers? }
// callbacks = { onSuccess(response, stats, context), onError(error, context), onTimeout, onAbort }
type HlsLoaderContext = {
  url: string;
  responseType: string;
  rangeStart?: number;
  rangeEnd?: number;
  headers?: Record<string, string>;
};

type HlsLoaderStats = {
  aborted: boolean;
  loaded: number;
  total: number;
  retry: number;
  chunkCount: number;
  bwEstimate: number;
  loading: { start: number; first: number; end: number };
  parsing: { start: number; end: number };
  buffering: { start: number; first: number; end: number };
};

type HlsLoaderCallbacks = {
  onSuccess: (response: { url: string; data: string | ArrayBuffer }, stats: HlsLoaderStats, context: HlsLoaderContext, networkDetails: unknown) => void;
  onError: (error: { code: number; text: string }, context: HlsLoaderContext, networkDetails: unknown) => void;
  onTimeout: (stats: HlsLoaderStats, context: HlsLoaderContext, networkDetails: unknown) => void;
  onAbort?: (stats: HlsLoaderStats, context: HlsLoaderContext, networkDetails: unknown) => void;
};

type HlsLoaderConfig = {
  timeout?: number;
  maxRetry?: number;
  retryDelay?: number;
};

export class TauriHlsLoader {
  private controller: AbortController | null = null;
  private stats: HlsLoaderStats = {
    aborted: false,
    loaded: 0,
    total: 0,
    retry: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  };
  private timeoutId: number | null = null;
  private destroyed = false;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: unknown) {}

  load(context: HlsLoaderContext, config: HlsLoaderConfig, callbacks: HlsLoaderCallbacks): void {
    this.destroyed = false;
    this.stats = {
      aborted: false,
      loaded: 0,
      total: 0,
      retry: 0,
      chunkCount: 0,
      bwEstimate: 0,
      loading: { start: performance.now(), first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
    this.controller = new AbortController();

    // Fix common typo in provider playlists: frequancy.stream → frequency.stream (DNS 0 otherwise)
    const originalUrl = context.url;
    if (originalUrl.includes("frequancy.stream")) {
      context.url = originalUrl.replace(/frequancy\.stream/g, "frequency.stream");
      console.warn(`[TauriHlsLoader] Corrected typo frequancy → frequency for ${originalUrl}`);
    }
    const headers: Record<string, string> = { ...(context.headers ?? {}) };
    if (context.rangeStart !== undefined && context.rangeEnd !== undefined) {
      headers["Range"] = `bytes=${context.rangeStart}-${context.rangeEnd - 1}`;
    } else if (context.rangeStart !== undefined) {
      headers["Range"] = `bytes=${context.rangeStart}-`;
    }
    // Xtream providers often block requests without a browser/IPTV UA or Icy headers.
    // Hls.js sends no UA by default from WebView; Tauri HTTP needs explicit headers.
    // mhiptv.info and similar panels sometimes block VLC but allow browser UA — use Mozilla as primary.
    if (!headers["User-Agent"] && !headers["user-agent"]) {
      headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    }
    if (!headers["Accept"]) headers["Accept"] = "*/*";
    // NOTE: no User-Agent/Connection/Icy-Metadata auto-injection here — those are unsafe in XHR
    // (forbidden headers) and Icy-Metadata triggers CORS preflight that most CDNs reject.
    // Tauri path (Rust fetch) has no such limits, but keeping headers minimal avoids the
    // preflight/forbidden-header failures seen with test-streams.mux.dev.

    const timeout = (config.timeout as number) ?? 10000;
    if (timeout > 0) {
      this.timeoutId = window.setTimeout(() => {
        this.abortInternal();
        callbacks.onTimeout(this.stats, context, null);
      }, timeout);
    }

    // Tauri fetch first (bypasses WebView CORS for Xtream panels). On ANY failure
    // (network/CORS/plugin-not-initialized in vite browser dev) fall back to plain XHR,
    // which is exactly what worked pre-ee60990 and handles ACAO:* sources like mux.
    if (typeof tauriFetch !== "function") {
      this.loadViaXhr(context, headers, callbacks);
      return;
    }
    this.loadViaTauri(context, headers, callbacks, context.url, 0, () => {
      this.loadViaXhr(context, headers, callbacks);
    });
  }

  private loadViaTauri(
    context: HlsLoaderContext,
    headers: Record<string, string>,
    callbacks: HlsLoaderCallbacks,
    url: string,
    redirectCount: number,
    onFail?: () => void
  ): void {
    if (this.destroyed) return;
    if (redirectCount > 5) {
      if (onFail) { onFail(); return; }
      callbacks.onError({ code: 0, text: "Too many redirects" }, context, null);
      return;
    }
    if (typeof tauriFetch !== "function") {
      if (onFail) { onFail(); return; }
      callbacks.onError({ code: 0, text: "Tauri HTTP plugin unavailable" }, context, null);
      return;
    }
    try {
      if (!this.controller) this.controller = new AbortController();
      (tauriFetch as unknown as (url: string, init: RequestInit) => Promise<Response>)(url, {
        method: "GET",
        headers,
        signal: this.controller.signal as AbortSignal,
      } as RequestInit)
        .then(async (res) => {
          if (this.destroyed) return;
          // Fetch settled: drop the controller so any later abort()/timeout is a no-op.
          // Aborting a settled Tauri fetch fires "resource id invalid" on the dropped Rust resource.
          this.controller = null;
          if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
          }
          if (!res.ok) {
            if (res.status >= 300 && res.status < 400 && redirectCount < 5) {
              let loc: string | null = null;
              try {
                const h = res.headers as unknown as { get?: (k: string) => string | null } & Record<string, string>;
                loc = h?.get?.("location") ?? h?.get?.("Location") ?? (h as Record<string, string>)["location"] ?? (h as Record<string, string>)["Location"] ?? null;
                if (!loc && h && typeof h === "object") {
                  for (const [k, v] of Object.entries(h as Record<string, string>)) {
                    if (k.toLowerCase() === "location" && v) { loc = v; break; }
                  }
                }
              } catch {}
              if (loc) {
                console.log(`[TauriHlsLoader] Following redirect ${res.status} ${url} → ${loc}`);
                this.loadViaTauri(context, headers, callbacks, loc, redirectCount + 1, onFail);
                return;
              }
            }
            callbacks.onError({ code: res.status, text: res.statusText || `HTTP ${res.status}` }, context, res);
            return;
          }
          this.stats.loading.first = performance.now();
          let data: string | ArrayBuffer;
          if (context.responseType === "arraybuffer") {
            const buf = await (res as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
            data = buf;
            this.stats.loaded = buf.byteLength;
            this.stats.total = buf.byteLength;
          } else {
            const text = await (res as unknown as { text: () => Promise<string> }).text();
            data = text;
            this.stats.loaded = text.length;
            this.stats.total = text.length;
          }
          if (this.destroyed) return;
          this.stats.loading.end = performance.now();
          const finalUrl = (res as { url?: string }).url || url;
          callbacks.onSuccess({ url: finalUrl, data }, this.stats, context, res);
        })
        .catch((err: unknown) => {
          if (this.destroyed) return;
          this.controller = null;
          if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
          }
          const e = err as Error & { name?: string };
          if (e?.name === "AbortError") {
            callbacks.onAbort?.(this.stats, context, null);
            return;
          }
          // Any network/plugin failure → fall back to XHR (pre-ee60990 path). This covers
          // browser dev where __TAURI_INTERNALS__ is undefined and tauri fetch rejects.
          if (onFail) {
            console.warn(`[TauriHlsLoader] Tauri fetch failed for ${url}: ${e?.message ?? String(err)} — falling back to XHR`);
            onFail();
            return;
          }
          callbacks.onError({ code: 0, text: e?.message ?? String(err) }, context, null);
        });
    } catch (e) {
      if (this.destroyed) return;
      if (onFail) {
        console.warn(`[TauriHlsLoader] Tauri sync error for ${url}: ${String(e)} — falling back to XHR`);
        onFail();
        return;
      }
      callbacks.onError({ code: 0, text: (e as Error).message ?? String(e) }, context, null);
    }
  }

  private xhrController: { abort: () => void } | null = null;

  private loadViaXhr(
    context: HlsLoaderContext,
    headers: Record<string, string>,
    callbacks: HlsLoaderCallbacks,
    onNetworkFail?: () => void
  ): void {
    // Fallback matching hls.js XhrLoader but with relaxed CORS — used in browser dev or when Tauri 403s.
    // This restores pre-ee60990 behavior where plain XHR played live channels.
    const xhr = new XMLHttpRequest();
    this.xhrController = { abort: () => { try { xhr.abort(); } catch {} } };
    const url = context.url;
    xhr.open("GET", url, true);
    xhr.responseType = (context.responseType as XMLHttpRequestResponseType) || "text";
    // Only set CORS-safelisted headers on XHR to avoid triggering a preflight.
    // User-Agent/Connection are forbidden; Icy-Metadata/Referer/etc. trigger preflight
    // that mux/cloudfront reject ("not allowed by Access-Control-Allow-Headers").
    const SAFE_HEADERS = new Set(["accept", "accept-language", "content-language", "content-type", "range"]);
    for (const [k, v] of Object.entries(headers)) {
      if (!SAFE_HEADERS.has(k.toLowerCase())) continue;
      try { xhr.setRequestHeader(k, v); } catch {}
    }
    if (context.rangeStart !== undefined) {
      // already in headers, but ensure correct header if caller bypassed
    }
    xhr.onload = () => {
      if (this.destroyed) return;
      if (this.timeoutId !== null) { window.clearTimeout(this.timeoutId); this.timeoutId = null; }
      const status = xhr.status;
      if (status < 200 || status >= 300) {
        callbacks.onError({ code: status, text: xhr.statusText || `HTTP ${status}` }, context, xhr);
        return;
      }
      this.stats.loading.first = performance.now();
      const data = xhr.response ?? xhr.responseText;
      // hls.js expects string for manifests, ArrayBuffer for segments
      const outData = context.responseType === "arraybuffer" && data instanceof ArrayBuffer ? data : (data as string | ArrayBuffer);
      if (outData !== undefined) {
        this.stats.loaded = typeof outData === "string" ? outData.length : (outData as ArrayBuffer).byteLength ?? 0;
        this.stats.total = this.stats.loaded;
      }
      this.stats.loading.end = performance.now();
      const finalUrl = (xhr as unknown as { responseURL?: string }).responseURL || url;
      callbacks.onSuccess({ url: finalUrl, data: outData as string | ArrayBuffer }, this.stats, context, xhr);
    };
    xhr.onerror = () => {
      if (this.destroyed) return;
      // CORS failure (status 0) or genuine network error — try Tauri fallback before giving up.
      if (onNetworkFail) {
        onNetworkFail();
        return;
      }
      if (this.timeoutId !== null) { window.clearTimeout(this.timeoutId); this.timeoutId = null; }
      callbacks.onError({ code: 0, text: "XHR network error" }, context, xhr);
    };
    xhr.ontimeout = () => {
      if (this.destroyed) return;
      callbacks.onTimeout(this.stats, context, xhr);
    };
    xhr.onabort = () => {
      callbacks.onAbort?.(this.stats, context, xhr);
    };
    try { xhr.send(); } catch (e) {
      if (this.destroyed) return;
      if (onNetworkFail) { onNetworkFail(); return; }
      callbacks.onError({ code: 0, text: (e as Error).message ?? String(e) }, context, xhr);
    }
  }

  private abortInternal(): void {
    try {
      this.controller?.abort();
    } catch {}
    try { this.xhrController?.abort(); } catch {}
  }

  abort(): void {
    this.abortInternal();
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.xhrController = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.abort();
    this.xhrController = null;
  }
}
