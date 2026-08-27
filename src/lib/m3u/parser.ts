import type { Channel } from "../../types";
import { hashId } from "./hash";
import { parseAttributes } from "./attributes";
import { extractExtInfHeaders, isAbsoluteUrl, parseVlcOpt } from "./headers";

interface PendingEntry {
  name: string;
  attrs: Record<string, string>;
  headers: Record<string, string>;
}

function createChannel(
  url: string,
  pending: PendingEntry
): Channel {
  const name = pending.name || url;
  const group = pending.attrs["group-title"]?.trim() || "Uncategorized";
  const headers = Object.keys(pending.headers).length ? { ...pending.headers } : undefined;
  return {
    id: hashId(name + url),
    name,
    url,
    logo: pending.attrs["tvg-logo"],
    group,
    tvgId: pending.attrs["tvg-id"],
    ...(headers ? { headers } : {}),
  };
}

/**
 * Parses M3U/M3U8 playlist text (standard + IPTV extensions).
 * Tolerant: skips malformed entries rather than throwing.
 */
export function parseM3U(content: string): Channel[] {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  let pending: PendingEntry | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const commaIdx = line.lastIndexOf(",");
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Unnamed Channel";
      const attrs = parseAttributes(line);
      const headers = extractExtInfHeaders(line);
      pending = { name, attrs, headers };
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      const parsed = parseVlcOpt(line);
      if (parsed) {
        if (!pending) pending = { name: "", attrs: {}, headers: {} };
        Object.assign(pending.headers, parsed);
      }
      continue;
    }

    if (line.startsWith("#")) continue;

    // Bare URL (no pending EXTINF) — may be alt or standalone
    if (!pending || !pending.name) {
      if (!isAbsoluteUrl(line)) continue; // skip HLS variant relatives like url_0/...
      const last = channels[channels.length - 1];
      if (last) {
        last.altUrls = [...(last.altUrls ?? []), line];
      } else {
        channels.push({ id: hashId(line + line), name: line, url: line, group: "Uncategorized" });
      }
      continue;
    }

    // Pending EXTINF → expect channel URL
    if (!isAbsoluteUrl(line)) {
      // HLS master relative variant — discard pending
      pending = null;
      continue;
    }

    channels.push(createChannel(line, pending));
    pending = null;
  }

  return channels;
}

export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>();
  for (const ch of channels) {
    const list = map.get(ch.group);
    if (list) list.push(ch);
    else map.set(ch.group, [ch]);
  }
  return map;
}
