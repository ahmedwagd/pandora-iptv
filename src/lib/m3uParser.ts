// Backward-compatible facade — implementation lives in ./m3u/*
export { parseM3U, groupChannels } from "./m3u/parser";
export { hashId } from "./m3u/hash";
export { parseAttributes } from "./m3u/attributes";
export type { ChannelAttributes } from "./m3u/attributes";
export { extractExtInfHeaders, parseVlcOpt, isAbsoluteUrl } from "./m3u/headers";
export type { ChannelHeaders } from "./m3u/headers";
