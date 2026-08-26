import { useEffect, useMemo, useState } from "react";
interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}
export function CommandPalette({
  open,
  onClose,
  commands,
  query,
  onQuery,
}: {
  open: boolean;
  onClose: () => void;
  commands: Cmd[];
  query: string;
  onQuery: (s: string) => void;
}) {
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(t) || (c.hint ?? "").toLowerCase().includes(t)
    );
  }, [commands, query]);
  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(filtered.length - 1, a + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[active]?.run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, onClose]);
  if (!open) return null;
  return (
    <div className="cmd-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="cmd-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          placeholder="Type a command… (Home, Movies, Series, Settings)"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Command search"
        />
        <div className="cmd-list" role="listbox">
          {filtered.length === 0 && <div className="cmd-empty">No commands</div>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? "cmd-item active" : "cmd-item"}
              onClick={() => {
                c.run();
                onClose();
              }}
            >
              <span>{c.label}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cmd-foot">↑↓ navigate · Enter run · Esc close</div>
      </div>
    </div>
  );
}
