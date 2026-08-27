import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Channel } from "../types";
import { ColorBar } from "./ColorBar";
import { PlayerControls } from "./player/PlayerControls";
import { ResumePrompt } from "./player/ResumePrompt";
import { useVideoZoom } from "../hooks/useVideoZoom";
import { useSkipDuration } from "../hooks/useSkipDuration";
import { usePlaybackSpeed } from "../hooks/usePlaybackSpeed";
import { usePlaybackResume } from "../hooks/usePlaybackResume";
import {
  CONNECT_TIMEOUT_MS,
  MAX_RETRIES,
  STALL_TIMEOUT_MS,
  decideAfterFailure,
} from "../lib/streamPolicy";
import { createHlsLoaderClass } from "../lib/hls/loader";
import { zapNeighbors, zapStep } from "../lib/zap";
import { PLAYER_MAX_BUFFER_LENGTH_SEC, PLAYER_MAX_MEDIA_RECOVER, PLAYER_ZAP_HIDE_MS, PLAYER_ZAP_HINT_MS, PLAYER_ZAP_HINT_KEY } from "../lib/player/constants";
import { PlayerTimers } from "../lib/player/timers";
import { ZapOverlay } from "./player/ZapOverlay";
import type { EpgProgramme } from "../types/epg";

interface PlayerProps {
  channel: Channel | null;
  fitMode?: string;
  onBack?: () => void;
  profileId?: string | null;
  zapList?: Channel[];
  onZap?: (ch: Channel) => void;
  getEpgForChannel?: (id: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;
  /** 1.6 auto-next: next episode to play when current episode ends */
  nextEpisode?: Channel | null;
  onNextEpisode?: (ch: Channel) => void;
  /** Alternative shape per spec: autoNext + onEnded */
  autoNext?: { next: Channel | null; countdown: number };
  onEnded?: () => void;
}

type PlayerStatus = "idle" | "loading" | "buffering" | "reconnecting" | "error";

export interface TrackInfo {
  id: number;
  label: string;
  lang?: string;
}

function getSources(ch: Channel): string[] {
  return [ch.url, ...(ch.altUrls ?? [])].filter(Boolean);
}

/**
 * 1.5 Friendly error mapping — keeps overlay copy user-friendly while
 * diagnostics panel retains technical details. Host / HTTP code / HLS
 * details are stored separately in `detailedDiag` and only shown via
 * "Show Details".
 */
export function friendlyError(
  dataOrCode: unknown,
  httpCodeOrHost?: number | string,
  hostHint?: string,
): string {
  // Allow overloaded calls: friendlyError(data, httpCode, hostHint) OR friendlyError(httpCode, details)
  let httpCode: number | undefined;
  let detailsStr: string | undefined;
  // If first arg is a number / undefined and second is string/undefined, treat as (httpCode, details)
  if (typeof dataOrCode === "number" || dataOrCode == null) {
    httpCode = dataOrCode as number | undefined;
    detailsStr = typeof httpCodeOrHost === "string" ? (httpCodeOrHost as string) : undefined;
  } else if (typeof dataOrCode === "object" && dataOrCode !== null) {
    const d = dataOrCode as { type?: string; details?: string; networkDetails?: { message?: string } };
    detailsStr = d.details ?? d.type ?? (d.networkDetails as unknown as { message?: string })?.message;
    if (typeof httpCodeOrHost === "number") httpCode = httpCodeOrHost;
  } else if (typeof dataOrCode === "string") {
    detailsStr = dataOrCode;
    if (typeof httpCodeOrHost === "number") httpCode = httpCodeOrHost;
  }
  // Also accept hostHint ignored for mapping but kept for debug signature
  void hostHint;

  const detailsLower = (detailsStr ?? "").toLowerCase();
  const isTimeout =
    detailsLower.includes("timeout") ||
    detailsLower.includes("timed out") ||
    httpCode === 408 ||
    httpCode === 504;

  if (isTimeout) {
    return "Connection timed out. Check internet or try Retry.";
  }
  if (httpCode === 401) {
    return "Authentication failed. Check username/password or max connections.";
  }
  // 403 with auth hint -> auth message, otherwise geo/subscription message
  if (httpCode === 403) {
    if (detailsLower.includes("auth") || detailsLower.includes("unauthorized") || detailsLower.includes("forbidden")) {
      return "Authentication failed. Check username/password or max connections.";
    }
    return "Channel unavailable (403). This is usually a subscription or geo restriction. Try another channel or check your provider.";
  }
  if (httpCode === 404) {
    return "Stream not found (404). Channel may have moved.";
  }
  if (httpCode === 0) {
    return "Network error. Offline or CORS blocked.";
  }
  if (!httpCode && (detailsLower.includes("networkerror") || detailsLower.includes("network error") || detailsLower.includes("cors") || detailsLower.includes("failed to fetch") || detailsLower.includes("offline"))) {
    return "Network error. Offline or CORS blocked.";
  }
  return "Stream error. Try Retry or another source.";
}

export function Player({ channel, fitMode: fitModeProp, onBack, profileId = null, zapList, onZap, getEpgForChannel, nextEpisode, onNextEpisode, autoNext, onEnded }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const channelRef = useRef<Channel | null>(null);
  channelRef.current = channel;
  const videoZoom = useVideoZoom();
  const fitMode = (fitModeProp as any) ?? videoZoom.fitMode;
  const { speed, saveSpeed } = usePlaybackSpeed();
  const { skipDuration } = useSkipDuration();
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [sourceMeta, setSourceMeta] = useState<{ index: number; total: number; attempt: number }>({
    index: 0,
    total: 1,
    attempt: 0,
  });
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[]>([]);
  const [audioId, setAudioId] = useState<number>(-1);
  const [subtitleId, setSubtitleId] = useState<number>(-1);
  const [levels, setLevels] = useState<Array<{ idx: number; name: string }>>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const { getPosition, savePosition, clearPosition } = usePlaybackResume(profileId);
  const getPositionRef = useRef(getPosition);
  const hasPromptedRef = useRef<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ position: number; duration: number } | null>(
    null
  );
  const pendingResumeRef = useRef<{ position: number; duration: number } | null>(null);

  // Resilience refs (per channel session)
  const sourceIndexRef = useRef(0);
  const attemptRef = useRef(0);
  const timersRef = useRef<PlayerTimers | null>(null);
  if (!timersRef.current) timersRef.current = new PlayerTimers();
  const timers = timersRef.current;
  const statusSinceRef = useRef<number>(Date.now());
  const lastProgressRef = useRef<number>(Date.now());
  const [zapOpen, setZapOpen] = useState(false);
  const zapOpenRef = useRef(false);
  useEffect(() => { zapOpenRef.current = zapOpen; }, [zapOpen]);
  const [zapHint, setZapHint] = useState(false);
  const zapHintTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (zapHintTimerRef.current) window.clearTimeout(zapHintTimerRef.current);
    };
  }, []);

  // Media (codec/MSE) recovery budget — stops recoverMediaError from looping forever.
  const mediaRecoverRef = useRef(0);
  const [showDiag, setShowDiag] = useState(false);
  // 1.5 — keep technical details collapsed in diagnostics panel
  const [detailedDiag, setDetailedDiag] = useState<string | null>(null);

  // 1.6 — Auto-next countdown for episodes
  const [autoNextOverlay, setAutoNextOverlay] = useState<{ next: Channel; countdown: number; total: number } | null>(null);
  const autoNextTimerRef = useRef<number | null>(null);
  const autoNextIntervalRef = useRef<number | null>(null);

  const applySpeed = useCallback((v: HTMLVideoElement | null, s: number) => {
    if (!v) return;
    try {
      v.playbackRate = s;
    } catch {}
  }, []);

  useEffect(() => {
    applySpeed(videoRef.current, speed);
  }, [speed, applySpeed, channel]);

  const isResumable = useCallback((pos: number, dur: number, kind?: string) => {
    if (kind === "live") return false;
    if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
    if (pos < 10) return false;
    if (dur - pos < 15) return false;
    const pct = pos / dur;
    return pct > 0.01 && pct < 0.985;
  }, []);
  const isResumableRef = useRef(isResumable);
  useEffect(() => {
    isResumableRef.current = isResumable;
  }, [isResumable]);
  useEffect(() => {
    getPositionRef.current = getPosition;
  }, [getPosition]);

  const tryShowResumePrompt = useCallback(
    (kind?: string) => {
      if (!channel) return;
      if (hasPromptedRef.current === channel.id) return;
      const saved = getPositionRef.current(channel.id);
      if (!saved) return;
      if (!isResumableRef.current(saved.position, saved.duration, kind ?? channel.kind)) {
        if (saved.duration - saved.position < 15) clearPosition(channel.id);
        return;
      }
      const v = videoRef.current;
      const dur =
        v?.duration && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : saved.duration;
      pendingResumeRef.current = { position: saved.position, duration: dur };
      hasPromptedRef.current = channel.id;
      try {
        v?.pause();
      } catch {}
      setResumePrompt({ position: saved.position, duration: dur });
    },
    [channel, clearPosition]
  );

  const handleResume = useCallback(() => {
    const v = videoRef.current;
    const r = resumePrompt ?? pendingResumeRef.current;
    if (!v || !r) return;
    try {
      v.currentTime = r.position;
    } catch {}
    setResumePrompt(null);
    pendingResumeRef.current = null;
    void v.play().catch(() => {});
  }, [resumePrompt]);

  const handleRestart = useCallback(() => {
    const v = videoRef.current;
    if (channel) clearPosition(channel.id);
    if (v) {
      try {
        v.currentTime = 0;
      } catch {}
      void v.play().catch(() => {});
    }
    setResumePrompt(null);
    pendingResumeRef.current = null;
  }, [channel, clearPosition]);

  const refreshTracks = useCallback(() => {
    const hls = hlsRef.current;
    const v = videoRef.current;
    if (hls) {
      try {
        const aTracks: any[] = (hls as any).audioTracks ?? [];
        setAudioTracks(
          aTracks.map((t, i) => ({
            id: t.id ?? i,
            label: t.name || t.lang || `Audio ${i + 1}`,
            lang: t.lang,
          }))
        );
        setAudioId(typeof (hls as any).audioTrack === "number" ? (hls as any).audioTrack : -1);
      } catch {
        setAudioTracks([]);
      }
      try {
        const sTracks: any[] = (hls as any).subtitleTracks ?? [];
        setSubtitleTracks(
          sTracks.map((t, i) => ({
            id: t.id ?? i,
            label: t.name || t.lang || `Sub ${i + 1}`,
            lang: t.lang,
          }))
        );
        setSubtitleId(
          typeof (hls as any).subtitleTrack === "number" ? (hls as any).subtitleTrack : -1
        );
      } catch {
        setSubtitleTracks([]);
      }
    } else if (v) {
      try {
        const tt = Array.from(v.textTracks) as any[];
        if (tt.length) {
          setSubtitleTracks(
            tt.map((t, i) => ({
              id: i,
              label: t.label || t.language || `Sub ${i + 1}`,
              lang: t.language,
            }))
          );
          const showing = tt.findIndex((t) => t.mode === "showing");
          setSubtitleId(showing);
        }
      } catch {}
      try {
        const at: any = (v as any).audioTracks;
        if (at && at.length) {
          const arr = Array.from(at as any[]) as any[];
          setAudioTracks(
            arr.map((t: any, i: number) => ({
              id: i,
              label: t.label || t.language || `Audio ${i + 1}`,
              lang: t.language,
            }))
          );
        }
      } catch {}
    }
  }, []);

  const switchAudio = useCallback((id: number) => {
    const hls = hlsRef.current;
    if (hls && typeof (hls as any).audioTrack !== "undefined") {
      try {
        (hls as any).audioTrack = id;
        setAudioId(id);
      } catch {}
    } else {
      const v: any = videoRef.current;
      const at = v?.audioTracks;
      if (at) {
        for (let i = 0; i < at.length; i++) at[i].enabled = i === id;
        setAudioId(id);
      }
    }
  }, []);

  const handleSeek = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      const dur = v.duration;
      const isLive =
        channelRef.current?.kind == null ||
        channelRef.current?.kind === "live" ||
        !Number.isFinite(dur) ||
        dur === 0 ||
        dur === Infinity;
      const target = document.createElement("div");
      target.className = "dbl-seek-hint";
      target.textContent = (delta > 0 ? "+" : "") + delta + "s";
      target.style.position = "absolute";
      target.style.top = "50%";
      target.style.left = delta > 0 ? "78%" : "22%";
      target.style.transform = "translate(-50%,-50%)";
      target.style.background = "rgba(0,0,0,0.72)";
      target.style.color = "#fff";
      target.style.padding = "8px 14px";
      target.style.borderRadius = "9999px";
      target.style.fontFamily = "var(--font-mono)";
      target.style.fontSize = "14px";
      target.style.fontWeight = "700";
      target.style.backdropFilter = "blur(6px)";
      target.style.pointerEvents = "none";
      target.style.zIndex = "6";
      target.style.animation = "seekHint 520ms ease";
      const playerEl = v.parentElement;
      if (playerEl) {
        playerEl.appendChild(target);
        window.setTimeout(() => target.remove(), 560);
      }
      if (isLive) {
        v.currentTime = Math.max(0, v.currentTime + delta);
        return;
      }
      const nd =
        Number.isFinite(dur) && dur > 0
          ? Math.max(0, Math.min(dur, v.currentTime + delta))
          : v.currentTime + delta;
      v.currentTime = nd;
    },
    [skipDuration]
  );

  const toggleFullscreen = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const playerEl = v.parentElement as HTMLElement | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (playerEl && playerEl.requestFullscreen) await playerEl.requestFullscreen();
      else await v.requestFullscreen();
    } catch {}
  }, []);

  const switchSubtitle = useCallback((id: number) => {
    const hls = hlsRef.current;
    if (hls && typeof (hls as any).subtitleTrack !== "undefined") {
      try {
        (hls as any).subtitleTrack = id;
        setSubtitleId(id);
      } catch {}
      const v = videoRef.current;
      if (v) {
        Array.from(v.textTracks).forEach((t: any) => {
          if (id === -1) t.mode = "disabled";
        });
      }
    } else {
      const v = videoRef.current;
      if (!v) return;
      Array.from(v.textTracks).forEach((t: any, i: number) => {
        t.mode = i === id ? "showing" : "disabled";
      });
      setSubtitleId(id);
    }
  }, []);

  const clearTimers = useCallback(() => {
    timers.clearAll();
  }, [timers]);

  const setStatusWithStamp = useCallback((s: PlayerStatus) => {
    statusSinceRef.current = Date.now();
    setStatus(s);
  }, []);

  const scheduleZapHide = useCallback(() => {
    timers.scheduleZapHide(() => setZapOpen(false), PLAYER_ZAP_HIDE_MS);
  }, [timers]);

  const maybeShowZapHint = useCallback(() => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      if (window.localStorage.getItem(PLAYER_ZAP_HINT_KEY)) return;
      window.localStorage.setItem(PLAYER_ZAP_HINT_KEY, "1");
      setZapHint(true);
      if (zapHintTimerRef.current) window.clearTimeout(zapHintTimerRef.current);
      zapHintTimerRef.current = window.setTimeout(() => setZapHint(false), PLAYER_ZAP_HINT_MS);
    } catch {}
  }, []);

  const zapDelta = useCallback((delta: number) => {
    if (!zapList || zapList.length === 0 || !channel || !onZap) return;
    const isLive = channel.kind == null || channel.kind === "live";
    if (!isLive) return;
    const next = zapStep(zapList, channel.id, delta);
    if (next) {
      setZapOpen(true);
      scheduleZapHide();
      onZap(next);
      maybeShowZapHint();
    }
  }, [zapList, channel, onZap, scheduleZapHide, maybeShowZapHint]);

  const zapSelect = useCallback((ch: Channel) => {
    if (!onZap) return;
    setZapOpen(true);
    scheduleZapHide();
    onZap(ch);
    maybeShowZapHint();
  }, [onZap, scheduleZapHide, maybeShowZapHint]);

  const handleSelectLevel = useCallback((idx: number) => {
    const hls: any = hlsRef.current;
    if (!hls) return;
    try {
      // hls.js: -1 = auto, >=0 = manual level
      hls.currentLevel = idx;
      // some hls.js versions also use nextLevel; keep in sync if present
      if (typeof hls.nextLevel !== "undefined") {
        try { hls.nextLevel = idx; } catch {}
      }
    } catch {}
    setCurrentLevel(idx);
  }, []);

  /**
   * 1.4 — Keyboard standardization:
   * PlayerControls.tsx is the SINGLE key handler for player shortcuts when
   * video is focused/playing (m mute, k/Space play, f fullscreen, p PiP,
   * z cycleFit, c captions, ,/. speed, ←/→ seek, ↑/↓ zap-or-volume).
   * This effect in Player.tsx ONLY handles live zap for ↑/↓ (non-shift)
   * as a legacy global fallback (e.g., when PlayerControls not mounted).
   * Gate: if (e.shiftKey) return — lets PlayerControls handle Shift+↑/↓
   * for volume instead. PlayerControls handles zap via onZapPrev/Next with
   * opposite gate (!shift => zap, shift => volume). This 0.5 gate keeps
   * them in sync and avoids double-zap.
   */
  useEffect(() => {
    if (!zapList || zapList.length < 2 || !channel) return;
    const isLive = channel.kind == null || channel.kind === "live";
    if (!isLive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      if (e.key === "ArrowUp") {
        if (e.shiftKey) return;
        e.preventDefault();
        zapDelta(-1);
      } else if (e.key === "ArrowDown") {
        if (e.shiftKey) return;
        e.preventDefault();
        zapDelta(1);
      } else if (e.key === "Escape" && zapOpenRef.current) {
        e.preventDefault();
        timers.clearZapHide();
        setZapOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zapList, channel, zapDelta]);

  // Attach HLS for a specific source url
  const attachHls = useCallback(
    (video: HTMLVideoElement, url: string) => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // iptv-org and many M3Us require http-user-agent / http-referrer per channel (#EXTVLCOPT)
      // Pre-ee60990 ignored them -> 403. Inject them via factory (DIP) instead of dynamic subclass.
      const chHeaders = channelRef.current?.headers;
      const LoaderClass = createHlsLoaderClass(chHeaders);
      const hls = new Hls({
        maxBufferLength: PLAYER_MAX_BUFFER_LENGTH_SEC,
        // WebView2 CSP is `script-src 'self'` (no blob:), which blocks hls.js's
        // transmuxer worker — run transmuxing on the main thread instead.
        enableWorker: false,
        manifestLoadingTimeOut: CONNECT_TIMEOUT_MS,
        fragLoadingTimeOut: STALL_TIMEOUT_MS,
        // Use Tauri HTTP to bypass WebView CORS for Xtream HLS (no ACAO headers)
        loader: LoaderClass as unknown as typeof Hls.DefaultConfig.loader,
        xhrSetup: undefined,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        clearTimers();
        lastProgressRef.current = Date.now();
        setStatusWithStamp("buffering");
        refreshTracks();
        try {
          const rawLevels: any[] = (hls as any).levels ?? [];
          if (rawLevels.length) {
            const mapped = rawLevels.map((l: any, i: number) => ({
              idx: i,
              name: l.height ? `${l.height}p` : l.bitrate ? `${Math.round(l.bitrate / 1000)}k` : `Level ${i + 1}`,
            }));
            setLevels(mapped);
          } else {
            setLevels([]);
          }
          const cur = (hls as any).currentLevel;
          setCurrentLevel(typeof cur === "number" ? cur : -1);
        } catch {
          setLevels([]);
          setCurrentLevel(-1);
        }
        applySpeed(video, speedRef.current);
        const saved = channelRef.current ? getPosition(channelRef.current.id) : undefined;
        if (saved && isResumable(saved.position, saved.duration, channelRef.current?.kind)) {
          const v = videoRef.current;
          pendingResumeRef.current = { position: saved.position, duration: saved.duration };
          try {
            v?.pause();
          } catch {}
          setResumePrompt({ position: saved.position, duration: saved.duration });
        } else {
          video.play().catch(() => {});
        }
      });
      const onTracks = () => refreshTracks();
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED as any, onTracks);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED as any, onTracks);
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED as any, onTracks);
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH as any, onTracks as any);
      hls.on(Hls.Events.LEVEL_SWITCHED as any, (_evt: any, data: any) => {
        if (typeof data?.level === "number") setCurrentLevel(data.level);
        else if (typeof (hls as any).currentLevel === "number") setCurrentLevel((hls as any).currentLevel);
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        lastProgressRef.current = Date.now();
        timers.clearStall();
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRecoverRef.current < PLAYER_MAX_MEDIA_RECOVER) {
            mediaRecoverRef.current++;
            try {
              hls.recoverMediaError();
              setStatusWithStamp("reconnecting");
              setError("Recovering stream…");
              return;
            } catch {}
          }
          // Recovery budget exhausted — fall through so retries terminate cleanly.
        }
        // Delegate to centralized failure handler
        const ch = channelRef.current;
        if (!ch) return;
        const sources = getSources(ch);
        const total = sources.length;
        const decision = decideAfterFailure({
          sourceIndex: sourceIndexRef.current,
          totalSources: total,
          attempt: attemptRef.current,
        });
        timers.clearAll();
        if (decision.kind === "retry") {
          attemptRef.current = decision.nextAttempt;
          setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
          setStatusWithStamp("reconnecting");
          setError(null);
          timers.scheduleRetry(() => {
            const cur = channelRef.current;
            const curV = videoRef.current;
            if (!cur || !curV) return;
            const curSources = getSources(cur);
            const curUrl = curSources[sourceIndexRef.current];
            if (!curUrl) return;
            // For HLS fatal network errors (manifestLoadError) hls.startLoad() is a no-op
            // which caused the player to stall forever at 3/3. Force a real reload.
            const activeHls = hlsRef.current;
            if (activeHls) {
              try {
                // loadSource re-fetches manifest and is the only reliable retry for HLS
                activeHls.loadSource(curUrl);
                return;
              } catch {}
              // Fallback: destroy and re-attach fresh instance
              try {
                activeHls.destroy();
              } catch {}
              hlsRef.current = null;
              curV.removeAttribute("src");
              curV.load();
              if (curUrl.includes(".m3u8") || curUrl.includes("m3u8")) {
                if (Hls.isSupported()) attachHls(curV, curUrl);
                else {
                  curV.src = curUrl;
                  void curV.play().catch(() => {});
                }
              } else {
                curV.src = curUrl;
                void curV.play().catch(() => {});
              }
            } else {
              // No active HLS: re-arm fresh
              curV.removeAttribute("src");
              curV.load();
              if (curUrl.includes(".m3u8") || curUrl.includes("m3u8")) {
                if (Hls.isSupported()) attachHls(curV, curUrl);
                else {
                  curV.src = curUrl;
                  void curV.play().catch(() => {});
                }
              } else {
                curV.src = curUrl;
                void curV.play().catch(() => {});
              }
              applySpeed(curV, speedRef.current);
            }
          }, decision.delayMs);
        } else if (decision.kind === "switch-source") {
          sourceIndexRef.current = decision.nextSourceIndex;
          attemptRef.current = 0;
          setSourceMeta({ index: sourceIndexRef.current, total, attempt: 0 });
          setStatusWithStamp("reconnecting");
          setError(`Switching to backup source…`);
          timers.scheduleRetry(() => {
            const cur = channelRef.current;
            const curV = videoRef.current;
            if (!cur || !curV) return;
            const curSources = getSources(cur);
            const nextUrl = curSources[decision.nextSourceIndex];
            if (!nextUrl) return;
            // Re-arm as a fresh load
            if (hlsRef.current) {
              hlsRef.current.destroy();
              hlsRef.current = null;
            }
            curV.removeAttribute("src");
            curV.load();
            setError(null);
            setStatusWithStamp("loading");
            if (nextUrl.includes(".m3u8") || nextUrl.includes("m3u8")) {
              if (Hls.isSupported()) attachHls(curV, nextUrl);
              else {
                curV.src = nextUrl;
                void curV.play().catch(() => {});
              }
            } else {
              curV.src = nextUrl;
              void curV.play().catch(() => {});
            }
          }, decision.delayMs);
        } else {
          clearTimers();
          // Surface the last HTTP code + attempted URLs to help diagnose Xtream/provider blocks
          const nd = (data as { networkDetails?: { message?: string; status?: number } }).networkDetails as unknown as Response | undefined;
          const httpCode = (data as { response?: { code?: number } }).response?.code ?? (nd as unknown as { status?: number })?.status;
          const ndMsgRaw = (data as { networkDetails?: { message?: string } }).networkDetails as unknown as { message?: string } | undefined;
          const ndMsg = ndMsgRaw?.message && !ndMsgRaw.message.includes("HTTP undefined") ? ndMsgRaw.message : undefined;
          const curV = videoRef.current;
          const lastUrl = sources[sourceIndexRef.current];
          const hostHint = (()=>{ try{ return lastUrl ? new URL(lastUrl).host : "" }catch{ return "" } })();
          // 1.5 — Build technical diag for collapsed panel; overlay shows only friendlyError
          const detailsStr = `${data.type}/${data.details}${ndMsg ? ` — ${ndMsg}` : httpCode ? ` — HTTP ${httpCode}` : ""}`;
          const technical = [
            `Channel: ${channelRef.current?.name ?? "unknown"}`,
            `URL: ${lastUrl}`,
            `AltUrls: ${(channelRef.current?.altUrls ?? []).join(" | ") || "—"}`,
            `Host: ${hostHint || "—"}`,
            `Tried sources:`,
            ...sources.map((u,i)=> ` ${i===sourceIndexRef.current ? "→" : " "} SRC ${i+1}: ${u}`),
            `State: error @ SRC ${sourceIndexRef.current+1}/${total} attempt ${attemptRef.current}/${MAX_RETRIES}`,
            `HTTP code: ${httpCode ?? "—"}`,
            `HLS: ${data.type}/${data.details}${ndMsg ? ` — ${ndMsg}` : ""}`,
            `Raw error: ${detailsStr}`,
          ].join("\n");
          setDetailedDiag(technical);
          // Try HLS-native fallback as last resort: some Xtream panels serve raw TS even when .m3u8 403s —
          // or CORS panel blocks m3u8 but TS is fetchable. Attempt direct video.src before hard-failing.
          const isM3u8 = lastUrl?.includes(".m3u8") || lastUrl?.includes("m3u8");
          const canTryNativeFallback = !!curV && isM3u8 && total === sources.length && httpCode && httpCode >= 400;
          if (canTryNativeFallback && curV) {
            console.warn(`[Player] HLS failed on all ${total} sources (last ${httpCode}). Trying native <video> fallback for ${lastUrl}`);
            if (hlsRef.current) {
              try { hlsRef.current.destroy(); } catch {}
              hlsRef.current = null;
            }
            curV.removeAttribute("src");
            curV.load();
            setStatusWithStamp("buffering");
            setError(`Trying native playback…`);
            curV.src = lastUrl;
            void curV.play().catch(() => {
              setStatusWithStamp("error");
              const friendly = friendlyError(data, httpCode, hostHint);
              setError(friendly);
              console.error(`[Player] Native fallback failed`, { httpCode, details: data.details, hostHint, lastUrl });
            });
            // If native also errors, the video.onerror handler (re-armed) will surface the final error.
            // Attach a one-shot native error to guarantee we don't hang in buffering.
            const onNativeFail = () => {
              curV.removeEventListener("error", onNativeFail);
              setStatusWithStamp("error");
              const friendly = friendlyError(data, httpCode, hostHint);
              setError(friendly);
              console.error(`[Player] Native <video> error`, { httpCode, hostHint, lastUrl });
            };
            curV.addEventListener("error", onNativeFail, { once: true });
            return;
          }
          setStatusWithStamp("error");
          const friendly = friendlyError(data, httpCode, hostHint);
          setError(friendly);
          console.error(`[Player] All ${total} sources failed. Tried:`, sources, `last details:`, data.details, `code:`, httpCode, `host:`, hostHint);
        }
      });
    },
    [refreshTracks, applySpeed, clearTimers, setStatusWithStamp]
  );

  const loadAtSource = useCallback(
    (video: HTMLVideoElement, ch: Channel, sourceIndex: number) => {
      const sources = getSources(ch);
      const url = sources[sourceIndex];
      if (!url) {
        setStatusWithStamp("error");
        setError("No stream URL available.");
        return;
      }
      sourceIndexRef.current = sourceIndex;
      setSourceMeta({ index: sourceIndex, total: sources.length, attempt: attemptRef.current });
      const isLikelyHls = url.includes(".m3u8") || url.includes("m3u8");
      if (isLikelyHls && Hls.isSupported()) {
        attachHls(video, url);
      } else {
        video.src = url;
        void video.play().catch(() => {});
        applySpeed(video, speedRef.current);
      }
    },
    [attachHls, applySpeed, setStatusWithStamp]
  );

  const retry = useCallback(() => {
    const v = videoRef.current;
    const ch = channelRef.current;
    if (!v || !ch) return;
    clearTimers();
    attemptRef.current = 0;
    sourceIndexRef.current = 0;
    setSourceMeta({ index: 0, total: getSources(ch).length, attempt: 0 });
    setError(null);
    setDetailedDiag(null);
    setShowDiag(false);
    // 1.6 clear auto-next on retry/manual reload
    if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
    if (autoNextIntervalRef.current) window.clearInterval(autoNextIntervalRef.current);
    setAutoNextOverlay(null);
    setStatusWithStamp("loading");
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.removeAttribute("src");
    v.load();
    loadAtSource(v, ch, 0);
  }, [loadAtSource, clearTimers, setStatusWithStamp]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) {
      clearTimers();
      setStatusWithStamp("idle");
      setError(null);
      setDetailedDiag(null);
      setShowDiag(false);
      if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
      if (autoNextIntervalRef.current) window.clearInterval(autoNextIntervalRef.current);
      setAutoNextOverlay(null);
      setAudioTracks([]);
      setSubtitleTracks([]);
      setAudioId(-1);
      setSubtitleId(-1);
      setLevels([]);
      setCurrentLevel(-1);
      setSourceMeta({ index: 0, total: 1, attempt: 0 });
      return;
    }
    setLevels([]);
    setCurrentLevel(-1);
    setError(null);
    setDetailedDiag(null);
    setShowDiag(false);
    // 1.6 clear stale auto-next on channel switch
    if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
    if (autoNextIntervalRef.current) window.clearInterval(autoNextIntervalRef.current);
    setAutoNextOverlay(null);
    setStatusWithStamp("loading");
    attemptRef.current = 0;
    sourceIndexRef.current = 0;
    mediaRecoverRef.current = 0;
    lastProgressRef.current = Date.now();
    const sources = getSources(channel);
    setSourceMeta({ index: 0, total: sources.length, attempt: 0 });
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    clearTimers();

    const armStall = () => {
      timers.armStall(() => {
        const ch = channelRef.current;
        const v = videoRef.current;
        if (!ch || !v) return;
        // Check if stalled since last progress
        if (Date.now() - lastProgressRef.current >= STALL_TIMEOUT_MS) {
          const total = getSources(ch).length;
          const decision = decideAfterFailure({
            sourceIndex: sourceIndexRef.current,
            totalSources: total,
            attempt: attemptRef.current,
          });
          if (decision.kind === "retry" || decision.kind === "switch-source") {
            timers.clearAll();
            setStatusWithStamp("reconnecting");
            // Reuse the same retry path as HLS error: just reload at current/next source
            if (decision.kind === "retry") {
              attemptRef.current = decision.nextAttempt;
              setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
              timers.scheduleRetry(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
            } else {
              sourceIndexRef.current = decision.nextSourceIndex;
              attemptRef.current = 0;
              setSourceMeta({ index: sourceIndexRef.current, total, attempt: 0 });
              setError(`Switching to backup source…`);
              timers.scheduleRetry(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
            }
          } else {
            clearTimers();
            setStatusWithStamp("error");
            // 1.5 — friendly timeout copy, keep technical in detailedDiag
            setDetailedDiag(`Stalled: all ${total} sources exhausted. Last progress ${Date.now() - lastProgressRef.current}ms ago. Channels: ${getSources(ch).join(" | ")}`);
            setError(friendlyError(408, "timeout"));
            console.error(`[Player] Stall timeout — all ${total} sources exhausted.`);
          }
        }
      }, STALL_TIMEOUT_MS);
    };

    const armConnect = () => {
      timers.armConnect(() => {
        const v = videoRef.current;
        const ch = channelRef.current;
        if (!v || !ch) return;
        // If still not playing after connect timeout, treat as failure
        if (v.readyState < 2) {
          const total = getSources(ch).length;
          const decision = decideAfterFailure({
            sourceIndex: sourceIndexRef.current,
            totalSources: total,
            attempt: attemptRef.current,
          });
          timers.clearRetry();
          timers.clearStall();
          if (decision.kind === "retry") {
            attemptRef.current = decision.nextAttempt;
            setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
            setStatusWithStamp("reconnecting");
            timers.scheduleRetry(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
          } else if (decision.kind === "switch-source") {
            sourceIndexRef.current = decision.nextSourceIndex;
            attemptRef.current = 0;
            setSourceMeta({ index: sourceIndexRef.current, total, attempt: 0 });
            setError(`Switching to backup source…`);
            setStatusWithStamp("reconnecting");
            timers.scheduleRetry(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
          } else {
            clearTimers();
            setStatusWithStamp("error");
            setDetailedDiag(`Connection timeout: all ${total} sources exhausted. Channels: ${getSources(ch).join(" | ")}`);
            setError(friendlyError(408, "timeout"));
            console.error(`[Player] Connection timeout — all ${total} sources exhausted.`);
          }
        }
      }, CONNECT_TIMEOUT_MS);
    };

    const onWaiting = () => {
      setStatusWithStamp("buffering");
      armStall();
    };
    const onPlaying = () => {
      clearTimers();
      lastProgressRef.current = Date.now();
      mediaRecoverRef.current = 0;
      setStatusWithStamp("idle");
      refreshTracks();
      applySpeed(video, speedRef.current);
    };
    const onCanPlay = () => {
      lastProgressRef.current = Date.now();
      timers.clearConnect();
      timers.clearStall();
      setStatus((s) => (s === "loading" || s === "buffering" ? "idle" : s));
    };
    const onTimeUpdate = () => {
      lastProgressRef.current = Date.now();
    };
    const onProgress = () => {
      lastProgressRef.current = Date.now();
    };
    const onLoadedMeta = () => {
      refreshTracks();
      applySpeed(video, speedRef.current);
      const url = sources[0];
      const isLikelyHls = url.includes(".m3u8") || url.includes("m3u8");
      if (!isLikelyHls || !Hls.isSupported()) tryShowResumePrompt(channel.kind);
    };
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("loadedmetadata", onLoadedMeta);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", onProgress);

    const url0 = sources[0];
    const isLikelyHls = url0.includes(".m3u8") || url0.includes("m3u8");
    if (isLikelyHls && Hls.isSupported()) {
      attachHls(video, url0);
      video.addEventListener("playing", onPlaying);
      armConnect();
    } else {
      video.onloadeddata = null;
      video.onerror = null;
      video.src = url0;
      armConnect();
      const onLoaded = () => {
        timers.clearConnect();
        lastProgressRef.current = Date.now();
        setStatusWithStamp("idle");
        refreshTracks();
        applySpeed(video, speedRef.current);
      };
      const onErr = () => {
        clearTimers();
        const ch = channelRef.current;
        if (!ch) return;
        const curSources = getSources(ch);
        const total = curSources.length;
        const decision = decideAfterFailure({
          sourceIndex: sourceIndexRef.current,
          totalSources: total,
          attempt: attemptRef.current,
        });
        if (decision.kind === "retry") {
          attemptRef.current = decision.nextAttempt;
          setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
          setStatusWithStamp("reconnecting");
          timers.scheduleRetry(() => {
            const cur = channelRef.current;
            const curV = videoRef.current;
            if (!cur || !curV) return;
            const curUrl = getSources(cur)[sourceIndexRef.current];
            if (!curUrl) return;
            // Re-arm listeners for next attempt (previous were once:true and removed)
            curV.addEventListener("loadeddata", onLoaded, { once: true });
            curV.addEventListener("error", onErr, { once: true });
            armConnect();
            curV.src = curUrl;
            void curV.play().catch(() => {});
            applySpeed(curV, speedRef.current);
          }, decision.delayMs);
        } else if (decision.kind === "switch-source") {
          sourceIndexRef.current = decision.nextSourceIndex;
          attemptRef.current = 0;
          setSourceMeta({ index: sourceIndexRef.current, total, attempt: 0 });
          setStatusWithStamp("reconnecting");
          setError(`Switching to backup source…`);
          timers.scheduleRetry(() => {
            const cur = channelRef.current;
            const curV = videoRef.current;
            if (!cur || !curV) return;
            const nextUrl = getSources(cur)[decision.nextSourceIndex];
            curV.addEventListener("loadeddata", onLoaded, { once: true });
            curV.addEventListener("error", onErr, { once: true });
            armConnect();
            curV.src = nextUrl;
            void curV.play().catch(() => {});
            applySpeed(curV, speedRef.current);
          }, decision.delayMs);
        } else {
          setStatusWithStamp("error");
          // 1.5 — friendly default copy, technical in detailedDiag
          setDetailedDiag(`Unable to play: all ${total} sources exhausted. Tried: ${curSources.join(" | ")}`);
          setError(friendlyError(undefined, "networkerror"));
          console.error(`[Player] Unable to play — all ${total} sources exhausted. Tried:`, curSources);
        }
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
      void video.play().catch(() => {});
    }
    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("loadedmetadata", onLoadedMeta);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", onProgress);
      clearTimers();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, attachHls, loadAtSource]);

  // periodic resume save — only for VOD (movie/episode), not live
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !channel) return;
    if (channel.kind === "live") return;
    if (resumePrompt) return;
    let saveTimer: number | null = null;
    const maybeSave = () => {
      const pos = v.currentTime;
      const dur = v.duration;
      if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return;
      if (dur - pos < 10) {
        clearPosition(channel.id);
        return;
      }
      savePosition(channel.id, pos, dur);
    };
    const onTime = () => {
      if (saveTimer !== null) return;
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        maybeSave();
      }, 1000);
    };
    const onPause = () => maybeSave();
    const onEnded = () => clearPosition(channel.id);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    const interval = window.setInterval(maybeSave, 5000);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      window.clearInterval(interval);
      maybeSave();
    };
  }, [channel, savePosition, clearPosition, resumePrompt]);

  /**
   * 1.4 — Simplified double-click zones:
   * - Live always toggles fullscreen (TV-like behavior)
   * - VOD: pct < 0.35 => seek back, pct > 0.65 => seek forward, else fullscreen
   * Removed y > height-96 / y < 56 special cases per spec.
   * Single source of truth: isLive check via channelRef.
   */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const v = videoRef.current;
      if (!v) {
        void toggleFullscreen();
        return;
      }
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width || 1;
      const isLive = channelRef.current?.kind == null || channelRef.current?.kind === "live";
      // Live: always fullscreen (like TV zap behavior)
      if (isLive) {
        void toggleFullscreen();
        return;
      }
      const pct = x / w;
      if (pct < 0.35) {
        handleSeek(-skipDuration);
      } else if (pct > 0.65) {
        handleSeek(skipDuration);
      } else {
        void toggleFullscreen();
      }
    },
    [toggleFullscreen, handleSeek, skipDuration]
  );

  // 1.6 — Auto-next helpers
  const resolvedNext = autoNext?.next ?? nextEpisode ?? null;
  const resolvedCountdown = autoNext?.countdown ?? 5;

  const clearAutoNextTimers = useCallback(() => {
    if (autoNextTimerRef.current !== null) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    if (autoNextIntervalRef.current !== null) {
      window.clearInterval(autoNextIntervalRef.current);
      autoNextIntervalRef.current = null;
    }
  }, []);

  const cancelAutoNext = useCallback(() => {
    clearAutoNextTimers();
    setAutoNextOverlay(null);
  }, [clearAutoNextTimers]);

  const triggerAutoNext = useCallback(() => {
    const nxt = resolvedNext;
    if (!nxt) return;
    if (autoNextIntervalRef.current) window.clearInterval(autoNextIntervalRef.current);
    if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
    setAutoNextOverlay({ next: nxt, countdown: resolvedCountdown, total: resolvedCountdown });
    let remaining = resolvedCountdown;
    autoNextIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (autoNextIntervalRef.current) window.clearInterval(autoNextIntervalRef.current);
        autoNextIntervalRef.current = null;
      }
      setAutoNextOverlay(prev => prev ? { ...prev, countdown: Math.max(0, remaining) } : prev);
    }, 1000);
    autoNextTimerRef.current = window.setTimeout(() => {
      clearAutoNextTimers();
      setAutoNextOverlay(null);
      if (onNextEpisode) onNextEpisode(nxt);
      else if (onEnded) onEnded();
    }, resolvedCountdown * 1000);
  }, [resolvedNext, resolvedCountdown, clearAutoNextTimers, onNextEpisode, onEnded]);

  const handlePlayNow = useCallback(() => {
    const nxt = autoNextOverlay?.next ?? resolvedNext;
    if (!nxt) return;
    clearAutoNextTimers();
    setAutoNextOverlay(null);
    if (onNextEpisode) onNextEpisode(nxt);
    else if (onEnded) onEnded();
  }, [autoNextOverlay, resolvedNext, clearAutoNextTimers, onNextEpisode, onEnded]);

  // 1.6 — Listen for video ended when channel is episode to start countdown
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!channel) return;
    if (channel.kind !== "episode") return;
    if (!resolvedNext) return;
    const onEndedVideo = () => {
      // still check episode at time of firing (channelRef may have updated)
      const current = channelRef.current;
      if (!current || current.kind !== "episode") {
        onEnded?.();
        return;
      }
      if (!resolvedNext) {
        onEnded?.();
        return;
      }
      triggerAutoNext();
    };
    v.addEventListener("ended", onEndedVideo);
    return () => v.removeEventListener("ended", onEndedVideo);
  }, [channel, resolvedNext, triggerAutoNext, onEnded]);

  // Also support parent onEnded prop always (even without autoNext)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !onEnded) return;
    // If autoNext already handling ended for episodes, avoid double fire for live? just attach generic
    if (channel?.kind === "episode" && resolvedNext) return;
    const handler = () => onEnded();
    v.addEventListener("ended", handler);
    return () => v.removeEventListener("ended", handler);
  }, [channel, resolvedNext, onEnded]);

  useEffect(() => {
    // cleanup timers on channel switch
    return () => clearAutoNextTimers();
  }, [channel?.id, clearAutoNextTimers]);

  if (!channel) {
    return (
      <div className="player-empty">
        <ColorBar className="colorbar--dim" />
        <p className="player-empty-title">No signal</p>
        <p className="player-empty-hint">Select a channel from the guide.</p>
      </div>
    );
  }

  return (
    <div className="player" onDoubleClick={handleDoubleClick}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="player-video"
        style={
          {
            objectFit: fitMode as any,
            transformOrigin: "center center",
          } as React.CSSProperties
        }
      />
      <PlayerControls
        videoRef={videoRef}
        channel={channel}
        onRetry={retry}
        fitMode={fitMode}
        onCycleFitMode={videoZoom.cycleFitMode}
        onBack={onBack}
        speed={speed}
        onSpeedChange={saveSpeed}
        audioTracks={audioTracks}
        subtitleTracks={subtitleTracks}
        audioId={audioId}
        subtitleId={subtitleId}
        onSwitchAudio={switchAudio}
        onSwitchSubtitle={switchSubtitle}
        levels={levels}
        currentLevel={currentLevel}
        onSelectLevel={handleSelectLevel}
        onZapPrev={zapList && zapList.length > 1 && (channel?.kind == null || channel?.kind === "live") ? () => zapDelta(-1) : undefined}
        onZapNext={zapList && zapList.length > 1 && (channel?.kind == null || channel?.kind === "live") ? () => zapDelta(1) : undefined}
        zapOpen={zapOpen}
        onToggleZap={() => {
          if (zapOpen) {
            timers.clearZapHide();
            setZapOpen(false);
          } else {
            setZapOpen(true);
            scheduleZapHide();
          }
        }}
      />
      {zapOpen && zapList && zapList.length > 1 && (
        <ZapOverlay
          list={zapNeighbors(zapList, channel.id, 3)}
          currentId={channel.id}
          getEpgForChannel={getEpgForChannel}
          onSelect={zapSelect}
        />
      )}
      {zapHint && (
        <div className="player-hint" role="status" aria-live="polite">↑/↓ Zap • Shift+↑/↓ Volume</div>
      )}
      {resumePrompt && (
        <ResumePrompt
          position={resumePrompt.position}
          duration={resumePrompt.duration}
          title={channel.name}
          onResume={handleResume}
          onRestart={handleRestart}
        />
      )}
      {/* 1.6 — Auto-next countdown overlay for episodes */}
      {autoNextOverlay && (
        <div className="player-next" role="status" aria-live="polite" style={{ position: "absolute", bottom: 88, left: 16, right: 16, background: "rgba(0,0,0,0.82)", border: "1px solid var(--outline-variant)", borderRadius: 12, padding: "14px 16px", backdropFilter: "blur(8px)", zIndex: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--on-surface-variant)", marginBottom: 4 }}>Up Next</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--on-surface)", lineHeight: 1.3 }}>{autoNextOverlay.next.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", marginTop: 4 }}>in {autoNextOverlay.countdown}s</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="player-retry" onClick={handlePlayNow} aria-label="Play next now" style={{ background: "var(--primary-container)", color: "var(--surface)", fontWeight: 700 }}>Play Now</button>
              <button type="button" className="player-retry" onClick={cancelAutoNext} aria-label="Cancel auto next" style={{ background: "#333" }}>Cancel</button>
            </div>
          </div>
          <div style={{ marginTop: 12, height: 2, background: "rgba(255,255,255,0.14)", borderRadius: 9999, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--signal)", width: `${Math.max(0, (autoNextOverlay.countdown / autoNextOverlay.total) * 100)}%`, transition: "width 1s linear" }} />
          </div>
        </div>
      )}
      {status === "loading" && (
        <div className="player-overlay player-overlay--loading" role="status" aria-live="polite">
          <span className="inline-loader" aria-hidden />
          Tuning {channel.name}…{sourceMeta.total > 1 && <span className="player-source"> SRC {sourceMeta.index + 1}/{sourceMeta.total}</span>}
        </div>
      )}
      {status === "buffering" && (
        <div className="player-overlay player-overlay--buffering" role="status" aria-live="polite">
          <span className="inline-loader" aria-hidden />
          Buffering…{sourceMeta.total > 1 && <span className="player-source"> SRC {sourceMeta.index + 1}/{sourceMeta.total}</span>}
        </div>
      )}
      {status === "reconnecting" && (
        <div className="player-overlay player-overlay--reconnecting" role="status" aria-live="polite">
          <span className="inline-loader" aria-hidden />
          {error ? error : `Reconnecting… (${sourceMeta.attempt}/${MAX_RETRIES})`}
          {sourceMeta.total > 1 && <span className="player-source"> SRC {sourceMeta.index + 1}/{sourceMeta.total}</span>}
        </div>
      )}
      {status === "error" && error && (
        <div className="player-overlay player-error" style={{ maxWidth: "92%", padding: "16px", textAlign: "left", overflowY: "auto", maxHeight: "85%" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span aria-hidden style={{ marginTop: "2px" }}>!</span>
            <span style={{ flex: 1, wordBreak: "break-word" }}>{error}</span>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            <button type="button" className="player-retry" onClick={retry} aria-label="Retry playback">Retry</button>
            <button type="button" className="player-retry" onClick={() => setShowDiag(v => !v)} aria-label="Toggle diagnostics" style={{ background: "#333" }}>{showDiag ? "Hide Details" : "Show Details"}</button>
            <button type="button" className="player-retry" onClick={() => {
              const diag = detailedDiag ?? `Channel: ${channel.name}\nURL: ${channel.url}\nAlt: ${(channel.altUrls ?? []).join(" | ") || "none"}\nHeaders: ${channel.headers ? JSON.stringify(channel.headers) : "none"}\nSources tried: ${getSources(channel).join("\n")}\nSRC ${sourceMeta.index+1}/${sourceMeta.total} attempt ${sourceMeta.attempt}/${MAX_RETRIES}\nError: ${error}\nDetailed: ${detailedDiag ?? "—"}\nHint: Press F12 or Ctrl+Shift+I for DevTools (now unblocked), or test URL in VLC: vlc "${channel.url}"`;
              navigator.clipboard?.writeText(diag).then(()=> alert("Diagnostics copied — paste here")).catch(()=> alert(diag));
            }} aria-label="Copy diagnostics" style={{ background: "#444" }}>Copy Info</button>
          </div>
          {showDiag && (
            <pre style={{ marginTop: "12px", background: "rgba(0,0,0,0.55)", padding: "10px", borderRadius: "6px", fontSize: "11px", lineHeight: "1.4", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "260px", overflowY: "auto" }}>
{`Channel: ${channel.name}
URL: ${channel.url}
AltUrls: ${(channel.altUrls ?? []).join("\n") || "—"}
Headers: ${channel.headers ? JSON.stringify(channel.headers, null, 2) : "—"}
Tried sources:
${getSources(channel).map((u,i)=> ` ${i===sourceMeta.index ? "→" : " "} SRC ${i+1}: ${u}`).join("\n")}
State: ${status} @ SRC ${sourceMeta.index+1}/${sourceMeta.total} attempt ${sourceMeta.attempt}/${MAX_RETRIES}
Friendly: ${error}
Technical:
${detailedDiag ?? "No technical details captured. Check console."}
Tip: F12 now works (was blocked). Test in VLC: vlc "${channel.url}"`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
