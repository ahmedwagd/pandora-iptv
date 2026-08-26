function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ResumePrompt({
  position,
  duration,
  title,
  onResume,
  onRestart,
}: {
  position: number;
  duration: number;
  title?: string;
  onResume: () => void;
  onRestart: () => void;
}) {
  const pct = duration > 0 ? Math.round((position / duration) * 100) : 0;
  return (
    <div className="resume-overlay" role="dialog" aria-modal="true" aria-label="Resume playback">
      <div className="resume-card">
        <div className="resume-eyebrow">Continue watching</div>
        {title && (
          <div className="resume-title" title={title}>
            {title}
          </div>
        )}
        <div className="resume-meta">
          Resume from <strong>{fmt(position)}</strong>
          {Number.isFinite(duration) && duration > 0 && (
            <>
              {" "}
              of {fmt(duration)} · {pct}%
            </>
          )}
          ?
        </div>
        <div className="resume-progress" aria-hidden>
          <div
            className="resume-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <div className="resume-actions">
          <button
            type="button"
            className="resume-btn resume-btn--primary"
            autoFocus
            onClick={onResume}
          >
            ▶ Resume
          </button>
          <button type="button" className="resume-btn resume-btn--ghost" onClick={onRestart}>
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
