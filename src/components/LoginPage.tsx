import { useEffect, useState } from "react";
import type { XtreamCreds } from "../types";
import { ColorBar } from "./ColorBar";

interface LoginPageProps {
  xtreamCreds: XtreamCreds | null;
  loading: boolean;
  error: string | null;
  onLoadXtream: (creds: XtreamCreds) => void;
  onLoadUrl: (url: string) => void;
  onLoadFile: () => void;
}

export function LoginPage({
  xtreamCreds,
  loading,
  error,
  onLoadXtream,
  onLoadUrl,
  onLoadFile,
}: LoginPageProps) {
  const [mode, setMode] = useState<"xtream" | "m3u">("xtream");
  const [server, setServer] = useState(xtreamCreds?.server ?? "");
  const [username, setUsername] = useState(xtreamCreds?.username ?? "");
  const [password, setPassword] = useState(xtreamCreds?.password ?? "");
  const [url, setUrl] = useState("");

  // Saved credentials load from disk asynchronously; backfill the form
  // once they arrive (only when the fields are still empty).
  useEffect(() => {
    if (!xtreamCreds) return;
    setServer((v) => v || xtreamCreds.server || "");
    setUsername((v) => v || xtreamCreds.username || "");
    setPassword((v) => v || xtreamCreds.password || "");
  }, [xtreamCreds]);

  const canConnect = Boolean(server.trim() && username.trim() && password.trim() && !loading);
  const canLoadUrl = Boolean(url.trim() && !loading);

  const submitXtream = () => {
    if (canConnect) onLoadXtream({ server, username, password });
  };

  return (
    <div className="login">
      <aside className="login-aside">
        <ColorBar className="colorbar--brand" />
        <h1 className="login-wordmark">IPTV Player</h1>
        <p className="login-tagline">
          Sign in to watch live TV, movies, and series from your provider.
        </p>
      </aside>

      <main className="login-main">
        <div className="login-panel">
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
              <div className="login-field">
                <label htmlFor="xtream-password">Password</label>
                <input
                  id="xtream-password"
                  type="password"
                  placeholder="password"
                  value={password}
                  autoComplete="off"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitXtream();
                  }}
                />
              </div>
              <button className="login-connect" disabled={!canConnect} onClick={submitXtream}>
                {loading ? "Connecting…" : "Connect"}
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
              >
                {loading ? "Loading…" : "Load playlist"}
              </button>
              <button className="login-secondary" onClick={onLoadFile} disabled={loading}>
                Open file…
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
