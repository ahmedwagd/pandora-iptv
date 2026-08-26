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

function score(name: string, group: string, q: string): number {
  const n = name.toLowerCase();
  const g = group.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80 - n.indexOf(q);
  const idx = n.indexOf(q);
  if (idx >= 0) return 60 - idx * 0.5;
  // group match
  if (g.includes(q)) return 30;
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
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = opts?.limit ?? 30;
  const ranked: RankedItem[] = [];
  for (const item of index) {
    let s = score(item.name, item.group, q);
    // EPG programme titles boost for live
    if (item.kind === "live" && opts?.getEpgForChannel) {
      const epg = opts.getEpgForChannel(item.id);
      const nowTitle = epg?.now?.title?.toLowerCase() ?? "";
      const nextTitle = epg?.next?.title?.toLowerCase() ?? "";
      if (nowTitle.includes(q) || nextTitle.includes(q)) s = Math.max(s, 45);
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
