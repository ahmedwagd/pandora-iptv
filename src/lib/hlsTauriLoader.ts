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
  trequest: number;
  tfirst: number;
  tload: number;
  loaded: number;
  total: number;
  retry: number;
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
  private stats: HlsLoaderStats = { trequest: 0, tfirst: 0, tload: 0, loaded: 0, total: 0, retry: 0 };
  private timeoutId: number | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: unknown) {}

  load(context: HlsLoaderContext, config: HlsLoaderConfig, callbacks: HlsLoaderCallbacks): void {
    this.stats = { trequest: performance.now(), tfirst: 0, tload: 0, loaded: 0, total: 0, retry: 0 };
    this.controller = new AbortController();

    const headers: Record<string, string> = { ...(context.headers ?? {}) };
    if (context.rangeStart !== undefined && context.rangeEnd !== undefined) {
      headers["Range"] = `bytes=${context.rangeStart}-${context.rangeEnd - 1}`;
    } else if (context.rangeStart !== undefined) {
      headers["Range"] = `bytes=${context.rangeStart}-`;
    }

    const timeout = (config.timeout as number) ?? 10000;
    if (timeout > 0) {
      this.timeoutId = window.setTimeout(() => {
        this.abortInternal();
        callbacks.onTimeout(this.stats, context, null);
      }, timeout);
    }

    // Tauri fetch runs in Rust, bypasses CORS
    (tauriFetch as unknown as (url: string, init: RequestInit) => Promise<Response>)(context.url, {
      method: "GET",
      headers,
      signal: this.controller.signal as AbortSignal,
    } as RequestInit)
      .then(async (res) => {
        if (this.timeoutId !== null) {
          window.clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        if (!res.ok) {
          callbacks.onError({ code: res.status, text: res.statusText || `HTTP ${res.status}` }, context, res);
          return;
        }
        this.stats.tfirst = performance.now();
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
        this.stats.tload = performance.now();
        callbacks.onSuccess({ url: context.url, data }, this.stats, context, res);
      })
      .catch((err: unknown) => {
        if (this.timeoutId !== null) {
          window.clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        const e = err as Error & { name?: string };
        if (e?.name === "AbortError") {
          callbacks.onAbort?.(this.stats, context, null);
          return;
        }
        callbacks.onError({ code: 0, text: e?.message ?? String(err) }, context, null);
      });
  }

  private abortInternal(): void {
    try {
      this.controller?.abort();
    } catch {}
  }

  abort(): void {
    this.abortInternal();
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  destroy(): void {
    this.abort();
  }
}
