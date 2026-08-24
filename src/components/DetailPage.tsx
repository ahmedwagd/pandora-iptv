import { useMemo, useState } from "react";
import type { Channel, MovieDetail, Season, Series } from "../types";
import { ChannelList } from "./ChannelList";
import { MediaImage } from "./MediaImage";

interface CommonProps {
  onBack: () => void;
  onWatch: (channel: Channel) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
}

type DetailProps = CommonProps &
  (
    | { kind: "movie"; channel: Channel; detail: MovieDetail | null; detailLoading: boolean }
    | { kind: "series"; series: Series; seasons: Season[]; episodesLoading: boolean }
  );

function metaLine(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

export function DetailPage(props: DetailProps) {
  const { onBack, onWatch, favoriteIds, onToggleFavorite } = props;
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);

  const title = props.kind === "movie" ? props.channel.name : props.series.name;
  const poster =
    props.kind === "movie" ? props.channel.logo : props.series.cover;

  const meta =
    props.kind === "movie"
      ? metaLine([props.detail?.year, props.detail?.rating, props.detail?.genre, props.detail?.duration])
      : metaLine([props.series.year, props.series.rating, props.series.genre]);

  const plot = props.kind === "movie" ? props.detail?.plot : props.series.plot;
  const cast = props.kind === "movie" ? props.detail?.cast : props.series.cast;

  const seasons = props.kind === "series" ? props.seasons : [];
  const selectedSeason = useMemo(() => {
    if (seasons.length === 0) return null;
    return seasons.find((s) => s.number === seasonNumber) ?? seasons[0];
  }, [seasons, seasonNumber]);

  return (
    <div className="detail">
      <header className="detail-topbar">
        <button className="detail-back" onClick={onBack}>
          ← Back
        </button>
      </header>

      <div className="detail-scroll">
        <div className="detail-hero">
          <div className="detail-hero-scrim" />
          <div className="detail-hero-content">
            {poster && (
              <MediaImage
                src={poster}
                alt=""
                className="detail-poster"
                placeholderClassName="detail-poster-placeholder"
                fallback={title[0] ?? "?"}
              />
            )}
            <div className="detail-hero-text">
              <h1 className="detail-title">{title}</h1>
              {meta && <div className="detail-meta">{meta}</div>}
            </div>
          </div>
        </div>

        <div className="detail-body">
          {props.kind === "movie" && (
            <>
              {props.detailLoading && <p className="detail-note">Loading details…</p>}
              {plot && <p className="detail-plot">{plot}</p>}
              {cast && (
                <p className="detail-cast">
                  <span>Cast</span> {cast}
                </p>
              )}
              <div className="detail-actions">
                <button className="watch-btn" onClick={() => onWatch(props.channel)}>
                  Watch
                </button>
                <button
                  className={`watch-fav ${favoriteIds.has(props.channel.id) ? "active" : ""}`}
                  onClick={() => onToggleFavorite(props.channel.id)}
                  aria-label="Toggle favorite"
                >
                  ★
                </button>
              </div>
            </>
          )}

          {props.kind === "series" && (
            <>
              {plot && <p className="detail-plot">{plot}</p>}
              {cast && (
                <p className="detail-cast">
                  <span>Cast</span> {cast}
                </p>
              )}
              <div className="detail-actions">
                <button
                  className={`detail-fav ${favoriteIds.has(`series:${props.series.id}`) ? "active" : ""}`}
                  onClick={() => onToggleFavorite(`series:${props.series.id}`)}
                >
                  ★ {favoriteIds.has(`series:${props.series.id}`) ? "Favorited" : "Favorite"}
                </button>
              </div>
              {props.episodesLoading ? (
                <p className="detail-note">Loading episodes…</p>
              ) : seasons.length === 0 ? (
                <p className="detail-note">No episodes found.</p>
              ) : (
                <div className="detail-seasons">
                  {seasons.length > 1 && (
                    <div className="season-picker">
                      {seasons.map((s) => (
                        <button
                          key={s.number}
                          className={`season-pick ${s.number === selectedSeason?.number ? "active" : ""}`}
                          onClick={() => setSeasonNumber(s.number)}
                        >
                          {s.name}
                          <span className="season-pick-count">{s.episodes.length}</span>
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
