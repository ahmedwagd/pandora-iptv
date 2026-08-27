import type { XtreamCreds } from "../../types";
import type { EpgMap, EpgProgramme } from "../../types/epg";
import type { FetchFn } from "./types";
import { fetchJson } from "./http";
import { buildApiUrl } from "./urls";

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

export function parseEpgTime(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? n : n * 1000;
  }
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

export function toEpgProgramme(raw: XtreamEpgListing, fallbackChannelId: string): EpgProgramme | null {
  const title = raw.title ?? raw.name ?? "";
  if (!title) return null;
  const channelId = String(raw.channel_id ?? raw.id ?? raw.epg_id ?? raw.stream_id ?? fallbackChannelId);
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

export function extractListings(data: unknown): XtreamEpgListing[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.epg_listings)) return obj.epg_listings as XtreamEpgListing[];
  if (obj.epg_listings && typeof obj.epg_listings === "object" && !Array.isArray(obj.epg_listings)) {
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
        nextProg = p;
        break;
      }
    }
    if (!nowProg && progs.length > 0 && !nextProg) {
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

export type { XtreamEpgListing, XtreamSimpleDataTableResponse, XtreamShortEpgResponse };
export { buildEpgMap };
