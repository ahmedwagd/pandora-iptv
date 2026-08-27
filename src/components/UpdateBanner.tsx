import type { UpdaterState } from "../hooks/useUpdater";
import { useLang } from "../hooks/useLang";
import { strings } from "../i18n";

interface Props {
  updater: UpdaterState;
  onView: () => void;
}

export function UpdateBanner({ updater, onView }: Props) {
  const { lang } = useLang();
  const s = strings[lang];

  if (!updater.info?.available || !updater.info.latestVersion) return null;
  if (updater.isDismissed) return null;

  const version = updater.info.latestVersion;
  const body = updater.info.body ? ` — ${updater.info.body.slice(0, 90)}` : "";

  return (
    <div
      className="banner banner-info"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        position: "relative",
        zIndex: 5,
      }}
      role="status"
      aria-live="polite"
    >
      <span style={{ flex: 1, minWidth: 180 }}>
        <strong>{s.updateAvailable}</strong>: {version}
        <span style={{ opacity: 0.85 }}>{body}</span>
        {updater.downloading && (
          <span style={{ display: "inline-block", marginLeft: 8, fontSize: 11, color: "var(--signal)" }}>
            {updater.progress ?? 0}%
          </span>
        )}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="set-opt"
          style={{ padding: "4px 10px", fontSize: 11 }}
          onClick={onView}
        >
          {s.viewUpdate}
        </button>
        {updater.needsRestart ? (
          <button
            type="button"
            className="set-btn"
            style={{
              background: "var(--primary-container)",
              color: "var(--surface)",
              borderColor: "transparent",
              padding: "6px 12px",
              fontSize: 11,
            }}
            onClick={() => updater.restart()}
          >
            {s.restartNow}
          </button>
        ) : (
          <button
            type="button"
            className="set-btn"
            style={{
              background: "var(--primary-container)",
              color: "var(--surface)",
              borderColor: "transparent",
              padding: "6px 12px",
              fontSize: 11,
            }}
            onClick={() => updater.install()}
            disabled={updater.checking || updater.downloading}
          >
            {updater.downloading ? `${s.installing} ${updater.progress ?? 0}%` : s.downloadAndInstall}
          </button>
        )}
        <button
          type="button"
          className="set-opt"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => updater.dismiss()}
          aria-label={s.dismiss}
          title={s.dismiss}
          disabled={updater.downloading}
        >
          ✕
        </button>
      </span>
    </div>
  );
}
