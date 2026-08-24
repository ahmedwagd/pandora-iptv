import { MediaImage } from "./MediaImage";

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

export function PosterGrid({ items, onOpen, emptyText }: PosterGridProps) {
  if (items.length === 0) {
    return <p className="poster-grid-empty">{emptyText ?? "Nothing here yet."}</p>;
  }

  return (
    <div className="poster-grid">
      {items.map((item) => (
        <button key={item.id} className="poster-card" onClick={() => onOpen(item.id)}>
          <MediaImage
            src={item.poster}
            alt=""
            className="poster-card-img"
            placeholderClassName="poster-card-placeholder"
            fallback={item.name[0] ?? "?"}
          />
          <span className="poster-card-title">{item.name}</span>
        </button>
      ))}
    </div>
  );
}
