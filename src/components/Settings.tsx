import { useState } from "react";
import type { Profile } from "../types/profile";
import type { XtreamAccount } from "../lib/xtream";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { ColorBar } from "./ColorBar";
import { useSkipDuration } from "../hooks/useSkipDuration";
import { useVideoZoom, FIT_MODES } from "../hooks/useVideoZoom";
import { usePlaybackSpeed } from "../hooks/usePlaybackSpeed";
import { useTheme } from "../hooks/useTheme";
import { useParental } from "../hooks/useParental";
import { strings, type StringKey } from "../i18n";
import { useLang } from "../hooks/useLang";
import { useEpgEnabled } from "../hooks/useEpgEnabled";
import { useXtreamCreds } from "../hooks/useXtreamCreds";
import { useUpdater } from "../hooks/useUpdater";

const GROUPS = [
  { id: "profiles", labelKey: "profiles" },
  { id: "account", labelKey: "account" },
  { id: "appearance", labelKey: "appearance" },
  { id: "epg", labelKey: "epgGuide" },
  { id: "playback", labelKey: "playback" },
  { id: "video", labelKey: "video" },
  { id: "parental", labelKey: "parental" },
  { id: "updates", labelKey: "updates" },
] as const;
type GroupId = (typeof GROUPS)[number]["id"];
type Strings = Record<StringKey, string>;

function ParentalSettings() {
  const p = useParental();
  const { lang } = useLang();
  const s = strings[lang];
  const [newPin, setNewPin] = useState(p.pin ?? "");
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="set-row">
        <span className="set-row-label">{s.pinCode}</span>
        <span className="set-row-leader" />
        <span className="set-row-value">{p.pin ? s.lockedValue : s.unsetValue}</span>
      </div>
      <div className="set-opts" style={{ alignItems: "center" }}>
        <input
          type="password"
          inputMode="numeric"
          placeholder={s.pinPlaceholder}
          maxLength={4}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
          aria-label={s.pinPlaceholder}
          className="set-input"
        />
        <button type="button" className="set-opt" onClick={() => p.setPin(newPin || null)}>
          {p.pin ? s.updateLabel : s.setLabel}
        </button>
        {p.pin && (
          <button
            type="button"
            className="set-opt set-opt--danger"
            onClick={() => {
              p.setPin(null);
              setNewPin("");
            }}
          >
            {s.clearLabel}
          </button>
        )}
      </div>
      {p.locked.length > 0 && <p className="set-hint">{s.lockedPrefix} {p.locked.join(", ")}</p>}
    </div>
  );
}

function UpdatesSettings() {
  const { lang } = useLang();
  const s = strings[lang];
  const updater = useUpdater();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="set-row">
        <span className="set-row-label">{s.currentVersion}</span>
        <span className="set-row-leader" />
        <span className="set-row-value">{updater.info?.currentVersion ?? "0.1.0"}</span>
      </div>
      {updater.info?.available ? (
        <>
          <div className="set-row">
            <span className="set-row-label">{s.latestVersion}</span>
            <span className="set-row-leader" />
            <span className="set-row-value">{updater.info.latestVersion}</span>
          </div>
          <p className="set-hint">{s.updateAvailable}{updater.info.body ? ` — ${updater.info.body.slice(0, 120)}` : ""}</p>
          <button type="button" className="set-btn" onClick={() => updater.install()}>{s.downloadAndInstall}</button>
        </>
      ) : (
        <p className="set-hint">{updater.checking ? s.checking : s.upToDate}</p>
      )}
      <button type="button" className="set-opt" onClick={() => updater.check()} disabled={updater.checking}>{s.checkForUpdates}</button>
    </div>
  );
}

function fmtDaysLeft(ts: number, s: Strings): string {
  const days = Math.ceil((ts - Date.now()) / 86400000);
  if (days < 0) return s.expired;
  if (days === 0) return s.today;
  return `${days} ${days === 1 ? s.day : s.days}`;
}

function statusText(raw: string | undefined, isAr: boolean, s: Strings): string {
  if (!raw) return "—";
  const low = raw.toLowerCase();
  if (low.includes("activ")) return isAr ? "نشط" : "ACTIVE";
  if (low.includes("expir")) return s.expired;
  if (low.includes("ban")) return isAr ? "محظور" : "BANNED";
  if (low.includes("disabl")) return isAr ? "معطل" : "DISABLED";
  return isAr ? raw : raw.toUpperCase();
}

const fitLabel = (mode: string, s: Strings): string => {
  switch (mode) {
    case "contain":
      return s.fitFit;
    case "cover":
      return s.fitCover;
    case "fill":
      return s.fitFill;
    case "scale-down":
      return s.fitSmall;
    default:
      return "1:1";
  }
};

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

export function Settings({
  profiles,
  activeId,
  onSwitch,
  onCreate,
  onDelete,
  onBack,
  account,
  username,
  onDisconnect,
}: SettingsProps) {
  const active = profiles.find((p) => p.id === activeId) ?? null;
  const { skipDuration, setSkipDuration } = useSkipDuration();
  const { fitMode, saveFitMode } = useVideoZoom();
  const { speed, saveSpeed, SPEED_OPTIONS } = usePlaybackSpeed();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const { enabled: epgPref, setEnabled: setEpgPref } = useEpgEnabled();
  const s = strings[lang];
  const isAr = lang === "ar";
  const [group, setGroup] = useState<GroupId>("profiles");
  const { creds: savedCreds } = useXtreamCreds(activeId);
  const [showPwd, setShowPwd] = useState(false);

  const expTs = account?.expTimestamp;
  const expDate = account?.expDateFormatted;
  const daysLeft = expTs ? Math.ceil((expTs - Date.now()) / 86400000) : null;
  const expWarn = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const expDanger = daysLeft !== null && daysLeft < 0;
  const connTxt = `${account?.activeConnections ?? "—"} / ${account?.maxConnections ?? "—"}`;
  const signalTxt = statusText(account?.status ?? undefined, isAr, s);
  const expTxt = account
    ? `${expDate ?? s.noExpiration}${expTs ? ` · ${fmtDaysLeft(expTs, s)}` : ""}${account.isTrial ? ` · ${s.trial}` : ""}`
    : "—";

  const label = (g: GroupId) => s[GROUPS.find((x) => x.id === g)!.labelKey];

  return (
    <div className="settings">
      <header className="settings-header">
        <button type="button" className="detail-back" onClick={onBack} aria-label={s.back}>
          ←
        </button>
        <div className="set-crumb">
          <span className="set-crumb-static">{s.setup}</span>
          <span className="set-crumb-sep" aria-hidden>
            ▸
          </span>
          <span className="set-crumb-group">{label(group)}</span>
        </div>
        <div className="set-onair" aria-hidden>
          <span className="signal-dot" />
          <span>{s.onAir}</span>
        </div>
      </header>

      <div className="settings-main">
        <nav className="set-rail" aria-label="Settings sections">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`set-rail-item ${group === g.id ? "active" : ""}`}
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
            >
              {label(g.id)}
            </button>
          ))}
        </nav>

        <div className="set-panel">
          {group === "profiles" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.profiles}</h2>
                <p className="set-group-desc">{s.profilesDesc}</p>
              </header>
              <div className="set-card">
                <ProfileSwitcher
                  profiles={profiles}
                  activeId={activeId}
                  onSwitch={onSwitch}
                  onCreate={onCreate}
                  onDelete={onDelete}
                />
                <div className="set-row">
                  <span className="set-row-label">{s.activeLabel}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{active?.name ?? "—"}</span>
                </div>
                <div className="set-row">
                  <span className="set-row-label">{s.signOut}</span>
                  <span className="set-row-leader" />
                  <button type="button" className="set-btn set-btn--danger" onClick={onDisconnect}>
                    {s.signOutBtn}
                  </button>
                </div>
                <p className="set-hint">{s.signOutHint}</p>
              </div>
            </section>
          )}

          {group === "account" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.account}</h2>
                <p className="set-group-desc">{s.accountDesc}</p>
              </header>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-label">{s.username}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{account?.username ?? username ?? "—"}</span>
                </div>
                {savedCreds && (
                  <div className="set-row">
                    <span className="set-row-label">Password</span>
                    <span className="set-row-leader" />
                    <span className="set-row-value" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
                        {showPwd ? savedCreds.password : "••••••••"}
                      </span>
                      <button type="button" className="set-opt" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setShowPwd((v) => !v)}>
                        {showPwd ? "Hide" : "Show"}
                      </button>
                    </span>
                  </div>
                )}
                {savedCreds?.server && (
                  <div className="set-row">
                    <span className="set-row-label">Server</span>
                    <span className="set-row-leader" />
                    <span className="set-row-value" style={{ fontSize: 12, wordBreak: "break-all" }}>{savedCreds.server}</span>
                  </div>
                )}
                <div className="set-row">
                  <span className="set-row-label">{s.status}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{signalTxt}</span>
                </div>
                <div className="set-row">
                  <span className="set-row-label">{s.connections}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{connTxt}</span>
                </div>
                <div className={`set-row ${expWarn ? "warn" : ""} ${expDanger ? "danger" : ""}`}>
                  <span className="set-row-label">{s.expires}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{expTxt}</span>
                </div>
                {account?.createdAt && (
                  <div className="set-row">
                    <span className="set-row-label">{s.created}</span>
                    <span className="set-row-leader" />
                    <span className="set-row-value">
                      {new Date(Number(account.createdAt) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {group === "appearance" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.appearance}</h2>
                <p className="set-group-desc">{s.appearanceDesc}</p>
              </header>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-label">{s.language}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{lang === "en" ? s.langEn : s.langAr}</span>
                </div>
                <div className="set-opts">
                  {(["en", "ar"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`set-opt ${lang === l ? "active" : ""}`}
                      onClick={() => setLang(l)}
                      aria-pressed={lang === l}
                    >
                      {l === "en" ? s.langEn : s.langAr}
                    </button>
                  ))}
                </div>
                <div className="set-row">
                  <span className="set-row-label">{s.theme}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">
                    {theme === "dark"
                      ? s.themeDark
                      : theme === "light"
                        ? s.themeLight
                        : s.themeSystem}
                  </span>
                </div>
                <div className="set-opts">
                  {(["dark", "light", "system"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`set-opt ${theme === t ? "active" : ""}`}
                      onClick={() => setTheme(t)}
                      aria-pressed={theme === t}
                    >
                      {t === "dark" ? s.themeDark : t === "light" ? s.themeLight : s.themeSystem}
                    </button>
                  ))}
                </div>
                <p className="set-hint">{s.appearanceHint}</p>
              </div>
            </section>
          )}

          {group === "epg" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.epgGuide}</h2>
                <p className="set-group-desc">{s.epgDesc}</p>
              </header>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-label">{s.programmeGuide}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{epgPref ? s.onValue : s.offValue}</span>
                  <button
                    type="button"
                    className={`set-switch ${epgPref ? "on" : ""}`}
                    onClick={() => setEpgPref(!epgPref)}
                    aria-pressed={epgPref}
                    aria-label={s.programmeGuide}
                  >
                    <span className="set-switch-knob" />
                  </button>
                </div>
                <p className="set-hint">{s.epgHint}</p>
              </div>
            </section>
          )}

          {group === "playback" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.playback}</h2>
                <p className="set-group-desc">{s.playbackDesc}</p>
              </header>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-label">{s.skipDuration}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">
                    {skipDuration}
                    {isAr ? "ث" : "S"}
                  </span>
                </div>
                <div className="set-opts">
                  {[5, 10, 15, 30].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`set-opt ${skipDuration === v ? "active" : ""}`}
                      onClick={() => setSkipDuration(v)}
                    >
                      {v}s
                    </button>
                  ))}
                </div>
                <label className="set-skip-custom">
                  <span className="set-row-label">{s.customSkip}</span>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    step={1}
                    value={skipDuration}
                    onChange={(e) => setSkipDuration(Number(e.target.value))}
                    className="set-input"
                  />
                </label>
                <div className="set-row">
                  <span className="set-row-label">{s.playbackSpeed}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">{speed.toFixed(2)}×</span>
                </div>
                <div className="set-opts">
                  {SPEED_OPTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`set-opt ${speed === v ? "active" : ""}`}
                      onClick={() => saveSpeed(v)}
                    >
                      {v}x
                    </button>
                  ))}
                </div>
                <p className="set-hint">{s.playbackHint}</p>
              </div>
            </section>
          )}

          {group === "video" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.video}</h2>
                <p className="set-group-desc">{s.videoDesc}</p>
              </header>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-label">{s.fitMode}</span>
                  <span className="set-row-leader" />
                  <span className="set-row-value">
                    {fitLabel(FIT_MODES.find((f) => f.mode === fitMode)?.mode ?? "contain", s)}
                  </span>
                </div>
                <div className="set-opts">
                  {FIT_MODES.map((f) => (
                    <button
                      key={f.mode}
                      type="button"
                      className={`set-opt ${fitMode === f.mode ? "active" : ""}`}
                      onClick={() => saveFitMode(f.mode)}
                      title={f.mode}
                    >
                      {fitLabel(f.mode, s)}
                    </button>
                  ))}
                </div>
                <p className="set-hint">{s.videoHint}</p>
              </div>
            </section>
          )}

          {group === "parental" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.parental}</h2>
                <p className="set-group-desc">{s.parentalDesc}</p>
              </header>
              <div className="set-card">
                <ParentalSettings />
              </div>
            </section>
          )}

          {group === "updates" && (
            <section className="set-group">
              <header className="set-group-head">
                <h2 className="set-group-title">{s.updates}</h2>
                <p className="set-group-desc">{s.updatesDesc}</p>
              </header>
              <div className="set-card">
                <UpdatesSettings />
              </div>
            </section>
          )}
        </div>
      </div>

      <footer className="set-status">
        <ColorBar className="colorbar--loading" />
        <div className="set-status-row">
          <span className="set-status-seg">
            {s.connSeg} <b>▸</b> {connTxt}
          </span>
          <span className="set-status-seg">
            {s.signalSeg} <b>▸</b> {signalTxt}
          </span>
          <span
            className={`set-status-seg ${expWarn ? "warn" : ""} ${expDanger ? "danger" : ""}`}
          >
            {s.expires} <b>▸</b> {expTxt}
          </span>
          <span className="set-status-seg">
            {s.frameSeg} <b>▸</b> 59.94 HZ
          </span>
        </div>
      </footer>
    </div>
  );
}