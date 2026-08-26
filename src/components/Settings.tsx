import type { Profile } from "../types/profile";
import type { XtreamAccount } from "../lib/xtream";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { useSkipDuration } from "../hooks/useSkipDuration";
import { useVideoZoom, FIT_MODES } from "../hooks/useVideoZoom";
import { usePlaybackSpeed } from "../hooks/usePlaybackSpeed";

interface SettingsProps {
  profiles: Profile[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  account: XtreamAccount | null;
  username: string | null;
  onDisconnect: () => void;
}

export function Settings({ profiles, activeId, onSwitch, onCreate, onDelete, onBack, account, username, onDisconnect }: SettingsProps) {
  const active = profiles.find((p) => p.id === activeId) ?? null;
  const { skipDuration, setSkipDuration } = useSkipDuration();
  const { fitMode, saveFitMode } = useVideoZoom();
  const { speed, saveSpeed, SPEED_OPTIONS } = usePlaybackSpeed();
  return (
    <div className="settings">
      <header className="settings-header">
        <button type="button" className="detail-back" onClick={onBack} aria-label="Back">
          Back
        </button>
        <h1 className="settings-title">Settings</h1>
      </header>

      <div className="settings-body">
        <section className="settings-section">
          <h2 className="settings-section-title">Profiles</h2>
          <p className="settings-section-desc">Switch between saved accounts. Each profile keeps its own favorites and watch history.</p>
          <div className="settings-card">
            <ProfileSwitcher profiles={profiles} activeId={activeId} onSwitch={onSwitch} onCreate={onCreate} onDelete={onDelete} />
            {active && <p className="settings-active">Active: {active.name}</p>}
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Account</h2>
          <div className="settings-card settings-account">
            <div className="settings-row">
              <span className="settings-label">Username</span>
              <span className="settings-value">{account?.username ?? username ?? "-"}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Status</span>
              <span className="settings-value">{account?.status ?? "-"}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Expiration</span>
              <span className={`settings-value ${account?.expTimestamp && account.expTimestamp <= Date.now() + 7 * 86400000 ? "settings-value--warn" : ""}`}>
                {account?.expDateFormatted ?? "No expiration"}
                {account?.isTrial && " - Trial"}
              </span>
            </div>
            {account?.maxConnections && (
              <div className="settings-row">
                <span className="settings-label">Connections</span>
                <span className="settings-value">{account.activeConnections ?? "-"} / {account.maxConnections}</span>
              </div>
            )}
            {account?.createdAt && (
              <div className="settings-row">
                <span className="settings-label">Created</span>
                <span className="settings-value">{new Date(Number(account.createdAt) * 1000).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Playback</h2>
          <p className="settings-section-desc">Skip, speed, and subtitle defaults. Changes apply to the player immediately.</p>
          <div className="settings-card settings-playback">
            <div className="settings-row">
              <span className="settings-label">Skip duration</span>
              <span className="settings-value">{skipDuration}s</span>
            </div>
            <div className="settings-skip-pills">
              {[5, 10, 15, 30].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`settings-skip-pill ${skipDuration === v ? "active" : ""}`}
                  onClick={() => setSkipDuration(v)}
                >
                  {v}s
                </button>
              ))}
            </div>
            <label className="settings-skip-custom">
              <span className="settings-label">Custom (5-60s)</span>
              <input
                type="number"
                min={5}
                max={60}
                step={1}
                value={skipDuration}
                onChange={(e) => setSkipDuration(Number(e.target.value))}
                className="settings-skip-input"
              />
            </label>
            <div className="settings-row" style={{ marginTop: 12 }}>
              <span className="settings-label">Playback speed</span>
              <span className="settings-value">{speed}x</span>
            </div>
            <div className="settings-skip-pills">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`settings-skip-pill ${speed === s ? "active" : ""}`}
                  onClick={() => saveSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
            <p className="settings-hint">Default is 1x. Use , and . keys to step speed, or CC/A buttons for subs/audio.</p>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Video</h2>
          <p className="settings-section-desc">Adjust how video fills the player. Fit keeps whole picture, Cover fills and crops, Fill stretches. Zoom 50% to 200%.</p>
          <div className="settings-card settings-playback">
            <div className="settings-row">
              <span className="settings-label">Fit mode</span>
              <span className="settings-value">{FIT_MODES.find((f) => f.mode === fitMode)?.label ?? fitMode}</span>
            </div>
            <div className="settings-skip-pills">
              {FIT_MODES.map((f) => (
                <button
                  key={f.mode}
                  type="button"
                  className={`settings-skip-pill ${fitMode === f.mode ? "active" : ""}`}
                  onClick={() => saveFitMode(f.mode)}
                  title={f.mode}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="settings-hint">Z cycles fit mode. Saved automatically.</p>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Session</h2>
          <div className="settings-card">
            <button type="button" className="settings-logout" onClick={onDisconnect}>
              Exit and logout current profile
            </button>
            <p className="settings-hint">This clears the saved credentials for the active profile only.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
