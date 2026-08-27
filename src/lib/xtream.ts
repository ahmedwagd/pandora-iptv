// Backward-compatible facade — implementation split into ./xtream/* for SRP.
// Keep this file as re-export so existing imports `from "../lib/xtream"` stay valid.
export * from "./xtream/index";
export type { FetchFn } from "./xtream/types";
