import type { Channel } from "../types";
import { ColorBar } from "./ColorBar";
import { MediaImage } from "./MediaImage";

interface ChannelListProps {
  channels: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite?: boolean;
}

export function ChannelList({
  channels,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  showFavorite = true,
}: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="channel-list-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <ColorBar className="colorbar--dim" />
        <span>No channels match your search.</span>
      </div>
    );
  }

  return (
    <ul className="channel-list">
      {channels.map((ch, idx) => (
        <li
          key={ch.id}
          className={`channel-row ${ch.id === activeId ? "active" : ""}`}
          onClick={() => onSelect(ch)}
        >
          <span className="channel-num" aria-hidden>
            {String(idx + 1).padStart(2, "0")}
          </span>
          <MediaImage
            src={ch.logo}
            alt=""
            className="channel-logo"
            placeholderClassName="channel-logo-placeholder"
            fallback={ch.name[0] ?? "?"}
          />
          <span className="channel-name">{ch.name}</span>
          {showFavorite && (
            <button
              className={`favorite-btn ${favoriteIds.has(ch.id) ? "is-favorite" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(ch.id);
              }}
              aria-label="Toggle favorite"
            >
              ★
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
