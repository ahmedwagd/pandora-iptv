import { filterSafeHeaders } from "./headers";
import type { HlsLoaderCallbacks, HlsLoaderContext, HlsLoaderStats } from "./types";

export class XhrTransport {
  private controller: { abort: () => void } | null = null;

  load(
    context: HlsLoaderContext,
    headers: Record<string, string>,
    stats: HlsLoaderStats,
    callbacks: HlsLoaderCallbacks,
    getDestroyed: () => boolean,
    getTimeoutId: () => number | null,
    clearTimeoutId: () => void,
    onNetworkFail?: () => void
  ): void {
    const xhr = new XMLHttpRequest();
    this.controller = { abort: () => { try { xhr.abort(); } catch { /* ignore */ } } };

    const url = context.url;
    xhr.open("GET", url, true);
    xhr.responseType = (context.responseType as XMLHttpRequestResponseType) || "text";

    const safe = filterSafeHeaders(headers);
    for (const [k, v] of Object.entries(safe)) {
      try { xhr.setRequestHeader(k, v); } catch { /* ignore */ }
    }

    xhr.onload = () => {
      if (getDestroyed()) return;
      const tid = getTimeoutId();
      if (tid !== null) { window.clearTimeout(tid); clearTimeoutId(); }
      const status = xhr.status;
      if (status < 200 || status >= 300) {
        callbacks.onError({ code: status, text: xhr.statusText || `HTTP ${status}` }, context, xhr);
        return;
      }
      stats.loading.first = performance.now();
      const data = xhr.response ?? xhr.responseText;
      const outData =
        context.responseType === "arraybuffer" && data instanceof ArrayBuffer ? data : (data as string | ArrayBuffer);
      if (outData !== undefined) {
        stats.loaded = typeof outData === "string" ? outData.length : (outData as ArrayBuffer).byteLength ?? 0;
        stats.total = stats.loaded;
      }
      stats.loading.end = performance.now();
      const finalUrl = (xhr as unknown as { responseURL?: string }).responseURL || url;
      callbacks.onSuccess({ url: finalUrl, data: outData as string | ArrayBuffer }, stats, context, xhr);
    };

    xhr.onerror = () => {
      if (getDestroyed()) return;
      if (onNetworkFail) { onNetworkFail(); return; }
      const tid = getTimeoutId();
      if (tid !== null) { window.clearTimeout(tid); clearTimeoutId(); }
      callbacks.onError({ code: 0, text: "XHR network error" }, context, xhr);
    };

    xhr.ontimeout = () => {
      if (getDestroyed()) return;
      callbacks.onTimeout(stats, context, xhr);
    };

    xhr.onabort = () => {
      callbacks.onAbort?.(stats, context, xhr);
    };

    try {
      xhr.send();
    } catch (e) {
      if (getDestroyed()) return;
      if (onNetworkFail) { onNetworkFail(); return; }
      callbacks.onError({ code: 0, text: (e as Error).message ?? String(e) }, context, xhr);
    }
  }

  abort(): void {
    try { this.controller?.abort(); } catch { /* ignore */ }
  }

  destroy(): void {
    this.abort();
    this.controller = null;
  }
}
