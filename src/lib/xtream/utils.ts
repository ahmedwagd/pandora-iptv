import type { XtreamCategory } from "./types";

export function normalizeServer(server: string): string {
  let base = server.trim();
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base.replace(/\/+$/, "");
}

export function categoryNameMap(categories: XtreamCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [c.category_id, c.category_name]));
}

export function yearFromDate(date?: string | null): string | undefined {
  if (!date) return undefined;
  const m = date.match(/^(\d{4})/);
  return m ? m[1] : undefined;
}

export function ratingString(rating?: string | number | null): string | undefined {
  if (rating == null) return undefined;
  const n = Number(rating);
  return Number.isFinite(n) ? n.toFixed(1) : undefined;
}

export function toTimestamp(exp: string | number | null | undefined): number | null {
  if (exp == null || exp === "") return null;
  const n = Number(exp);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? n : n * 1000;
}

export function formatExpDate(exp: string | number | null | undefined): string | null {
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
