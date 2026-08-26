import { memo, useMemo, useState } from "react";
import type { Channel, MovieDetail, Season, Series } from "../types";
import { ChannelList } from "./ChannelList";
import { MediaImage } from "./MediaImage";

interface CommonProps {
  onBack: () => void;
  onWatch: (channel: Channel) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onRefresh?: () => void;
}

type DetailProps = CommonProps &
  (
    | { kind: "movie"; channel: Channel; detail: MovieDetail | null; detailLoading: boolean }
    | { kind: "series"; series: Series; seasons: Season[]; episodesLoading: boolean }
  );

const DetailHeader = memo(function DetailHeader({
  onBack,
  onRefresh,
  isLoading,
}: {
  onBack: () => void;
  onRefresh?: () => void;
  isLoading: boolean;
}) {
  return (
    <header className="cinematic-top">
      <button className="cinematic-round" onClick={onBack} aria-label="Back">
        <span aria-hidden>←</span>
      </button>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="cinematic-round"
          onClick={onRefresh}
          aria-label="Refresh"
          title="Refresh"
          disabled={!onRefresh || isLoading}
          style={{ opacity: onRefresh ? 1 : 0.45, cursor: onRefresh ? "pointer" : "default" }}
        >
          <span aria-hidden className={isLoading ? "spin" : ""}>
            ↻
          </span>
        </button>
      </div>
    </header>
  );
});

const Backdrop = memo(function Backdrop({ backdrop }: { backdrop?: string }) {
  return (
    <div className="cinematic-backdrop-wrap" aria-hidden>
      {backdrop ? (
        <div className="cinematic-backdrop" style={{ backgroundImage: `url(${JSON.stringify(backdrop)})` }} />
      ) : (
        <div className="cinematic-backdrop cinematic-backdrop--fallback" />
      )}
      <div className="cinematic-gradient" />
      <div className="cinematic-scan" aria-hidden />
    </div>
  );
});

const Bento = memo(function Bento({
  cast,
  genre,
  rating,
}: {
  cast?: string;
  genre?: string;
  rating?: string;
}) {
  return (
    <>
      <div className="cinematic-divider" />
      <div className="cinematic-bento">
        <div className="bento-cell">
          <span className="bento-label">Cast — principal</span>
          <span className="bento-value" style={{ fontSize: 14, lineHeight: "1.45" }}>
            {cast ?? "—"}
          </span>
        </div>
        <div className="bento-cell">
          <span className="bento-label">Genre · Master</span>
          <span className="bento-value">{genre ? `${genre} · 4K HDR` : "—"}</span>
        </div>
        <div className="bento-cell">
          <span className="bento-label">Audio · Container</span>
          <span className="bento-value">Dolby Atmos 5.1 · 48 kHz</span>
        </div>
        <div className="bento-cell">
          <span className="bento-label">Rating · Signal</span>
          <span className="bento-value bento-value--with-icon">
            <span aria-hidden style={{ color: "var(--primary-container)" }}>
              ★
            </span>{" "}
            {rating ?? "—"} <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", marginLeft: 6 }}>BT.709</span>
          </span>
        </div>
      </div>
    </>
  );
});

const SeasonSection = memo(function SeasonSection({
  seasons,
  episodesLoading,
  onWatch,
  favoriteIds,
  onToggleFavorite,
}: {
  seasons: Season[];
  episodesLoading: boolean;
  onWatch: (c: Channel) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
}) {
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const selectedSeason = useMemo(() => {
    if (seasons.length === 0) return null;
    return seasons.find((s) => s.number === seasonNumber) ?? seasons[0];
  }, [seasons, seasonNumber]);

  if (episodesLoading) return <p className="cinematic-note">Loading episodes…</p>;
  if (seasons.length === 0) return <p className="cinematic-note">No episodes found.</p>;

  return (
    <>
      {seasons.length > 1 && (
        <div className="season-picker">
          {seasons.map((s) => (
            <button
              key={s.number}
              type="button"
              className={`season-pick ${s.number === selectedSeason?.number ? "active" : ""}`}
              onClick={() => setSeasonNumber(s.number)}
              aria-pressed={s.number === selectedSeason?.number}
            >
              {s.name} <span className="season-pick-count">{s.episodes.length}</span>
            </button>
          ))}
        </div>
      )}
      {selectedSeason && (
        <div className="season-block">
          <div className="season-title">
            {selectedSeason.name} · {selectedSeason.episodes.length} episodes
          </div>
          <ChannelList
            channels={selectedSeason.episodes}
            activeId={null}
            favoriteIds={favoriteIds}
            onSelect={onWatch}
            onToggleFavorite={onToggleFavorite}
            showFavorite={false}
          />
        </div>
      )}
    </>
  );
});

export function DetailPage(props: DetailProps) {
  const { onBack, onWatch, favoriteIds, onToggleFavorite, onRefresh } = props;

  const title = props.kind === "movie" ? props.channel.name : props.series.name;
  const poster = props.kind === "movie" ? props.channel.logo : props.series.cover;
  const coverImage = props.kind === "movie" ? props.detail?.backdrop ?? props.detail?.poster ?? poster : undefined;
  const backdrop = coverImage;

  const year = props.kind === "movie" ? props.detail?.year : props.series.year;
  const rating = props.kind === "movie" ? props.detail?.rating : props.series.rating;
  const genre = props.kind === "movie" ? props.detail?.genre : props.series.genre;
  const duration = props.kind === "movie" ? props.detail?.duration : undefined;
  const plot = props.kind === "movie" ? props.detail?.plot : props.series.plot;
  const cast = props.kind === "movie" ? props.detail?.cast : props.series.cast;

  const isFavorite =
    props.kind === "movie"
      ? favoriteIds.has(props.channel.id)
      : favoriteIds.has(`series:${props.series.id}`);

  const handleFavorite = () => {
    if (props.kind === "movie") onToggleFavorite(props.channel.id);
    else onToggleFavorite(`series:${props.series.id}`);
  };

  const handleWatch = () => {
    if (props.kind === "movie") onWatch(props.channel);
  };

  const ghostNum = useMemo(() => {
    const seed = title.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const n = (seed % 99) + 1;
    return `CH ${String(n).padStart(2, "0")}`;
  }, [title]);

  const isLoading = props.kind === "movie" ? props.detailLoading : props.episodesLoading;

  return (
    <div className="detail detail--cinematic">
      <DetailHeader onBack={onBack} onRefresh={onRefresh} isLoading={isLoading} />

      <div className="cinematic-scroll">
        <div className="cinematic-smpte" aria-hidden>
          <div className="colorbar colorbar--loading" style={{ height: 3 }} />
        </div>

        <Backdrop backdrop={backdrop} />

        <div className="cinematic-content">
          <span className="cinematic-ghost" aria-hidden>
            {ghostNum}
          </span>

          <div className="cinematic-grid">
            <div className="cinematic-poster-wrap">
              <div className="cinematic-poster-frame">
                <MediaImage
                  src={poster}
                  alt=""
                  className="cinematic-poster"
                  placeholderClassName="cinematic-poster-placeholder"
                  fallback={title[0] ?? "?"}
                />
              </div>
            </div>

            <div className="cinematic-info">
              <p className="cinematic-eyebrow">
                <span className="signal-dot" aria-hidden>
                  ●
                </span>{" "}
                {props.kind === "movie" ? "Feature" : "Series"} · {year ?? "—"} · {duration ?? "—"}
                <span style={{ opacity: 0.5, marginLeft: 8 }}>— {ghostNum} · 59.94 Hz</span>
              </p>

              <h1 className="cinematic-title">{title}</h1>

              <div className="cinematic-meta">
                {year && <span className="chip chip--solid">{year}</span>}
                {rating && (
                  <>
                    <span className="chip-dot">·</span>
                    <span className="chip chip--outline chip--signal" title="Content rating">
                      {rating}
                    </span>
                  </>
                )}
                {genre && (
                  <>
                    <span className="chip-dot">·</span>
                    <span className="chip-text" title={genre}>
                      {genre}
                    </span>
                  </>
                )}
                {duration && (
                  <>
                    <span className="chip-dot">·</span>
                    <span className="chip-text">{duration}</span>
                  </>
                )}
                <span className="chip-dot">·</span>
                <span className="chip chip--solid chip--with-icon" title="Master">
                  <span className="chip-icon">4K</span> HDR
                </span>
              </div>

              {props.kind === "movie" && props.detailLoading && (
                <p className="cinematic-note">
                  <span className="inline-loader" aria-hidden />
                  Loading details…
                </p>
              )}

              {plot ? (
                <p className="cinematic-plot">{plot}</p>
              ) : (
                !isLoading && <p className="cinematic-plot cinematic-plot--muted">No synopsis available for this title.</p>
              )}

              <div className="cinematic-actions">
                {props.kind === "movie" ? (
                  <button type="button" className="cinematic-watch" onClick={handleWatch}>
                    <span className="cinematic-watch-icon">▶</span> Watch
                  </button>
                ) : (
                  <button type="button" className="cinematic-watch" onClick={handleFavorite}>
                    <span className="cinematic-watch-icon">★</span> {isFavorite ? "Favorited" : "Add to favorites"}
                  </button>
                )}
                <button
                  type="button"
                  className={`cinematic-icon-btn ${isFavorite ? "is-active" : ""}`}
                  onClick={handleFavorite}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  aria-pressed={isFavorite}
                >
                  <span aria-hidden>★</span>
                </button>
              </div>
            </div>
          </div>

          <Bento cast={cast} genre={genre} rating={rating} />

          {props.kind === "series" && (
            <div className="cinematic-series">
              <SeasonSection
                seasons={props.seasons}
                episodesLoading={props.episodesLoading}
                onWatch={onWatch}
                favoriteIds={favoriteIds}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
