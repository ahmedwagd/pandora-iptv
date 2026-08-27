// Backward-compatible facade for TauriHlsLoader.
// Implementation moved to ./hls/loader for SRP and DIP (injectable fetch).
// Keep this file as re-export so existing imports `from "../lib/hlsTauriLoader"` stay valid.
export { TauriHlsLoader, createHlsLoaderClass } from "./hls/loader";
export type { HlsLoaderContext, HlsLoaderStats, HlsLoaderCallbacks, HlsLoaderConfig, FetchImpl } from "./hls/types";
