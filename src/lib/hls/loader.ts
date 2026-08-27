import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { HLS_LOADER_TIMEOUT_MS } from "./constants";
import { buildRequestHeaders, correctTypo } from "./headers";
import { TauriTransport } from "./tauriTransport";
import { XhrTransport } from "./xhrTransport";
import type { FetchImpl, HlsLoaderCallbacks, HlsLoaderConfig, HlsLoaderContext, HlsLoaderStats } from "./types";

function createInitialStats(): HlsLoaderStats {
  return {
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
}

/**
 * HLS loader routing through Tauri HTTP (CORS bypass) with XHR fallback.
 * Mirrors hls.js XhrLoader interface. Split from god class into transports
 * for SRP and testability — fetch impl is injectable (DIP).
 */
export class TauriHlsLoader {
  private stats: HlsLoaderStats = createInitialStats();
  private timeoutId: number | null = null;
  private destroyed = false;
  private tauriTransport: TauriTransport;
  private xhrTransport = new XhrTransport();
  private fetchImpl: FetchImpl;

  constructor(
    _config?: unknown,
    fetchImpl?: FetchImpl
  ) {
    this.fetchImpl = fetchImpl ?? (tauriFetch as unknown as FetchImpl);
    this.tauriTransport = new TauriTransport(this.fetchImpl);
  }

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

    // Ensure a fresh abort controller per load
    this.tauriTransport.setController(new AbortController());

    const { url: correctedUrl, corrected } = correctTypo(context.url);
    if (corrected) {
      console.warn(`[TauriHlsLoader] Corrected typo frequancy → frequency for ${context.url}`);
      context.url = correctedUrl;
    }

    const headers = buildRequestHeaders(context.headers, context.rangeStart, context.rangeEnd);
    const timeout = (config.timeout as number) ?? HLS_LOADER_TIMEOUT_MS;

    if (timeout > 0) {
      this.timeoutId = window.setTimeout(() => {
        this.abortInternal();
        callbacks.onTimeout(this.stats, context, null);
      }, timeout);
    }

    const hasTauri = typeof this.fetchImpl === "function";
    if (!hasTauri) {
      this.loadViaXhr(context, headers, callbacks);
      return;
    }

    const getDestroyed = () => this.destroyed;
    const getTimeoutId = () => this.timeoutId;
    const clearTimeoutId = () => { this.timeoutId = null; };

    void this.tauriTransport
      .loadViaTauri(context, headers, this.stats, callbacks, context.url, 0, getDestroyed, getTimeoutId, clearTimeoutId, () => {
        this.loadViaXhr(context, headers, callbacks);
      })
      .catch((e) => {
        // loadViaTauri already handles onFail — this is just safety for unexpected rejection
        if (this.destroyed) return;
        console.warn(`[TauriHlsLoader] Unexpected Tauri error: ${String(e)} — falling back to XHR`);
        this.loadViaXhr(context, headers, callbacks);
      });
  }

  private loadViaXhr(
    context: HlsLoaderContext,
    headers: Record<string, string>,
    callbacks: HlsLoaderCallbacks,
    onNetworkFail?: () => void
  ): void {
    this.xhrTransport.load(
      context,
      headers,
      this.stats,
      callbacks,
      () => this.destroyed,
      () => this.timeoutId,
      () => { this.timeoutId = null; },
      onNetworkFail
    );
  }

  private abortInternal(): void {
    this.tauriTransport.abort();
    this.xhrTransport.abort();
  }

  abort(): void {
    this.abortInternal();
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.abort();
    this.xhrTransport.destroy();
  }
}

/**
 * Factory for header-injected loaders — replaces dynamic `class extends TauriHlsLoader` in Player.
 */
export function createHlsLoaderClass(
  injectedHeaders?: Record<string, string>,
  fetchImpl?: FetchImpl
): typeof TauriHlsLoader {
  if (!injectedHeaders || Object.keys(injectedHeaders).length === 0) return TauriHlsLoader;
  return class extends TauriHlsLoader {
    constructor(cfg?: unknown) { super(cfg, fetchImpl); }
    override load(ctx: HlsLoaderContext, cfg: HlsLoaderConfig, cb: HlsLoaderCallbacks): void {
      ctx.headers = { ...injectedHeaders, ...(ctx.headers ?? {}) };
      super.load(ctx, cfg, cb);
    }
  } as unknown as typeof TauriHlsLoader;
}
