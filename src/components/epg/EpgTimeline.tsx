import { useEffect, useMemo, useState } from "react";
import type { EpgProgramme } from "../../types/epg";

function fmtClock(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function fmtRange(p: EpgProgramme) {
  return `${fmtClock(p.startTime)}–${fmtClock(p.stopTime)}`;
}

export function EpgTimeline({
  programmes,
  channelName,
  onReminder,
  hasReminder,
}: {
  programmes: EpgProgramme[];
  channelName: string;
  onReminder?: (p: EpgProgramme) => void;
  hasReminder?: (p: EpgProgramme) => boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const day = useMemo(() => {
    if (programmes.length === 0) return null;
    const start = Math.min(...programmes.map((p) => p.startTime));
    const end = Math.max(...programmes.map((p) => p.stopTime));
    // clamp to 24h window around now
    const windowStart = Math.min(start, now - 2 * 3600 * 1000);
    const windowEnd = Math.max(end, now + 6 * 3600 * 1000);
    const span = windowEnd - windowStart;
    return { windowStart, windowEnd, span };
  }, [programmes, now]);

  if (programmes.length === 0) {
    return (
      <div className="epg-timeline epg-timeline--empty">
        <span className="epg-empty">
          No programme data — EPG will populate when the provider sends it.
        </span>
      </div>
    );
  }
  const sorted = [...programmes].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="epg-timeline" role="list" aria-label={`EPG for ${channelName}`}>
      <div className="epg-timeline-bar">
        {sorted.map((p) => {
          if (!day) return null;
          const left = ((p.startTime - day.windowStart) / day.span) * 100;
          const width = ((p.stopTime - p.startTime) / day.span) * 100;
          const isNow = p.startTime <= now && now < p.stopTime;
          const isPast = p.stopTime < now;
          const pct = isNow ? ((now - p.startTime) / (p.stopTime - p.startTime)) * 100 : 0;
          const reminder = hasReminder?.(p) ?? false;
          return (
            <div
              key={`${p.channelId}-${p.startTime}`}
              className={`epg-blk ${isNow ? "is-now" : ""} ${isPast ? "is-past" : ""} `}
              style={{ left: left + "%", width: Math.max(width, 0.6) + "%" }}
              role="listitem"
              title={`${p.title} · ${fmtRange(p)}${p.description ? " — " + p.description : ""}`}
            >
              <span className="epg-blk-title">{p.title}</span>
              <span className="epg-blk-time">{fmtClock(p.startTime)}</span>
              {isNow && (
                <span className="epg-blk-progress">
                  <span className="epg-blk-progress-fill" style={{ width: pct + "%" }} />
                </span>
              )}
              {isNow && <span className="epg-live-dot" aria-label="Live" />}
              {onReminder && !isPast && (
                <button
                  type="button"
                  className={`epg-remind ${reminder ? "is-on" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReminder(p);
                  }}
                  aria-label={reminder ? "Remove reminder" : "Remind me"}
                  aria-pressed={reminder}
                  title={reminder ? "Remove reminder" : "Remind me"}
                >
                  {reminder ? "🔔" : "⏰"}
                </button>
              )}
            </div>
          );
        })}
        {day && now >= day.windowStart && now <= day.windowEnd && (
          <span
            className="epg-now-line"
            style={{ left: ((now - day.windowStart) / day.span) * 100 + "%" }}
            aria-hidden
          />
        )}
      </div>
      <div className="epg-timeline-labels" aria-hidden>
        <span>{fmtClock(day!.windowStart)}</span>
        <span>{fmtClock(now)}</span>
        <span>{fmtClock(day!.windowEnd)}</span>
      </div>
      <div className="epg-timeline-nownext">
        {(() => {
          const n = sorted.find((p) => p.startTime <= now && now < p.stopTime);
          const nxt = n ? sorted[sorted.indexOf(n) + 1] : sorted.find((p) => p.startTime > now);
          return (
            <>
              {n ? (
                <span className="epg-nn epg-nn--now">
                  <span className="epg-live-pill">
                    <span className="epg-live-pill-dot" />
                    Now
                  </span>{" "}
                  {n.title} <span className="epg-nn-time">{fmtRange(n)}</span>
                </span>
              ) : (
                <span className="epg-nn epg-nn--empty">No current programme</span>
              )}
              {nxt && (
                <span className="epg-nn epg-nn--next">
                  Next: {nxt.title} <span className="epg-nn-time">{fmtRange(nxt)}</span>
                </span>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
