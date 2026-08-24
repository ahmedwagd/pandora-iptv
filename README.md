# IPTV Player (Tauri + TypeScript)

A lightweight desktop IPTV player. Load an M3U/M3U8 playlist (URL or local
file), browse channels by group, search, favorite, and play HLS streams.

## Architecture

- **Frontend**: React + TypeScript (`src/`) — all app logic lives here.
- **Shell**: Rust/Tauri (`src-tauri/`) — thin native wrapper, just registers
  plugins (http, fs, dialog, store). You shouldn't need to touch Rust code
  for feature work.
- **Playback**: `hls.js` for `.m3u8` streams; falls back to native
  `<video>` for direct/non-HLS URLs.
- **Persistence**: `@tauri-apps/plugin-store` writes favorites to a JSON
  file on disk (not localStorage — more reliable across platforms/rebuilds).

## Prerequisites

1. **Node.js** 18+ and npm
2. **Rust** (via [rustup](https://rustup.rs))
3. Platform build tools for Tauri — see the
   [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)
   (on Linux you need `webkit2gtk`, `libssl-dev`, etc; macOS needs Xcode
   Command Line Tools; Windows needs the WebView2 runtime + MSVC toolchain)

## Setup

```bash
npm install
```

## Run in dev mode

```bash
npm run tauri dev
```

This starts the Vite dev server and opens a native window with hot reload.

## Build a distributable

```bash
npm run tauri build
```

Output binaries/installers land in `src-tauri/target/release/bundle/`.

Before your first real build, generate proper icons:

```bash
npx tauri icon path/to/your-1024x1024-logo.png
```

## Testing with a playlist

Paste any public M3U/M3U8 URL into the sidebar, or use "Open File…" to
load a local `.m3u`/`.m3u8` file. Many free, legal test/sample IPTV
playlists exist online (e.g. news/public-access aggregators) — use
whatever playlist you're authorized to access.

## Roadmap / natural next steps (not yet built)

Working backward from a fuller "done" state, in priority order:

1. **EPG (Electronic Program Guide)** — parse XMLTV, show "on now / up
   next" per channel. Needs a second parser (`src/lib/xmltvParser.ts`)
   and a schedule strip UI component.
2. **Multiple saved playlists** — currently only the last-loaded
   playlist persists; extend the store schema to an array of
   `PlaylistSource` with a picker.
3. **Picture-in-picture / mini player** — useful since IPTV is often
   left running in the background.
4. **Stream health indicator** — surface hls.js bitrate/dropped-frame
   stats so users can tell a dead channel from a slow one.
5. **Custom window chrome** — Tauri lets you hide the OS titlebar for a
   more "media app" feel; only worth it once functionality is solid.

## Known limitations (MVP)

- No EPG yet — this is a channel-list-and-player MVP.
- Group/search filters are client-side only; very large playlists
  (10k+ channels) may want virtualized list rendering
  (e.g. `react-window`) instead of the plain `<ul>` in `ChannelList.tsx`.
- DRM-protected streams are out of scope — hls.js here has no EME/DRM
  key handling wired up.
