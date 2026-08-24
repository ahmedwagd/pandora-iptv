import type { Channel } from "../types";

// Simple, dependency-free hash for stable channel ids (favorites keying)
function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const ATTR_RE = /([a-zA-Z0-9-]+)="([^"]*)"/g;

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

/**
 * Parses M3U/M3U8 playlist text (standard + IPTV extensions like
 * tvg-logo, tvg-id, group-title) into a flat list of Channels.
 *
 * Tolerant by design: skips malformed entries rather than throwing,
 * since real-world IPTV playlists are frequently inconsistent.
 */
export function parseM3U(content: string): Channel[] {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];

  let pendingName = "";
  let pendingAttrs: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      // Format: #EXTINF:-1 tvg-id="..." tvg-logo="..." group-title="...",Channel Name
      const commaIdx = line.lastIndexOf(",");
      pendingName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Unnamed Channel";
      pendingAttrs = parseAttributes(line);
      continue;
    }

    if (line.startsWith("#")) {
      // Other directives (#EXTM3U, #EXTGRP, #EXTVLCOPT, etc.) - ignored for MVP
      continue;
    }

    // Any non-comment, non-empty line is treated as a stream URL
    const url = line;
    const name = pendingName || url;
    const group = pendingAttrs["group-title"]?.trim() || "Uncategorized";

    channels.push({
      id: hashId(name + url),
      name,
      url,
      logo: pendingAttrs["tvg-logo"],
      group,
      tvgId: pendingAttrs["tvg-id"],
    });

    // Reset for next entry
    pendingName = "";
    pendingAttrs = {};
  }

  return channels;
}

/** Groups channels by their `group` field, preserving first-seen order. */
export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>();
  for (const ch of channels) {
    const list = map.get(ch.group);
    if (list) {
      list.push(ch);
    } else {
      map.set(ch.group, [ch]);
    }
  }
  return map;
}
