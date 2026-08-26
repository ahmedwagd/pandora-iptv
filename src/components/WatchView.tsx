import type { Channel } from "../types";
import type { EpgProgramme } from "../types/epg";
import { Player } from "./Player";

interface WatchViewProps {
  channel: Channel;
  onBack: () => void;
  epgNow?: EpgProgramme;
  epgNext?: EpgProgramme;
}

function formatEpgTime(p: EpgProgramme): string {
  const s = new Date(p.startTime);
  const e = new Date(p.stopTime);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

export function WatchView({ channel, onBack, epgNow, epgNext }: WatchViewProps) {
  return (
    <div className="watch">
      <header className="watch-bar">
        <button type="button" className="watch-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="watch-bar-info">
          <span className="watch-title">{channel.name}</span>
          <span className="watch-meta">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {channel.group} · Live
            {epgNow && (
              <span className="watch-epg" title={epgNow.description}>
                {" "}· Now: {epgNow.title} ({formatEpgTime(epgNow)})
              </span>
            )}
            {!epgNow && epgNext && (
              <span className="watch-epg watch-epg--next"> · Next: {epgNext.title} ({formatEpgTime(epgNext)})</span>
            )}
          </span>
        </div>
      </header>
      <div className="watch-stage">
        <Player channel={channel} onBack={onBack} />
      </div>
    </div>
  );
}
