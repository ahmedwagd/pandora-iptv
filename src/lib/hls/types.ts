/**
 * HLS loader contract — aligned with hls.js 1.7.1 Loader API.
 * We define our own types to avoid importing hls.js internals in workers,
 * but shape matches hls.js LoadStats for compatibility.
 */
export type HlsLoaderContext = {
  url: string;
  responseType: string;
  rangeStart?: number;
  rangeEnd?: number;
  headers?: Record<string, string>;
};

export type HlsLoaderStats = {
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

export type HlsLoaderCallbacks = {
  onSuccess: (
    response: { url: string; data: string | ArrayBuffer },
    stats: HlsLoaderStats,
    context: HlsLoaderContext,
    networkDetails: unknown
  ) => void;
  onError: (error: { code: number; text: string }, context: HlsLoaderContext, networkDetails: unknown) => void;
  onTimeout: (stats: HlsLoaderStats, context: HlsLoaderContext, networkDetails: unknown) => void;
  onAbort?: (stats: HlsLoaderStats, context: HlsLoaderContext, networkDetails: unknown) => void;
};

export type HlsLoaderConfig = {
  timeout?: number;
  maxRetry?: number;
  retryDelay?: number;
};

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;
