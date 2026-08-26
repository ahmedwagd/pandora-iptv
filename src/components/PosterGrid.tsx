import { memo } from "react";
import { MediaImage } from "./MediaImage";
import { EmptyState } from "./shared/EmptyState";

export interface PosterCard {
  id: string;
  name: string;
  poster?: string;
}

interface PosterGridProps {
  items: PosterCard[];
  onOpen: (id: string) => void;
  emptyText?: string;
}

const PosterCardMemo = memo(function PosterCardMemo({
  item,
  onOpen,
}: {
  item: PosterCard;
  onOpen: (id: string) => void;
}) {
  return (
    <button type="button" className="poster-card" onClick={() => onOpen(item.id)} aria-label={item.name}>
      <MediaImage
        src={item.poster}
        alt={item.name}
        className="poster-card-img"
        placeholderClassName="poster-card-placeholder"
        fallback={item.name[0] ?? "?"}
      />
      <span className="poster-card-title">{item.name}</span>
    </button>
  );
});

export function PosterGrid({ items, onOpen, emptyText }: PosterGridProps) {
  if (items.length === 0) {
    return (
      <div className="poster-grid-empty">
        <EmptyState message={emptyText ?? "Nothing here yet."} />
      </div>
    );
  }

  return (
    <div className="poster-grid">
      {items.map((item) => (
        <PosterCardMemo key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
