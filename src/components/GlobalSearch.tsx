import { useEffect, useMemo, useState } from "react";
import type { RankedItem } from "../lib/searchIndex";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  query: string;
  onQuery: (s: string) => void;
  recent: string[];
  onRecentClick: (term: string) => void;
  onClearRecent: () => void;
  results: RankedItem[];
  onSelect: (item: RankedItem) => void;
  commands: Cmd[];
}

export function GlobalSearch({
  open,
  onClose,
  query,
  onQuery,
  recent,
  onRecentClick,
  onClearRecent,
  results,
  onSelect,
  commands,
}: GlobalSearchProps) {
  const [active, setActive] = useState(0);

  const filteredCmds = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(t) || (c.hint ?? "").toLowerCase().includes(t)
    );
  }, [commands, query]);

  const flat: Array<{ kind: "result"; item: RankedItem } | { kind: "cmd"; cmd: Cmd }> = useMemo(() => {
    const a: Array<{ kind: "result"; item: RankedItem } | { kind: "cmd"; cmd: Cmd }> = [];
    for (const r of results) a.push({ kind: "result", item: r });
    for (const c of filteredCmds) a.push({ kind: "cmd", cmd: c });
    return a;
  }, [results, filteredCmds]);

  useEffect(() => setActive(0), [query, open, results.length, filteredCmds.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(flat.length - 1, a + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cur = flat[active];
        if (!cur) return;
        if (cur.kind === "result") {
          onSelect(cur.item);
          onClose();
        } else {
          cur.cmd.run();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, active, onClose, onSelect]);

  if (!open) return null;

  const grouped = {
    live: results.filter((r) => r.kind === "live"),
    movie: results.filter((r) => r.kind === "movie"),
    series: results.filter((r) => r.kind === "series"),
  };

  let cursor = 0;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="cmd-palette gs-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          placeholder="Search live, movies, series… (also try Home, Settings)"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Global search"
        />

        {!query.trim() && recent.length > 0 && (
          <div className="gs-recent">
            <div className="gs-section-label">
              <span>Recent</span>
              <button type="button" className="gs-clear" onClick={onClearRecent}>Clear</button>
            </div>
            <div className="gs-chips">
              {recent.map((t) => (
                <button key={t} type="button" className="gs-chip" onClick={() => onRecentClick(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cmd-list gs-list" role="listbox">
          {flat.length === 0 && <div className="cmd-empty">No results. Try another keyword.</div>}

          {grouped.live.length > 0 && (
            <>
              <div className="gs-section-label">Live — {grouped.live.length}</div>
              {grouped.live.map((r) => {
                const idx = cursor++;
                return (
                  <button
                    key={`r-${r.kind}-${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={idx === active ? "cmd-item active" : "cmd-item"}
                    onClick={() => { onSelect(r); onClose(); }}
                  >
                    <span className="gs-kind">LIVE</span>
                    <span>{r.name}</span>
                    <span className="cmd-hint">{r.group}</span>
                  </button>
                );
              })}
            </>
          )}
          {grouped.movie.length > 0 && (
            <>
              <div className="gs-section-label">Movies — {grouped.movie.length}</div>
              {grouped.movie.map((r) => {
                const idx = cursor++;
                return (
                  <button
                    key={`r-${r.kind}-${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={idx === active ? "cmd-item active" : "cmd-item"}
                    onClick={() => { onSelect(r); onClose(); }}
                  >
                    <span className="gs-kind">MOVIE</span>
                    <span>{r.name}</span>
                    <span className="cmd-hint">{r.group}</span>
                  </button>
                );
              })}
            </>
          )}
          {grouped.series.length > 0 && (
            <>
              <div className="gs-section-label">Series — {grouped.series.length}</div>
              {grouped.series.map((r) => {
                const idx = cursor++;
                return (
                  <button
                    key={`r-${r.kind}-${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={idx === active ? "cmd-item active" : "cmd-item"}
                    onClick={() => { onSelect(r); onClose(); }}
                  >
                    <span className="gs-kind">SERIES</span>
                    <span>{r.name}</span>
                    <span className="cmd-hint">{r.group}</span>
                  </button>
                );
              })}
            </>
          )}

          {filteredCmds.length > 0 && (
            <>
              <div className="gs-section-label">Commands</div>
              {filteredCmds.map((c) => {
                const idx = cursor++;
                return (
                  <button
                    key={`c-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={idx === active ? "cmd-item active" : "cmd-item"}
                    onClick={() => { c.run(); onClose(); }}
                  >
                    <span>{c.label}</span>
                    {c.hint && <span className="cmd-hint">{c.hint}</span>}
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="cmd-foot">↑↓ navigate · Enter open · Esc close · Recent searches saved per profile</div>
      </div>
    </div>
  );
}
