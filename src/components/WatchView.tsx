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
        <button className="watch-back" onClick={onBack}>
          ← Back
        </button>
        <span className="watch-title">{channel.name}</span>
      </header>
      <div className="watch-stage">
        <Player channel={channel} />
      </div>
    </div>
  );
}
