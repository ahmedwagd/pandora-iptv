import type { Channel } from "../types";

interface ChannelListProps {
  channels: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channel: Channel) => void;
}

export function ChannelList({
  channels,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
}: ChannelListProps) {
  if (channels.length === 0) {
    return <p className="channel-list-empty">No channels match your search.</p>;
  }

  return (
    <ul className="channel-list">
      {channels.map((ch) => (
        <li
          key={ch.id}
          className={`channel-row ${ch.id === activeId ? "active" : ""}`}
          onClick={() => onSelect(ch)}
        >
          {ch.logo ? (
            <img src={ch.logo} alt="" className="channel-logo" loading="lazy" />
          ) : (
            <div className="channel-logo channel-logo-placeholder">{ch.name[0]}</div>
          )}
          <span className="channel-name">{ch.name}</span>
          <button
            className={`favorite-btn ${favoriteIds.has(ch.id) ? "is-favorite" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(ch);
            }}
            aria-label="Toggle favorite"
          >
            ★
          </button>
        </li>
      ))}
    </ul>
  );
}
