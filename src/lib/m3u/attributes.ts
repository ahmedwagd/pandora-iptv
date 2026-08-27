export type ChannelAttributes = Record<string, string>;

/**
 * Parses M3U EXTINF attributes like tvg-id="..." group-title="...".
 * Uses a local regex per call to avoid global lastIndex state.
 */
export function parseAttributes(line: string): ChannelAttributes {
  const attrs: ChannelAttributes = {};
  const re = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}
