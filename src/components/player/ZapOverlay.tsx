import type { Channel } from "../../types";
import type { EpgProgramme } from "../../types/epg";

interface ZapOverlayProps {
  list: Channel[];
  currentId: string | null;
  getEpgForChannel?: (id: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;
  onSelect: (ch: Channel) => void;
}

function fmtClock(p: EpgProgramme): string {
  const s = new Date(p.startTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const e = new Date(p.stopTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${s}–${e}`;
}

function progPct(now: EpgProgramme): number {
  const dur = now.stopTime - now.startTime;
  if (dur <= 0) return 0;
  return Math.max(0, Math.min(1, (Date.now() - now.startTime) / dur));
}

export function ZapOverlay({ list, currentId, getEpgForChannel, onSelect }: ZapOverlayProps) {
  return (
    <div className="zap-overlay" role="listbox" aria-label="Zap list">
      {list.map((ch) => {
        const active = ch.id === currentId;
        const epg = getEpgForChannel?.(ch.id);
        return (
          <button
            key={ch.id}
            type="button"
            role="option"
            aria-selected={active}
            className={`zap-row ${active ? "is-active" : ""}`}
            onClick={() => onSelect(ch)}
          >
            <span className="zap-row-main">
              <span className="zap-name">{ch.name}</span>
              {epg?.now ? (
                <span className="zap-now" title={epg.now.title}>
                  <span className="zap-dot" aria-hidden />
                  {epg.now.title}
                  <span className="zap-time">{fmtClock(epg.now)}</span>
                </span>
              ) : epg?.next ? (
                <span className="zap-next">Next: {epg.next.title}</span>
              ) : (
                <span className="zap-group">{ch.group}</span>
              )}
            </span>
            {epg?.now && <span className="zap-progress" aria-hidden><span className="zap-progress-fill" style={{ width: `${progPct(epg.now) * 100}%` }} /></span>}
          </button>
        );
      })}
    </div>
  );
}
