import { useCallback, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseM3U } from "../lib/m3uParser";
import type { Channel } from "../types";

export function usePlaylist() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);

  const loadFromUrl = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      // Use the Tauri HTTP plugin rather than window.fetch: it runs
      // outside the webview's CORS restrictions, which most public
      // IPTV playlist hosts don't set headers for.
      const res = await tauriFetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseM3U(text);
      if (parsed.length === 0) throw new Error("No channels found — check the playlist URL.");
      setChannels(parsed);
      setSourceLabel(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load playlist.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromFile = useCallback(async () => {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "Playlist", extensions: ["m3u", "m3u8", "txt"] }],
    });
    if (!path || typeof path !== "string") return;

    setLoading(true);
    try {
      const text = await readTextFile(path);
      const parsed = parseM3U(text);
      if (parsed.length === 0) throw new Error("No channels found in this file.");
      setChannels(parsed);
      setSourceLabel(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read file.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { channels, loading, error, sourceLabel, loadFromUrl, loadFromFile };
}
