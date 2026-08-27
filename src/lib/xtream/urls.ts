import type { XtreamCreds } from "../../types";
import type { XtreamAccountInfo, XtreamLiveStream } from "./types";
import { XTREAM_COMMON_PORTS, XTREAM_MAX_ALT_BASES } from "./constants";
import { normalizeServer } from "./utils";

function buildApiUrl(creds: XtreamCreds, action?: string): string {
  const base = normalizeServer(creds.server);
  const user = encodeURIComponent(creds.username);
  const pass = encodeURIComponent(creds.password);
  let url = `${base}/player_api.php?username=${user}&password=${pass}`;
  if (action) url += `&action=${action}`;
  return url;
}

function buildCredsPath(creds: XtreamCreds): string {
  return `${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}`;
}

export function buildXtreamLiveUrl(creds: XtreamCreds, streamId: number): string {
  return `${normalizeServer(creds.server)}/live/${buildCredsPath(creds)}/${streamId}.m3u8`;
}

export function buildXtreamMovieUrl(creds: XtreamCreds, streamId: number, extension: string): string {
  return `${normalizeServer(creds.server)}/movie/${buildCredsPath(creds)}/${streamId}.${extension}`;
}

export function buildXtreamEpisodeUrl(creds: XtreamCreds, episodeId: string, extension: string): string {
  return `${normalizeServer(creds.server)}/series/${buildCredsPath(creds)}/${episodeId}.${extension}`;
}

export function buildXtreamCatchupUrl(
  creds: XtreamCreds,
  streamId: number,
  startSec: number,
  endSec: number
): string {
  return `${normalizeServer(creds.server)}/live/${buildCredsPath(creds)}/${streamId}-${startSec}-${endSec}.m3u8`;
}

export function parseCatchup(s: XtreamLiveStream): { days: number; source: string } | null {
  const arch = s.tv_archive as unknown;
  if (arch == null || arch === 0 || arch === "0" || arch === false || arch === "false") return null;
  const enabled = arch === 1 || arch === "1" || arch === true || String(arch) === "1";
  if (!enabled) return null;
  const daysRaw = s.tv_archive_duration;
  const days = daysRaw != null && String(daysRaw).trim() !== "" ? Number(daysRaw) : 1;
  return { days: Number.isFinite(days) && days > 0 ? days : 1, source: s.direct_source ?? "" };
}

export function buildXtreamAltBases(
  creds: XtreamCreds,
  serverInfo: XtreamAccountInfo["server_info"]
): string[] {
  const primary = normalizeServer(creds.server);
  const alts: string[] = [];
  const push = (b: string) => {
    const n = b.replace(/\/+$/, "");
    if (n && n !== primary && !alts.includes(n)) alts.push(n);
  };
  if (serverInfo?.url) {
    const urlBase = normalizeServer(String(serverInfo.url));
    const hasPort = /:\d+$/.test(urlBase);
    if (!hasPort) {
      if (String(serverInfo.https_port ?? "").trim() && urlBase.startsWith("https://"))
        push(`${urlBase}:${String(serverInfo.https_port).trim()}`);
      if (String(serverInfo.port ?? "").trim() && urlBase.startsWith("http://"))
        push(`${urlBase}:${String(serverInfo.port).trim()}`);
    }
    push(urlBase);
    try {
      const u = new URL(urlBase);
      const host = u.hostname;
      const proto = u.protocol;
      if (serverInfo.port && proto === "https:") push(`http://${host}:${String(serverInfo.port).trim()}`);
      if (serverInfo.https_port && proto === "http:") push(`https://${host}:${String(serverInfo.https_port).trim()}`);
    } catch { /* ignore */ }
  }
  try {
    const u = new URL(primary);
    const host = u.hostname;
    if (u.protocol === "http:" && serverInfo?.https_port) push(`https://${host}:${String(serverInfo.https_port).trim()}`);
    if (u.protocol === "https:" && serverInfo?.port) push(`http://${host}:${String(serverInfo.port).trim()}`);
  } catch { /* ignore */ }
  if (alts.length === 0) {
    try {
      const u = new URL(primary);
      const hasPort = /:\d+$/.test(primary);
      if (!hasPort) {
        const host = u.hostname;
        for (const p of XTREAM_COMMON_PORTS) {
          push(`${u.protocol}//${host}:${p}`);
          const flipped = u.protocol === "http:" ? "https:" : "http:";
          push(`${flipped}//${host}:${p}`);
          if (alts.length >= XTREAM_MAX_ALT_BASES) break;
        }
      }
    } catch { /* ignore */ }
  }
  return alts.slice(0, XTREAM_MAX_ALT_BASES);
}

export function buildXtreamLiveAltUrls(
  creds: XtreamCreds,
  streamId: number,
  altBases: string[]
): string[] {
  if (altBases.length === 0) return [];
  const credsPath = buildCredsPath(creds);
  return altBases.map((b) => `${b}/live/${credsPath}/${streamId}.m3u8`);
}

export { buildApiUrl, buildCredsPath };
