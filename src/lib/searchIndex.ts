import type { Channel, Series } from "../types";

export type SearchKind = "live" | "movie" | "series";

export interface SearchItem {
  id: string;
  kind: SearchKind;
  name: string;
  group: string;
  logo?: string;
  original: Channel | Series;
}

export function buildSearchIndex(opts: {
  channels: Channel[];
  movies: Channel[];
  series: Series[];
}): SearchItem[] {
  const out: SearchItem[] = [];
  for (const c of opts.channels) out.push({ id: c.id, kind: "live", name: c.name, group: c.group, logo: c.logo, original: c });
  for (const c of opts.movies) out.push({ id: c.id, kind: "movie", name: c.name, group: c.group, logo: c.logo, original: c });
  for (const s of opts.series) out.push({ id: s.id, kind: "series", name: s.name, group: s.group, logo: s.cover, original: s });
  return out;
}

export const SEARCH_SCORING = {
  EXACT: 100,
  PREFIX: 80,
  SUBSTRING_BASE: 60,
  SUBSTRING_DECAY: 0.5,
  GROUP: 30,
  EPG_BOOST: 45,
  DEFAULT_LIMIT: 30,
} as const;

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function score(name: string, group: string, q: string): number {
  const n = normalizeForSearch(name);
  const g = normalizeForSearch(group);
  if (n === q) return SEARCH_SCORING.EXACT;
  if (n.startsWith(q)) return SEARCH_SCORING.PREFIX;
  const idx = n.indexOf(q);
  if (idx >= 0) return SEARCH_SCORING.SUBSTRING_BASE - idx * SEARCH_SCORING.SUBSTRING_DECAY;
  if (g.includes(q)) return SEARCH_SCORING.GROUP;
  return 0;
}

export interface RankedItem extends SearchItem {
  score: number;
}

export function rankResults(
  index: SearchItem[],
  query: string,
  opts?: { getEpgForChannel?: (id: string) => { now?: { title: string }; next?: { title: string } } | undefined; limit?: number }
): RankedItem[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [];
  const limit = opts?.limit ?? SEARCH_SCORING.DEFAULT_LIMIT;
  const ranked: RankedItem[] = [];
  for (const item of index) {
    let s = score(item.name, item.group, q);
    if (item.kind === "live" && opts?.getEpgForChannel) {
      const epg = opts.getEpgForChannel(item.id);
      const nowTitle = normalizeForSearch(epg?.now?.title ?? "");
      const nextTitle = normalizeForSearch(epg?.next?.title ?? "");
      if (nowTitle.includes(q) || nextTitle.includes(q)) s = Math.max(s, SEARCH_SCORING.EPG_BOOST);
    }
    if (s > 0) ranked.push({ ...item, score: s });
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked.slice(0, limit);
}

export function groupRanked(ranked: RankedItem[]): Record<SearchKind, RankedItem[]> {
  const g: Record<SearchKind, RankedItem[]> = { live: [], movie: [], series: [] };
  for (const r of ranked) g[r.kind].push(r);
  return g;
}
