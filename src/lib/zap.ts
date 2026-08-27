import type { Channel } from "../types";

export function zapStep(list: Channel[], currentId: string | null, delta: number): Channel | null {
  if (list.length === 0) return null;
  const idx = currentId ? list.findIndex((c) => c.id === currentId) : -1;
  if (idx === -1) return list[0] ?? null;
  const next = (idx + delta + list.length) % list.length;
  return list[next] ?? null;
}

export function zapNeighbors(list: Channel[], currentId: string | null, radius = 3): Channel[] {
  if (list.length === 0) return [];
  if (list.length === 1) return [...list];
  const idx = currentId ? list.findIndex((c) => c.id === currentId) : 0;
  const center = idx === -1 ? 0 : idx;
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (let d = -radius; d <= radius; d++) {
    const i = (center + d + list.length) % list.length;
    const ch = list[i];
    if (ch && !seen.has(ch.id)) {
      seen.add(ch.id);
      out.push(ch);
    }
    if (out.length >= list.length) break;
  }
  return out;
}
