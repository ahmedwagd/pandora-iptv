import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Grid, type CellComponentProps } from "react-window";
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
  getPosition?: (id: string) => { position: number; duration: number } | undefined;
}

function isResumableCard(pos: number, dur: number): boolean {
  if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
  if (pos < 10) return false;
  if (dur - pos < 15) return false;
  const pct = pos / dur;
  return pct > 0.01 && pct < 0.985;
}

function fmtResumeCard(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const PosterCardMemo = memo(function PosterCardMemo({
  item,
  onOpen,
  onRemove,
  showRemove,
  favoriteIds,
  onToggleFavorite,
  getPosition,
  isFocused,
  onFocusCard,
}: {
  item: PosterCard;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  getPosition?: (id: string) => { position: number; duration: number } | undefined;
  isFocused?: boolean;
  onFocusCard?: () => void;
}) {
  const isFav = favoriteIds
    ? favoriteIds.has(item.id) || favoriteIds.has(`series:${item.id}`)
    : false;
  const saved = getPosition?.(item.id);
  const resumable = saved ? isResumableCard(saved.position, saved.duration) : false;
  const pct = resumable && saved ? Math.min(100, Math.max(0, (saved.position / saved.duration) * 100)) : 0;
  const rovingTabIndex = isFocused === undefined ? 0 : isFocused ? 0 : -1;
  return (
    <div className="poster-card-wrap" role="gridcell">
      <button
        type="button"
        className="poster-card"
        onClick={() => onOpen(item.id)}
        aria-label={item.name}
        tabIndex={rovingTabIndex}
        data-poster-id={item.id}
        onFocus={onFocusCard}
      >
        <MediaImage
          src={item.poster}
          alt={item.name}
          className="poster-card-img"
          placeholderClassName="poster-card-placeholder"
          fallback={item.name[0] ?? "?"}
        />
        {resumable && saved && (
          <>
            <div
              className="ch-progress poster-progress"
              style={{ position: "absolute", bottom: "32px", left: 0, right: 0, height: 2 } as React.CSSProperties}
              aria-hidden
            >
              <span className="ch-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="poster-resume-label" aria-hidden>
              ↺ {fmtResumeCard(saved.position)} / {fmtResumeCard(saved.duration)}
            </span>
          </>
        )}
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
          tabIndex={isFocused === undefined ? 0 : isFocused ? 0 : -1}
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
          tabIndex={isFocused === undefined ? 0 : isFocused ? 0 : -1}
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

export const PAGE_SIZE = 60;
export const VIRTUALIZE_THRESHOLD = 200;
export const OOM_WARN_THRESHOLD = 120;

function useVirtualPosterEnabled(itemCount?: number): boolean {
  const [isDisabled, setIsDisabled] = useState<boolean>(() => {
    try {
      const checkDisabled = (v: string | null) => v === "0" || v === "false" || v === "off";
      if (checkDisabled(localStorage.getItem("panora:virtualPoster"))) return true;
      if (checkDisabled(localStorage.getItem("virtualPoster"))) return true;
      if (checkDisabled(localStorage.getItem("panora:virtualPosterEnabled"))) return true;
      if (checkDisabled(localStorage.getItem("virtualPosterEnabled"))) return true;
    } catch {}
    return false;
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getValue } = await import("../lib/store");
        const vals: (boolean | string | null | undefined)[] = await Promise.all([
          getValue<boolean | string>("virtualPoster"),
          getValue<boolean | string>("virtualPosterEnabled"),
          getValue<boolean | string>("panora:virtualPoster"),
        ]);
        if (cancelled) return;
        for (const stored of vals) {
          if (stored === false || stored === "0" || stored === "false" || stored === "off") {
            setIsDisabled(true);
            return;
          }
        }
        // if previously disabled but now stored is explicitly enabled, clear disabled
        // any truthy "1"/"true" means not disabled
        for (const stored of vals) {
          if (stored === true || stored === "1" || stored === "true") {
            setIsDisabled(false);
            return;
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (
        e.key === "panora:virtualPoster" ||
        e.key === "virtualPoster" ||
        e.key === "panora:virtualPosterEnabled" ||
        e.key === "virtualPosterEnabled"
      ) {
        const v = e.newValue;
        if (v === "0" || v === "false" || v === "off") setIsDisabled(true);
        else if (v === "1" || v === "true" || v === "on") setIsDisabled(false);
        else if (v == null) {
          // removed -> not disabled (default enabled for large)
          setIsDisabled(false);
        }
      }
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  // Phase 1: virtualization default for > VIRTUALIZE_THRESHOLD unless explicitly disabled via flag
  if (typeof itemCount === "number") {
    if (itemCount > VIRTUALIZE_THRESHOLD) {
      return !isDisabled;
    }
    return false;
  }
  // fallback when called without count (backwards compat): treat as enabled if not disabled
  return !isDisabled;
}

const GRID_GAP = 16;

function getColumnCount(width: number): number {
  const count = Math.floor((width + GRID_GAP) / (148 + GRID_GAP));
  return Math.max(2, Math.min(6, count || 4));
}

interface GridCellProps {
  items: PosterCard[];
  columnCount: number;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  getPosition?: (id: string) => { position: number; duration: number } | undefined;
  focusedIndex?: number;
  onFocusItem?: (idx: number) => void;
}

function VirtualCell({
  columnIndex,
  rowIndex,
  style,
  ariaAttributes,
  items,
  columnCount,
  onOpen,
  onRemove,
  showRemove,
  favoriteIds,
  onToggleFavorite,
  getPosition,
  focusedIndex,
  onFocusItem,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex;
  if (index >= items.length) return null;
  const item = items[index];
  const isFocused = focusedIndex !== undefined ? index === focusedIndex : undefined;
  return (
    <div
      style={{
        ...style,
        paddingRight: GRID_GAP,
        paddingBottom: GRID_GAP,
        boxSizing: "border-box",
      }}
      role="gridcell"
      aria-colindex={ariaAttributes?.["aria-colindex"]}
    >
      <PosterCardMemo
        item={item}
        onOpen={onOpen}
        onRemove={onRemove}
        showRemove={showRemove}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        getPosition={getPosition}
        isFocused={isFocused}
        onFocusCard={onFocusItem ? () => onFocusItem(index) : undefined}
      />
    </div>
  );
}

function VirtualPosterGrid(props: PosterGridProps) {
  const { items, onOpen, onRemove, showRemove, favoriteIds, onToggleFavorite, getPosition } = props;
  const outerRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<{ scrollToCell: (args: { rowIndex: number; columnIndex: number }) => void; element: HTMLDivElement | null } | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const [focusedIndex, setFocusedIndex] = useState(0);
  useEffect(() => setFocusedIndex((prev) => (prev >= items.length ? 0 : prev)), [items.length]);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width || el.clientWidth || 800);
      const h = Math.floor(rect.height || el.clientHeight || 600);
      const finalH = h > 100 ? h : Math.floor(window.innerHeight * 0.6) || 600;
      setDims({ width: w > 100 ? w : 800, height: finalH });
    };
    update();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } catch {
      // fallback
    }
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const columnCount = useMemo(() => getColumnCount(dims.width), [dims.width]);
  const columnWidth = useMemo(
    () => Math.floor((dims.width - (columnCount - 1) * GRID_GAP) / columnCount),
    [dims.width, columnCount]
  );
  const rowHeight = useMemo(() => Math.floor(columnWidth * 1.5 + 44 + GRID_GAP), [columnWidth]);
  const rowCount = Math.ceil(items.length / columnCount);

  const cellProps = useMemo(
    () => ({ items, columnCount, onOpen, onRemove, showRemove, favoriteIds, onToggleFavorite, getPosition, focusedIndex, onFocusItem: (idx: number) => setFocusedIndex(idx) }),
    [items, columnCount, onOpen, onRemove, showRemove, favoriteIds, onToggleFavorite, getPosition, focusedIndex]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    const total = items.length;
    let next = focusedIndex;
    let handled = true;
    switch (e.key) {
      case "ArrowRight":
        next = Math.min(total - 1, focusedIndex + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, focusedIndex - 1);
        break;
      case "ArrowDown":
        next = Math.min(total - 1, focusedIndex + columnCount);
        break;
      case "ArrowUp":
        next = Math.max(0, focusedIndex - columnCount);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = total - 1;
        break;
      case "PageDown": {
        const rowsPerPage = Math.max(1, Math.floor((dims.height || 600) / rowHeight) - 1);
        next = Math.min(total - 1, focusedIndex + columnCount * rowsPerPage);
        break;
      }
      case "PageUp": {
        const rowsPerPage = Math.max(1, Math.floor((dims.height || 600) / rowHeight) - 1);
        next = Math.max(0, focusedIndex - columnCount * rowsPerPage);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const id = items[focusedIndex]?.id;
        if (id) onOpen(id);
        return;
      }
      default:
        handled = false;
        break;
    }
    if (handled) {
      e.preventDefault();
      if (next !== focusedIndex) {
        setFocusedIndex(next);
        const r = Math.floor(next / columnCount);
        const c = next % columnCount;
        try {
          gridApiRef.current?.scrollToCell({ rowIndex: r, columnIndex: c });
        } catch {}
        // focus the button after scroll
        requestAnimationFrame(() => {
          const container = outerRef.current ?? gridApiRef.current?.element;
          if (!container) return;
          const btn = container.querySelector(`[data-poster-id="${items[next]?.id}"]`) as HTMLElement | null;
          btn?.focus();
        });
      }
    }
  };

  return (
    <div
      ref={outerRef}
      role="grid"
      aria-label="Posters"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onFocus={(e) => {
        // when container receives focus via tab, redirect to focused card
        if (e.target === outerRef.current) {
          const container = gridApiRef.current?.element ?? outerRef.current;
          const btn = container?.querySelector(`[data-poster-id="${items[focusedIndex]?.id}"]`) as HTMLElement | null;
          btn?.focus();
        }
      }}
      style={{
        flex: 1,
        minHeight: 400,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        width: "100%",
      }}
    >
      <Grid
        gridRef={gridApiRef as never}
        cellComponent={VirtualCell}
        cellProps={cellProps}
        columnCount={columnCount}
        columnWidth={columnWidth}
        rowCount={rowCount}
        rowHeight={rowHeight}
        style={{ width: "100%", height: "100%" } as React.CSSProperties}
        overscanCount={2}
        defaultWidth={dims.width}
        defaultHeight={dims.height}
      />
    </div>
  );
}

export function PosterGrid({
  items,
  onOpen,
  emptyText,
  onRemove,
  showRemove,
  favoriteIds,
  onToggleFavorite,
  getPosition,
}: PosterGridProps) {
  const shouldVirtualize = useVirtualPosterEnabled(items.length);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [columnCount, setColumnCount] = useState(4);
  useEffect(() => setVisible(PAGE_SIZE), [items]);
  useEffect(() => {
    if (shouldVirtualize) return;
    if (focusedIndex >= items.length) setFocusedIndex(items.length > 0 ? 0 : 0);
  }, [items.length, focusedIndex, shouldVirtualize]);
  useEffect(() => {
    if (shouldVirtualize) return;
    const el = gridRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || el.getBoundingClientRect().width || 800;
      setColumnCount(getColumnCount(w));
    };
    update();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } catch {}
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [shouldVirtualize, visible]);
  useEffect(() => {
    if (shouldVirtualize) return;
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
  }, [visible, items.length, shouldVirtualize]);
  // also fallback: if grid scroll reaches bottom (for browsers without IntersectionObserver root)
  useEffect(() => {
    if (shouldVirtualize) return;
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
  }, [visible, items.length, shouldVirtualize]);

  if (shouldVirtualize) {
    return <VirtualPosterGrid items={items} onOpen={onOpen} emptyText={emptyText} onRemove={onRemove} showRemove={showRemove} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} getPosition={getPosition} />;
  }
  if (items.length === 0) {
    return (
      <div className="poster-grid-empty">
        <EmptyState message={emptyText ?? "Nothing here yet."} />
      </div>
    );
  }

  const shown = items.slice(0, visible);
  const showOomBanner = items.length > OOM_WARN_THRESHOLD;
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (shown.length === 0) return;
    const total = items.length;
    let next = focusedIndex;
    let handled = true;
    switch (e.key) {
      case "ArrowRight":
        next = Math.min(total - 1, focusedIndex + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, focusedIndex - 1);
        break;
      case "ArrowDown":
        next = Math.min(total - 1, focusedIndex + columnCount);
        break;
      case "ArrowUp":
        next = Math.max(0, focusedIndex - columnCount);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = total - 1;
        break;
      case "PageDown": {
        const el = gridRef.current;
        const rowH = 220; // approx card height + gap
        const rowsPerPage = el ? Math.max(1, Math.floor(el.clientHeight / rowH) - 1) : 3;
        next = Math.min(total - 1, focusedIndex + columnCount * rowsPerPage);
        break;
      }
      case "PageUp": {
        const el = gridRef.current;
        const rowH = 220;
        const rowsPerPage = el ? Math.max(1, Math.floor(el.clientHeight / rowH) - 1) : 3;
        next = Math.max(0, focusedIndex - columnCount * rowsPerPage);
        break;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        onOpen(items[focusedIndex]?.id ?? shown[focusedIndex]?.id);
        return;
      default:
        handled = false;
        break;
    }
    if (handled) {
      e.preventDefault();
      if (next !== focusedIndex) {
        if (next >= visible) {
          setVisible(Math.min(total, Math.max(visible, next + 1)));
        }
        setFocusedIndex(next);
        requestAnimationFrame(() => {
          const container = gridRef.current;
          if (!container) return;
          const id = items[next]?.id;
          const btn = container.querySelector(`[data-poster-id="${id}"]`) as HTMLElement | null;
          if (btn) {
            btn.focus();
            btn.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        });
      }
    }
  };

  return (
    <>
      {showOomBanner && (
        <div
          className="poster-oom-banner"
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.02em",
            color: "var(--on-surface-variant)",
            background: "rgba(46,230,168,0.06)",
            borderBottom: "1px solid rgba(46,230,168,0.12)",
          }}
        >
          Showing {Math.min(visible, items.length)} of {items.length} — scroll to load more (virtualization coming 1.8)
        </div>
      )}
      <div
        ref={gridRef}
        className="poster-grid"
        role="grid"
        aria-label="Posters"
        tabIndex={-1}
        onKeyDown={handleGridKeyDown}
        onFocus={(e) => {
          if (e.target === gridRef.current) {
            const id = items[focusedIndex]?.id;
            const btn = gridRef.current?.querySelector(`[data-poster-id="${id}"]`) as HTMLElement | null;
            btn?.focus();
          }
        }}
      >
        {shown.map((item, idx) => (
          <PosterCardMemo
            key={item.id}
            item={item}
            onOpen={onOpen}
            onRemove={onRemove}
            showRemove={showRemove}
            favoriteIds={favoriteIds}
            onToggleFavorite={onToggleFavorite}
            getPosition={getPosition}
            isFocused={idx === focusedIndex}
            onFocusCard={() => setFocusedIndex(idx)}
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
