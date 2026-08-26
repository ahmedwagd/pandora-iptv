# PandoraIPTV — Tauri + React + TypeScript

A lightweight, cross-platform desktop IPTV player. Supports **Xtream Codes API**, **M3U/M3U8 playlists** (URL or local file), with browsing by category, search, favorites, watch history, EPG, and a full-featured HLS player.

> v0.1.0 — Windows / macOS / Linux via [Tauri v2](https://v2.tauri.app).

---

## Features

| Area | Details |
|---|---|
| **Sources** | Xtream Codes (live / VOD / series), M3U & M3U8 via URL or file picker |
| **Browsing** | Live / Movies / Series home tiles; category drill-down; `browseSelectors` with `all` / `favorites` / `continue` filters; `name-asc` / `name-desc` / `recent` sorting |
| **Player** | `hls.js` + native `<video>` fallback; retry + `altUrls` failover; catchup/Timeshift; PiP, fullscreen, speed (`./,`), fit (`z`), volume (`↑/↓`), seek (`←/→`), captions (`c`), mute (`m`) |
| **EPG** | `get_simple_data_table` + `get_short_epg` (now/next), timeline strip, refresh on exit-watch; gateable via Settings → EPG toggle |
| **Profiles** | Multiple isolated profiles (`useProfiles`) — each with own creds, favorites, history, resume positions |
| **Library** | Favorites (per-profile, `plugin-store` JSON), Watch History, Continue Watching with resume position + clear-all prompt |
| **Search** | In-filter search + global palette (`Ctrl/Cmd+K`) with ranked `searchIndex`, recent searches, command palette (Home, Browse, Favorites, Settings, Disconnect) |
| **Parental** | Per-category lock with PIN (`useParental`) |
| **Security** | Xtream creds in OS keyring via `keyring` crate (`get_credentials`/`save_credentials`/`delete_credentials`); fallback to `plugin-store` |
| **Updates** | `plugin-updater` with GitHub Releases endpoint (`latest.json`), `useUpdater` hook |
| **i18n / UX** | `i18n` strings, offline banner (`useOnline`), keyboard help (`?`), `ErrorBoundary`, `MediaImage` lazy loading |

---

## Architecture

```
src/                 React + TypeScript — all app logic
  App.tsx            Router-by-state (login → home → browse → detail → watch → settings)
  components/        Sidebar, Player, Home, LoginPage, DetailPage, WatchView, PosterGrid, ...
    player/          PlayerControls, ZapOverlay, ResumePrompt
    epg/             EpgTimeline
  hooks/             usePlaylist, useEpg, useFavorites, useWatchHistory, usePlaybackResume, ...
  lib/               xtream.ts (XtreamClient), m3uParser.ts, searchIndex.ts, zap.ts, streamPolicy.ts, secureCreds.ts, store.ts
  stores/            appStore.ts (zustand — active channel, contentMode, screen, filters)
  types.ts           Channel, Series, Season, WatchItem, PlaybackPosition, ...
  i18n/              Localized strings

src-tauri/           Rust shell — thin wrapper, no business logic
  src/main.rs        Registers plugins + keyring commands
  src/credentials.rs keyring get/save/delete
  Cargo.toml         tauri + plugins (http, fs, dialog, store, updater) + keyring + serde
  tauri.conf.json    Window 1200×800, CSP, bundle targets, updater endpoints
  icons/             Generated via `npx tauri icon ...`
```

**Data flow:** `usePlaylist` fetches live/movies/series (movies & series in background with `AbortController`). `xtream.ts` handles normalized URLs, alternate bases (http↔https port flip), retries (5xx + network, 300ms backoff), and timeouts (10s). Playback uses `hls.js` for `.m3u8` and native video otherwise. Persistence via `@tauri-apps/plugin-store` (JSON on disk) + OS keyring for secrets.

---

## Prerequisites

1. **Node.js** 18+ and npm
2. **Rust** via [rustup](https://rustup.rs) (stable toolchain)
3. **Platform build tools** — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)  
   - Linux: `webkit2gtk` `libssl-dev` etc.  
   - macOS: Xcode Command Line Tools  
   - Windows: WebView2 runtime + MSVC toolchain

---

## Getting Started

```bash
npm install        # install deps
npm run tauri dev  # Vite dev server (http://localhost:1420) + Tauri window with HMR
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite frontend only |
| `npm run tauri dev` | Full Tauri dev window |
| `npm run build` | `tsc && vite build` (→ `dist/`) |
| `npm run tauri build` | Distributable installers (→ `src-tauri/target/release/bundle/`) |
| `npm run lint` | `tsc --noEmit && eslint src --ext .ts,.tsx` |
| `npm run format` | `prettier --write src` |
| `npm test` | `vitest run` (jsdom, `@testing-library/react`) |
| `npm run test:watch` | `vitest` watch mode |

### Build a distributable

```bash
npm run tauri build
# artifacts in src-tauri/target/release/bundle/
```

Regenerate icons from a 1024×1024 source before a real release:

```bash
npx tauri icon path/to/your-1024x1024-logo.png
```

### CI / Release

Push a `v*` tag (or `workflow_dispatch`) triggers `.github/workflows/release.yml`: matrix build on `windows-latest` / `ubuntu-22.04` / `macos-latest`, runs `lint` + `test`, builds frontend, then `tauri-action@v0` creates a draft GitHub Release with updater artifacts (`latest.json`). Configure `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets; see `src-tauri/tauri.conf.json:41-46` for the updater endpoint:

```json
"https://github.com/ahmed/pandoraiptv/releases/latest/download/latest.json"
```

Set `pubkey` in the same block before shipping auto-updates.

---

## Configuration

### Tauri (`src-tauri/tauri.conf.json:1-48`)

- `productName`: `PandoraIPTV`, `identifier`: `com.ahmed.iptvplayer`, `version`: `0.1.0`
- `build.devUrl`: `http://localhost:1420`, `frontendDist`: `../dist`
- `app.windows`: 1200×800 (min 800×500), `theme: Dark`
- `app.security.csp`: `media-src * blob:`, `connect-src https://* http://*` + `ipc:` — required for HLS
- `bundle.createUpdaterArtifacts`: `true`, `plugins.updater.endpoints`: GitHub Releases

### Vite (`vite.config.ts:1-18`)

Fixed port `1420` (`strictPort: true`), `target: esnext`, `minify: esbuild`, sourcemaps when `TAURI_DEBUG` is set.

### Credentials & Storage

- **Keyring** (`src/lib/secureCreds.ts:1-49`, `src-tauri/src/credentials.rs:1-29`): `xtream:<profileId>` account via OS keychain. Falls back to `plugin-store` if unavailable.
- **Store** (`src/lib/store.ts`, `src/lib/storageKeys.ts`): favorites, history, resume positions, recent searches, EPG preference, etc. — per-profile JSON on disk (not `localStorage`).

---

## Usage

### Connecting a playlist

- **Xtream Codes:** server + username + password on the Login page (optionally "Remember" → keyring). Auto-loads live immediately; movies/series load in background.
- **M3U URL:** paste any public/authorized `https://…/*.m3u` URL in the sidebar.
- **Local file:** "Open File…" picker (`.m3u`, `.m3u8`, `.txt`) via `plugin-dialog` + `plugin-fs` + `m3uParser.ts`.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl/Cmd+K` | Command palette / global search |
| `/` | Focus search input |
| `?` | Toggle help overlay |
| `Esc` | Back (Watch→Detail→Browse→Home) |
| `1` / `2` / `3` | Home tiles: Live / Movies / Series |
| `f` | Toggle favorite (detail/browse) |
| **Player:** `Space`/`k` play/pause · `m` mute · `f` fullscreen · `p` PiP · `z` fit · `c` captions · `,/.` speed · `←/→` seek · `↑/↓` volume |  |
| **Zap:** `Channel Up/Down` + overlay (`ZapOverlay.tsx`) |  |

---

## Project Structure

```
.
├── src/
│   ├── App.tsx              # Screen router + hotkeys + palette wiring
│   ├── main.tsx / theme.tsx # Entry, ThemeProvider
│   ├── App.css / index.css / light.css / styles/
│   ├── app/selectors/       # browseSelectors (categories, poster cards)
│   ├── components/          # Sidebar, FilterSidebar, PosterGrid, Player, Home, ...
│   ├── hooks/               # usePlaylist, useEpg, useProfiles, useFavorites, ...
│   ├── lib/                 # xtream, m3uParser, searchIndex, zap, streamPolicy, store
│   └── types/               # epg.ts, profile.ts
├── src-tauri/
│   ├── Cargo.toml / src/    # Rust shell
│   └── tauri.conf.json      # Tauri config
├── vite.config.ts / vitest.config.ts / tsconfig.json / eslint.config.js
└── package.json
```

---

## Testing

```bash
npm test              # run once
npm run test:watch    # watch
```

Stack: `vitest` + `jsdom` + `@testing-library/react` + `@testing-library/jest-dom`.

Existing suites (`src/lib/__tests__/` + `src/app/selectors/__tests__/`):

- `m3uParser.test.ts` · `searchIndex.test.ts` · `streamPolicy.test.ts` · `xtream.test.ts` · `zap.test.ts` · `browseSelectors.test.ts`

Lint before pushing:

```bash
npm run lint
npm run format   # prettier
```

---

## Roadmap

**Done since MVP:** EPG (now/next + timeline), multiple profiles with isolated state, global search + command palette, continue-watching / resume prompts, parental category lock, Zap overlay, PiP / mini-player, stream health via `hls.js` stats (bitrate/dropped frames), auto-updater + release workflow, secure credential storage, i18n, offline handling.

**Next (priority order):**

1. Virtualized lists (`react-window`) for 10k+ channel playlists
2. Custom window chrome (frameless Tauri window) — after stability
3. Stream health indicator surfacing in UI (bitrate / dropped frames badge)
4. EPG caching + XMLTV import as alternative to Xtream EPG
5. DRM/EME (Widevine) — explicitly out of scope for now

---

## Known Limitations

- No DRM-protected streams — `hls.js` has no EME/DRM key handling wired up.
- Group/search filtering is client-side; very large playlists benefit from virtualization.
- Catchup requires provider `tv_archive` support (`live/<creds>/<id>-<start>-<end>.m3u8`).

---

## License

Private — all rights reserved unless a `LICENSE` file is added.
