import type { Channel } from "../types";
import { Player } from "./Player";

interface WatchViewProps {
  channel: Channel;
  onBack: () => void;
}

export function WatchView({ channel, onBack }: WatchViewProps) {
  return (
    <div className="watch">
      <header className="watch-bar">
        <button className="watch-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="watch-bar-info">
          <span className="watch-title">{channel.name}</span>
          <span className="watch-meta">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {channel.group} · Live
          </span>
        </div>
      </header>
      <div className="watch-stage">
        <Player channel={channel} />
      </div>
    </div>
  );
}
