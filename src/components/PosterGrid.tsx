import { memo, useEffect, useRef, useState } from "react";
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
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
}

const PosterCardMemo = memo(function PosterCardMemo({
  item,
  onOpen,
  onRemove,
  showRemove,
  favoriteIds,
  onToggleFavorite,
}: {
  item: PosterCard;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
}) {
  const isFav = favoriteIds
    ? favoriteIds.has(item.id) || favoriteIds.has(`series:${item.id}`)
    : false;
  return (
    <div className="poster-card-wrap">
      <button
        type="button"
        className="poster-card"
        onClick={() => onOpen(item.id)}
        aria-label={item.name}
      >
        <MediaImage
          src={item.poster}
          alt={item.name}
          className="poster-card-img"
          placeholderClassName="poster-card-placeholder"
          fallback={item.name[0] ?? "?"}
        />
        <span className="poster-card-title">{item.name}</span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          className={`poster-fav ${isFav ? "is-fav" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item.id);
          }}
          aria-label={
            isFav ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`
          }
          aria-pressed={isFav}
          title={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          {isFav ? "★" : "☆"}
        </button>
      )}
      {showRemove && onRemove && (
        <button
          type="button"
          className="poster-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          aria-label={`Remove ${item.name} from watched`}
          title="Remove from watched"
          data-tip="Remove"
        >
          ✕
        </button>
      )}
    </div>
  );
});

function PosterSkeleton() {
  return (
    <div className="poster-card skeleton">
      <div className="skeleton-img" />
      <div className="skeleton-line" />
    </div>
  );
}
export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="poster-grid">
      {Array.from({ length: count }).map((_, i) => (
        <PosterSkeleton key={i} />
      ))}
    </div>
  );
}

const PAGE_SIZE = 60;
export function PosterGrid({
  items,
  onOpen,
  emptyText,
  onRemove,
  showRemove,
  favoriteIds,
  onToggleFavorite,
}: PosterGridProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setVisible(PAGE_SIZE), [items]);
  useEffect(() => {
    if (visible >= items.length) return;
    const sentinel = sentinelRef.current;
    const root = gridRef.current;
    if (!sentinel) return;
    try {
      if (typeof IntersectionObserver === "undefined") return;
      const obs = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => Math.min(items.length, v + PAGE_SIZE));
        }
      }, { root: root ?? undefined, rootMargin: "320px 0px", threshold: 0 });
      obs.observe(sentinel);
      return () => obs.disconnect();
    } catch {}
  }, [visible, items.length]);
  // also fallback: if grid scroll reaches bottom (for browsers without IntersectionObserver root)
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onScroll = () => {
      if (visible >= items.length) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 320) {
        setVisible((v) => Math.min(items.length, v + PAGE_SIZE));
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [visible, items.length]);
  if (items.length === 0) {
    return (
      <div className="poster-grid-empty">
        <EmptyState message={emptyText ?? "Nothing here yet."} />
      </div>
    );
  }

  const shown = items.slice(0, visible);
  return (
    <>
      <div ref={gridRef} className="poster-grid">
        {shown.map((item) => (
          <PosterCardMemo
            key={item.id}
            item={item}
            onOpen={onOpen}
            onRemove={onRemove}
            showRemove={showRemove}
            favoriteIds={favoriteIds}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
        {visible < items.length && <div ref={sentinelRef} aria-hidden style={{ height: 1, gridColumn: "1 / -1" }} />}
      </div>
      {visible < items.length && (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 16px", opacity: 0.7, fontFamily: "var(--font-mono)", fontSize: 11 }} aria-live="polite">
          {items.length - visible} more — scroll to load
        </div>
      )}
    </>
  );
}
