import type { Series } from "../types";

interface SeriesListProps {
  series: Series[];
  onOpen: (s: Series) => void;
}

export function SeriesList({ series, onOpen }: SeriesListProps) {
  if (series.length === 0) {
    return <p className="channel-list-empty">No series found.</p>;
  }

  return (
    <ul className="channel-list">
      {series.map((s) => (
        <li key={s.id} className="channel-row" onClick={() => onOpen(s)}>
          {s.cover ? (
            <img src={s.cover} alt="" className="channel-logo" loading="lazy" />
          ) : (
            <div className="channel-logo channel-logo-placeholder">{s.name[0]}</div>
          )}
          <span className="channel-name">{s.name}</span>
        </li>
      ))}
    </ul>
  );
}
