export type ChannelHeaders = Record<string, string>;

/**
 * Extracts http-user-agent / http-referrer headers from an #EXTINF line.
 * Supports both quoted (http-user-agent="VLC/...") and unquoted forms.
 * Returns normalized header keys: User-Agent, Referer, Origin.
 */
export function extractExtInfHeaders(line: string): ChannelHeaders {
  const headers: ChannelHeaders = {};
  // Quoted forms take precedence — precise
  const uaQuoted = line.match(/http-user-agent="([^"]+)"/i);
  if (uaQuoted?.[1]) headers["User-Agent"] = uaQuoted[1];
  const refQuoted = line.match(/http-referrer="([^"]+)"/i) ?? line.match(/http-referer="([^"]+)"/i);
  if (refQuoted?.[1]) headers["Referer"] = refQuoted[1];
  if (headers["User-Agent"] && headers["Referer"]) return headers;

  // Unquoted forms: stop at whitespace, comma, or quote — avoids capturing ",Ch" tail
  const patterns: Array<{ re: RegExp; target: string }> = [
    { re: /http-user-agent\s*=\s*"?([^\s",]+)/i, target: "User-Agent" },
    { re: /http-referrer\s*=\s*"?([^\s",]+)/i, target: "Referer" },
    { re: /http-referer\s*=\s*"?([^\s",]+)/i, target: "Referer" },
  ];
  for (const { re, target } of patterns) {
    if (headers[target]) continue;
    const m = line.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/^"|"$/g, "").trim();
      if (raw) headers[target] = raw;
    }
  }

  return headers;
}

export function parseVlcOpt(optLine: string): ChannelHeaders | null {
  const raw = optLine.slice("#EXTVLCOPT:".length).trim();
  const eq = raw.indexOf("=");
  if (eq <= 0) return null;
  const key = raw.slice(0, eq).trim().toLowerCase();
  const value = raw.slice(eq + 1).trim();
  if (!value) return null;
  if (key === "http-user-agent") return { "User-Agent": value };
  if (key === "http-referrer" || key === "http-referer") return { Referer: value };
  if (key === "http-origin") return { Origin: value };
  // Return generic for unknown opts — preserved for forward compat
  return { [key]: value };
}

export function isAbsoluteUrl(line: string): boolean {
  return line.includes("://") || line.startsWith("/") || line.startsWith("rtmp") || line.startsWith("rtsp");
}
