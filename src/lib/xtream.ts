import type { Channel, MovieDetail, Season, Series, XtreamCreds } from "../types";
import type { EpgMap, EpgProgramme } from "../types/epg";

interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon: string | null;
  epg_channel_id: string | null;
  category_id: string;
  tv_archive?: string | number | boolean | null;
  tv_archive_duration?: string | number | null;
  direct_source?: string | null;
}

interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon: string | null;
  category_id: string;
  container_extension: string;
}

interface XtreamSeriesEntry {
  series_id: number;
  name: string;
  cover: string | null;
  category_id: string;
  plot?: string | null;
  cast?: string | null;
  genre?: string | null;
  rating?: string | number | null;
  releaseDate?: string | null;
}

interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  season: number;
}

interface XtreamSeason {
  season_number: number;
  name: string;
  cover?: string | null;
}

interface XtreamSeriesInfo {
  info?: {
    cover?: string | null;
  };
  seasons?: XtreamSeason[];
  episodes?: Record<string, XtreamEpisode[]> | XtreamEpisode[];
}

interface XtreamVodInfo {
  info?: {
    movie_image?: string | null;
    backdrop?: string | null;
    plot?: string | null;
    cast?: string | null;
    genre?: string | null;
    rating?: string | number | null;
    releasedate?: string | null;
    duration?: string | null;
    backdrop_path?: string[] | null;
    director?: string | null;
    country?: string | null;
    duration_secs?: string | number | null;
  };
}

interface XtreamAccountInfo {
  user_info?: {
    auth?: number;
    status?: string;
    username?: string;
    password?: string;
    exp_date?: string | number | null;
    is_trial?: string | number | null;
    active_cons?: string | number | null;
    created_at?: string | number | null;
    max_connections?: string | number | null;
    allowed_output_formats?: string[] | null;
    message?: string | null;
  };
  server_info?: {
    url?: string | null;
    port?: string | number | null;
    https_port?: string | number | null;
    server_protocol?: string | null;
    rtmp_port?: string | number | null;
    timezone?: string | null;
    timestamp_now?: number | null;
  };
}

export interface XtreamAccount {
  username?: string;
  status: string | null;
  auth: number;
  expDate: string | null;
  expTimestamp: number | null;
  expDateFormatted: string | null;
  isTrial: boolean;
  maxConnections: string | null;
  activeConnections: string | null;
  createdAt: string | null;
  message: string | null;
}

export type FetchFn = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 1;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  if (!timeoutMs) return signal;
  const timeoutSignal =
    typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
  if (!timeoutSignal) return signal;
  if (!signal) return timeoutSignal;
  // Combine: abort if either aborts
  const combined = new AbortController();
  const onAbort = () => combined.abort(signal.reason ?? timeoutSignal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", () => combined.abort(timeoutSignal.reason), {
    once: true,
  });
  return combined.signal;
}

function normalizeServer(server: string): string {
  let base = server.trim();
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base.replace(/\/+$/, "");
}

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

export function buildXtreamMovieUrl(
  creds: XtreamCreds,
  streamId: number,
  extension: string
): string {
  return `${normalizeServer(creds.server)}/movie/${buildCredsPath(creds)}/${streamId}.${extension}`;
}

export function buildXtreamEpisodeUrl(
  creds: XtreamCreds,
  episodeId: string,
  extension: string
): string {
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

function buildXtreamAltBases(
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
    // Server url may miss port — attach the appropriate port.
    const hasPort = /:\d+$/.test(urlBase);
    if (!hasPort) {
      if (String(serverInfo.https_port ?? "").trim() && urlBase.startsWith("https://"))
        push(`${urlBase}:${String(serverInfo.https_port).trim()}`);
      if (String(serverInfo.port ?? "").trim() && urlBase.startsWith("http://"))
        push(`${urlBase}:${String(serverInfo.port).trim()}`);
    }
    push(urlBase);
    // Also derive the sibling scheme at the same host.
    try {
      const u = new URL(urlBase);
      const host = u.hostname;
      const proto = u.protocol;
      if (serverInfo.port && proto === "https:") push(`http://${host}:${String(serverInfo.port).trim()}`);
      if (serverInfo.https_port && proto === "http:") push(`https://${host}:${String(serverInfo.https_port).trim()}`);
    } catch {}
  }
  // Fallback: flip the primary scheme using the alternate port.
  try {
    const u = new URL(primary);
    const host = u.hostname;
    if (u.protocol === "http:" && serverInfo?.https_port) push(`https://${host}:${String(serverInfo.https_port).trim()}`);
    if (u.protocol === "https:" && serverInfo?.port) push(`http://${host}:${String(serverInfo.port).trim()}`);
  } catch {}
  return alts.slice(0, 2);
}

function buildXtreamLiveAltUrls(
  creds: XtreamCreds,
  streamId: number,
  altBases: string[]
): string[] {
  if (altBases.length === 0) return [];
  const credsPath = buildCredsPath(creds);
  return altBases.map((b) => `${b}/live/${credsPath}/${streamId}.m3u8`);
}

function categoryNameMap(categories: XtreamCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [c.category_id, c.category_name]));
}

function yearFromDate(date?: string | null): string | undefined {
  if (!date) return undefined;
  const m = date.match(/^(\d{4})/);
  return m ? m[1] : undefined;
}

function ratingString(rating?: string | number | null): string | undefined {
  if (rating == null) return undefined;
  const n = Number(rating);
  return Number.isFinite(n) ? n.toFixed(1) : undefined;
}

async function fetchJson<T>(
  fetchFn: FetchFn,
  url: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number; retries?: number }
): Promise<T> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal = withTimeout(opts?.signal, timeoutMs);
      const res = await fetchFn(url, signal ? { signal } : undefined);
      if (!res.ok) {
        // Retry only on 5xx
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      // Don't retry on abort
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (attempt < retries) {
        // Retry on network errors (non-HTTP) as well
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("HTTP") && !msg.includes("HTTP 5")) throw e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function toTimestamp(exp: string | number | null | undefined): number | null {
  if (exp == null || exp === "") return null;
  const n = Number(exp);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Xtream exp_date is unix seconds
  return n > 1e12 ? n : n * 1000;
}

function formatExpDate(exp: string | number | null | undefined): string | null {
  const ts = toTimestamp(exp);
  if (ts == null) return null;
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export async function getXtreamAccount(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<XtreamAccount> {
  const data = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds), opts);
  const u = data.user_info ?? {};
  const ts = toTimestamp(u.exp_date as string | number | null | undefined);
  return {
    username: u.username ?? creds.username,
    status: u.status ?? null,
    auth: typeof u.auth === "number" ? u.auth : Number(u.auth ?? 0),
    expDate: u.exp_date != null ? String(u.exp_date) : null,
    expTimestamp: ts,
    expDateFormatted: formatExpDate(u.exp_date as string | number | null | undefined),
    isTrial: String(u.is_trial ?? "0") === "1",
    maxConnections: u.max_connections != null ? String(u.max_connections) : null,
    activeConnections: u.active_cons != null ? String(u.active_cons) : null,
    createdAt: u.created_at != null ? String(u.created_at) : null,
    message: u.message ?? null,
  };
}

async function assertAuth(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<void> {
  const account = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds), opts);
  const auth = account.user_info?.auth;
  if (auth !== 1) {
    const status = account.user_info?.status;
    throw new Error(status ? `Account is ${status}.` : "Invalid Xtream credentials.");
  }
}
// keep reference for legacy callers
void assertAuth;

export async function getXtreamLiveChannels(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Channel[]> {
  const accountData = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds), opts);
  const auth = accountData.user_info?.auth;
  if (auth !== 1) {
    const status = accountData.user_info?.status;
    throw new Error(status ? `Account is ${status}.` : "Invalid Xtream credentials.");
  }
  const altBases = buildXtreamAltBases(creds, accountData.server_info);

  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_live_categories"), opts),
    fetchJson<XtreamLiveStream[]>(fetchFn, buildApiUrl(creds, "get_live_streams"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return streams.map((s) => {
    const url = buildXtreamLiveUrl(creds, s.stream_id);
    const altRaw = buildXtreamLiveAltUrls(creds, s.stream_id, altBases);
    const altUrls = altRaw.filter((u) => u !== url);
    // Providers sometimes expose the real working stream as direct_source —
    // prefer it as the first fallback over derived port/protocol guesses.
    const direct = s.direct_source && s.direct_source.trim() ? s.direct_source.trim() : null;
    const allAlts = [...(direct && direct !== url ? [direct] : []), ...altUrls];
    const catchup = parseCatchup(s);
    return {
      id: String(s.stream_id),
      name: s.name,
      url,
      ...(allAlts.length ? { altUrls: allAlts } : {}),
      ...(catchup ? { catchup } : {}),
      logo: s.stream_icon ?? undefined,
      group: nameByCat.get(s.category_id) ?? "Uncategorized",
      tvgId: s.epg_channel_id ?? undefined,
      kind: "live" as const,
    };
  });
}

export async function getXtreamMovies(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Channel[]> {
  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_vod_categories"), opts),
    fetchJson<XtreamVodStream[]>(fetchFn, buildApiUrl(creds, "get_vod_streams"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return streams.map((s) => ({
    id: `movie:${s.stream_id}`,
    name: s.name,
    url: buildXtreamMovieUrl(creds, s.stream_id, s.container_extension || "mkv"),
    logo: s.stream_icon ?? undefined,
    group: nameByCat.get(s.category_id) ?? "Uncategorized",
    kind: "movie" as const,
  }));
}

export async function getXtreamSeries(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Series[]> {
  const [categories, series] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_series_categories"), opts),
    fetchJson<XtreamSeriesEntry[]>(fetchFn, buildApiUrl(creds, "get_series"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return series.map((s) => ({
    id: String(s.series_id),
    name: s.name,
    cover: s.cover ?? undefined,
    group: nameByCat.get(s.category_id) ?? "Uncategorized",
    plot: s.plot ?? undefined,
    cast: s.cast ?? undefined,
    genre: s.genre ?? undefined,
    rating: ratingString(s.rating),
    year: yearFromDate(s.releaseDate),
  }));
}

export async function getXtreamMovieDetail(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  streamId: string,
  opts?: { signal?: AbortSignal }
): Promise<MovieDetail> {
  const data = await fetchJson<XtreamVodInfo>(
    fetchFn,
    buildApiUrl(creds, `get_vod_info&vod_id=${encodeURIComponent(streamId)}`),
    opts
  );
  const info = data.info ?? {};
  const backdrop = info.backdrop || info.backdrop_path?.[0] || undefined;

  const durSecs = info.duration_secs != null ? Number(info.duration_secs) : undefined;
  return {
    poster: info.movie_image ?? undefined,
    backdrop,
    plot: info.plot ?? undefined,
    cast: info.cast ?? undefined,
    genre: info.genre ?? undefined,
    rating: ratingString(info.rating),
    year: yearFromDate(info.releasedate),
    duration: info.duration ?? undefined,
    director: info.director ?? undefined,
    country: info.country ?? undefined,
    durationSeconds: Number.isFinite(durSecs as number) ? (durSecs as number) : undefined,
  };
}

export async function getXtreamSeasons(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  seriesId: string,
  opts?: { signal?: AbortSignal }
): Promise<Season[]> {
  const info = await fetchJson<XtreamSeriesInfo>(
    fetchFn,
    buildApiUrl(creds, `get_series_info&series_id=${encodeURIComponent(seriesId)}`),
    opts
  );

  const rawEpisodes = info.episodes ?? {};
  const cover = info.info?.cover ?? undefined;
  let episodesBySeason: Record<string, XtreamEpisode[]> = {};
  if (Array.isArray(rawEpisodes)) {
    episodesBySeason = {};
    for (const ep of rawEpisodes as XtreamEpisode[]) {
      const key = String(ep.season);
      (episodesBySeason[key] ??= []).push(ep);
    }
  } else {
    episodesBySeason = rawEpisodes as Record<string, XtreamEpisode[]>;
  }
  const seasons: Season[] = (info.seasons ?? []).map((s) => ({
    number: s.season_number,
    name: s.name || `Season ${s.season_number}`,
    episodes: (episodesBySeason[String(s.season_number)] ?? []).map((ep) => ({
      id: `episode:${ep.id}`,
      name: ep.title || `S${ep.season} E${ep.episode_num}`,
      url: buildXtreamEpisodeUrl(creds, ep.id, ep.container_extension || "mkv"),
      logo: cover,
      group: s.name || `Season ${s.season_number}`,
      kind: "episode" as const,
    })),
  }));

  seasons.sort((a, b) => a.number - b.number);
  return seasons;
}

/* ── EPG ── */
interface XtreamEpgListing {
  channel_id?: string;
  id?: string;
  epg_id?: string;
  stream_id?: string | number;
  title: string;
  name?: string;
  description?: string;
  descr?: string;
  desc?: string;
  start: string;
  stop?: string;
  end?: string;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
}

interface XtreamSimpleDataTableResponse {
  epg_listings?: XtreamEpgListing[] | Record<string, unknown>;
  [key: string]: unknown;
}

interface XtreamShortEpgResponse {
  epg_listings?: XtreamEpgListing[];
}

function parseEpgTime(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value * 1000 > 1e12 ? value : value * 1000;
  const s = String(value).trim();
  if (!s) return undefined;
  // numeric string timestamp
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? n : n * 1000;
  }
  // "2026-08-26 12:00:00" -> "2026-08-26T12:00:00"
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function toEpgProgramme(raw: XtreamEpgListing, fallbackChannelId: string): EpgProgramme | null {
  const title = raw.title ?? raw.name ?? "";
  if (!title) return null;
  const channelId = String(
    raw.channel_id ?? raw.id ?? raw.epg_id ?? raw.stream_id ?? fallbackChannelId
  );
  const startStr = raw.start;
  const stopStr = raw.stop ?? raw.end ?? "";
  const startTime = parseEpgTime(raw.start_timestamp ?? startStr);
  const stopTime = parseEpgTime(raw.stop_timestamp ?? stopStr);
  if (startTime == null || stopTime == null) return null;
  return {
    channelId,
    title,
    description: raw.description ?? raw.descr ?? raw.desc ?? undefined,
    start: startStr,
    stop: stopStr || startStr,
    startTime,
    stopTime,
  };
}

function extractListings(data: unknown): XtreamEpgListing[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  // common: { epg_listings: [...] }
  if (Array.isArray(obj.epg_listings)) return obj.epg_listings as XtreamEpgListing[];
  // provider quirk: { epg_listings: { "123": {...}, "456": [...] } }
  if (
    obj.epg_listings &&
    typeof obj.epg_listings === "object" &&
    !Array.isArray(obj.epg_listings)
  ) {
    const map = obj.epg_listings as Record<string, unknown>;
    const out: XtreamEpgListing[] = [];
    for (const [cid, val] of Object.entries(map)) {
      if (Array.isArray(val)) {
        for (const v of val) out.push({ ...(v as object), channel_id: cid } as XtreamEpgListing);
      } else if (val && typeof val === "object") {
        out.push({ ...(val as object), channel_id: cid } as XtreamEpgListing);
      }
    }
    return out;
  }
  // fallback: top-level keys are stream_ids with programme(s) as value (no epg_listings wrapper)
  const keys = Object.keys(obj).filter((k) => /^\d+$/.test(k));
  if (keys.length > 0) {
    const out: XtreamEpgListing[] = [];
    for (const k of keys) {
      const val = obj[k];
      if (Array.isArray(val)) {
        for (const v of val) out.push({ ...(v as object), channel_id: k } as XtreamEpgListing);
      } else if (val && typeof val === "object") {
        out.push({ ...(val as object), channel_id: k } as XtreamEpgListing);
      }
    }
    if (out.length > 0) return out;
  }
  return [];
}

function buildEpgMap(listings: XtreamEpgListing[]): EpgMap {
  const now = Date.now();
  const byChannel = new Map<string, XtreamEpgListing[]>();
  for (const raw of listings) {
    const prog = toEpgProgramme(raw, "");
    if (!prog) continue;
    const arr = byChannel.get(prog.channelId) ?? [];
    arr.push(raw);
    byChannel.set(prog.channelId, arr);
  }
  const result: EpgMap = new Map();
  for (const [cid, raws] of byChannel) {
    const progs = raws
      .map((r) => toEpgProgramme(r, cid)!)
      .filter(Boolean)
      .sort((a, b) => a.startTime - b.startTime);
    // find now/next by time
    let nowProg: EpgProgramme | undefined;
    let nextProg: EpgProgramme | undefined;
    for (let i = 0; i < progs.length; i++) {
      const p = progs[i];
      if (p.startTime <= now && now < p.stopTime) {
        nowProg = p;
        nextProg = progs[i + 1];
        break;
      }
      if (p.startTime > now && !nowProg) {
        // before first programme in future
        nextProg = p;
        break;
      }
    }
    // fallback: if no now but we have sorted list, treat first as now (some providers only send 2)
    if (!nowProg && progs.length > 0 && !nextProg) {
      // if all in past, show last; if all in future, show first as next already handled
      const last = progs[progs.length - 1];
      if (last.stopTime < now) nowProg = last;
    }
    if ((nowProg || nextProg) && cid) result.set(cid, { now: nowProg, next: nextProg });
  }
  return result;
}

export async function getXtreamSimpleDataTable(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<EpgMap> {
  const url = buildApiUrl(creds, "get_simple_data_table");
  const data = await fetchJson<XtreamSimpleDataTableResponse>(fetchFn, url, opts);
  const listings = extractListings(data);
  if (listings.length === 0) return new Map();
  return buildEpgMap(listings);
}

export async function getXtreamShortEpg(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  streamId: string,
  opts?: { signal?: AbortSignal }
): Promise<EpgProgramme[]> {
  const url = buildApiUrl(creds, `get_short_epg&stream_id=${encodeURIComponent(streamId)}`);
  const data = await fetchJson<XtreamShortEpgResponse>(fetchFn, url, opts);
  const listings = data.epg_listings ?? extractListings(data);
  return listings
    .map((r) => toEpgProgramme(r, streamId))
    .filter((p): p is EpgProgramme => p != null)
    .sort((a, b) => a.startTime - b.startTime);
}

/** Convenience client wrapping creds + fetchFn + retry/timeout */
export class XtreamClient {
  constructor(
    private creds: XtreamCreds,
    private fetchFn: FetchFn,
    private opts: { timeoutMs?: number; retries?: number } = {}
  ) {}

  live(opts?: { signal?: AbortSignal }) {
    return getXtreamLiveChannels(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  movies(opts?: { signal?: AbortSignal }) {
    return getXtreamMovies(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  series(opts?: { signal?: AbortSignal }) {
    return getXtreamSeries(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  movieDetail(streamId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamMovieDetail(this.creds, this.fetchFn, streamId, { ...this.opts, ...opts });
  }
  seasons(seriesId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamSeasons(this.creds, this.fetchFn, seriesId, { ...this.opts, ...opts });
  }
  simpleDataTable(opts?: { signal?: AbortSignal }) {
    return getXtreamSimpleDataTable(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  shortEpg(streamId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamShortEpg(this.creds, this.fetchFn, streamId, { ...this.opts, ...opts });
  }
  account(opts?: { signal?: AbortSignal }) {
    return getXtreamAccount(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
}
