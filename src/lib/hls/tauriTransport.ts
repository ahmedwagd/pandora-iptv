import { HLS_MAX_REDIRECTS } from "./constants";
import type { FetchImpl, HlsLoaderCallbacks, HlsLoaderContext, HlsLoaderStats } from "./types";

export class TauriTransport {
  private controller: AbortController | null = null;

  constructor(private fetchImpl: FetchImpl) {}

  getController(): AbortController | null { return this.controller; }
  setController(c: AbortController | null) { this.controller = c; }
  ensureController(): AbortController {
    if (!this.controller) this.controller = new AbortController();
    return this.controller;
  }
  clearController(): void { this.controller = null; }

  abort(): void {
    try { this.controller?.abort(); } catch { /* ignore */ }
  }

  async loadViaTauri(
    context: HlsLoaderContext,
    headers: Record<string, string>,
    stats: HlsLoaderStats,
    callbacks: HlsLoaderCallbacks,
    url: string,
    redirectCount: number,
    getDestroyed: () => boolean,
    getTimeoutId: () => number | null,
    clearTimeoutId: () => void,
    onFail?: () => void
  ): Promise<void> {
    if (getDestroyed()) return;
    if (redirectCount > HLS_MAX_REDIRECTS) {
      if (onFail) { onFail(); return; }
      callbacks.onError({ code: 0, text: "Too many redirects" }, context, null);
      return;
    }

    try {
      const ctrl = this.ensureController();
      const fetchFn = this.fetchImpl as unknown as (u: string, init: RequestInit) => Promise<Response>;
      const res = await fetchFn(url, { method: "GET", headers, signal: ctrl.signal as AbortSignal } as RequestInit);

      if (getDestroyed()) return;
      // Fetch settled — drop controller so later abort is no-op (avoids "resource id invalid")
      this.clearController();
      const tid = getTimeoutId();
      if (tid !== null) { window.clearTimeout(tid); clearTimeoutId(); }

      if (!res.ok) {
        if (res.status >= 300 && res.status < 400 && redirectCount < HLS_MAX_REDIRECTS) {
          const loc = extractLocation(res.headers);
          if (loc) {
            // Ensure next hop has a fresh controller
            this.ensureController();
            await this.loadViaTauri(context, headers, stats, callbacks, loc, redirectCount + 1, getDestroyed, getTimeoutId, clearTimeoutId, onFail);
            return;
          }
        }
        callbacks.onError({ code: res.status, text: res.statusText || `HTTP ${res.status}` }, context, res);
        return;
      }

      stats.loading.first = performance.now();
      let data: string | ArrayBuffer;
      if (context.responseType === "arraybuffer") {
        const buf = await (res as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
        data = buf;
        stats.loaded = buf.byteLength;
        stats.total = buf.byteLength;
      } else {
        const text = await (res as unknown as { text: () => Promise<string> }).text();
        data = text;
        stats.loaded = text.length;
        stats.total = text.length;
      }
      if (getDestroyed()) return;
      stats.loading.end = performance.now();
      const finalUrl = (res as { url?: string }).url || url;
      callbacks.onSuccess({ url: finalUrl, data }, stats, context, res);
    } catch (err: unknown) {
      if (getDestroyed()) return;
      this.clearController();
      const tid = getTimeoutId();
      if (tid !== null) { window.clearTimeout(tid); clearTimeoutId(); }
      const e = err as Error & { name?: string };
      if (e?.name === "AbortError") {
        callbacks.onAbort?.(stats, context, null);
        return;
      }
      if (onFail) {
        console.warn(`[TauriTransport] Tauri fetch failed for ${url}: ${e?.message ?? String(err)} — falling back to XHR`);
        onFail();
        return;
      }
      callbacks.onError({ code: 0, text: e?.message ?? String(err) }, context, null);
    }
  }
}

function extractLocation(headers: unknown): string | null {
  try {
    const h = headers as unknown as { get?: (k: string) => string | null } & Record<string, string>;
    const direct = h?.get?.("location") ?? h?.get?.("Location") ?? (h as Record<string, string>)["location"] ?? (h as Record<string, string>)["Location"] ?? null;
    if (direct) return direct;
    if (h && typeof h === "object") {
      for (const [k, v] of Object.entries(h as Record<string, string>)) {
        if (k.toLowerCase() === "location" && v) return v;
      }
    }
  } catch { /* ignore */ }
  return null;
}
