import { useEffect, useState } from "react";
import type { XtreamCreds } from "../types";
import type { Profile } from "../types/profile";
import { ColorBar } from "./ColorBar";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { ThemeToggle } from "../theme";

interface LoginPageProps {
  xtreamCreds: XtreamCreds | null;
  loading: boolean;
  error: string | null;
  onLoadXtream: (creds: XtreamCreds, remember: boolean) => void;
  onLoadUrl: (url: string) => void;
  onLoadFile: () => void;
  profiles?: Profile[];
  activeId?: string | null;
  onSwitchProfile?: (id: string) => void;
  onCreateProfile?: (name: string) => void;
  onDeleteProfile?: (id: string) => void;
}

export function LoginPage({
  xtreamCreds,
  loading,
  error,
  onLoadXtream,
  onLoadUrl,
  onLoadFile,
  profiles,
  activeId,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
}: LoginPageProps) {
  const [mode, setMode] = useState<"xtream" | "m3u">("xtream");
  const [server, setServer] = useState(xtreamCreds?.server ?? "");
  const [username, setUsername] = useState(xtreamCreds?.username ?? "");
  const [password, setPassword] = useState(xtreamCreds?.password ?? "");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [url, setUrl] = useState("");

  // Saved credentials load from disk asynchronously; backfill the form
  // once they arrive. When profile switches (activeId changes), sync fields
  // to the new profile's creds so login always reflects active profile.
  useEffect(() => {
    if (xtreamCreds) {
      setServer(xtreamCreds.server || "");
      setUsername(xtreamCreds.username || "");
      setPassword(xtreamCreds.password || "");
      setRemember(true);
    } else if (activeId) {
      // profile without saved creds — clear form for fresh login
      setServer("");
      setUsername("");
      setPassword("");
      setRemember(false);
    }
  }, [xtreamCreds, activeId]);

  const canConnect = Boolean(server.trim() && username.trim() && password.trim() && !loading);
  const canLoadUrl = Boolean(url.trim() && !loading);

  const submitXtream = () => {
    if (canConnect) onLoadXtream({ server, username, password }, remember);
  };

  return (
    <div className="login">
      <ThemeToggle className="login-theme" />
      <aside className="login-aside">
        <ColorBar className="colorbar--brand" />
        <p className="login-eyebrow">Broadcast · Signal · Player</p>
        <h1 className="login-wordmark">
          Pandora
          <br />
          IPTV
        </h1>
        <p className="login-tagline">
          Television from your provider. <strong>Live, movies, series</strong> — one signal, every
          screen. Connect via Xtream Codes or drop in an M3U.
        </p>
      </aside>

      <main className="login-main">
        <div className="login-panel">
          {profiles && onSwitchProfile && onCreateProfile && onDeleteProfile && (
            <div className="login-profile">
              <label>Profile</label>
              <ProfileSwitcher
                profiles={profiles}
                activeId={activeId ?? null}
                onSwitch={onSwitchProfile}
                onCreate={onCreateProfile}
                onDelete={onDeleteProfile}
              />
            </div>
          )}
          <div className="login-tabs">
            <button
              className={`login-tab ${mode === "xtream" ? "active" : ""}`}
              onClick={() => setMode("xtream")}
            >
              Xtream Codes
            </button>
            <button
              className={`login-tab ${mode === "m3u" ? "active" : ""}`}
              onClick={() => setMode("m3u")}
            >
              M3U playlist
            </button>
          </div>

          {mode === "xtream" ? (
            <div className="login-form">
              <div className="login-field">
                <label htmlFor="xtream-server">Server URL</label>
                <input
                  id="xtream-server"
                  type="text"
                  placeholder="http://host:port"
                  value={server}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setServer(e.target.value)}
                />
              </div>
              <div className="login-field">
                <label htmlFor="xtream-username">Username</label>
                <input
                  id="xtream-username"
                  type="text"
                  placeholder="username"
                  value={username}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="login-field login-field--password">
                <label htmlFor="xtream-password">Password</label>
                <div className="login-password-wrap">
                  <input
                    id="xtream-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="password"
                    value={password}
                    autoComplete="off"
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitXtream();
                    }}
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide" : "Show"}
                  >
                    {showPassword ? "◯" : "◎"}
                  </button>
                </div>
              </div>
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me on this device
              </label>
              <button
                className="login-connect"
                disabled={!canConnect}
                onClick={submitXtream}
                aria-busy={loading}
                aria-live="polite"
              >
                {loading ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <span className="inline-loader" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden />
                    Connecting…
                  </span>
                ) : (
                  "Connect"
                )}
              </button>
            </div>
          ) : (
            <div className="login-form">
              <div className="login-field">
                <label htmlFor="m3u-url">Playlist URL</label>
                <input
                  id="m3u-url"
                  type="text"
                  placeholder="https://…/playlist.m3u"
                  value={url}
                  spellCheck={false}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canLoadUrl) onLoadUrl(url.trim());
                  }}
                />
              </div>
              <button
                className="login-connect"
                disabled={!canLoadUrl}
                onClick={() => onLoadUrl(url.trim())}
                aria-busy={loading}
                aria-live="polite"
              >
                {loading ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <span className="inline-loader" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden />
                    Loading…
                  </span>
                ) : (
                  "Load playlist"
                )}
              </button>
              <button
                className="login-secondary"
                onClick={onLoadFile}
                disabled={loading}
                aria-busy={loading}
                style={loading ? { display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" } : undefined}
              >
                {loading ? (
                  <>
                    <span className="inline-loader" style={{ width: 12, height: 12, borderWidth: 1.5 }} aria-hidden />
                    Opening…
                  </>
                ) : (
                  "Open file…"
                )}
              </button>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
        </div>
      </main>

      {loading && <ColorBar className="colorbar--loading login-progress" />}
    </div>
  );
}
