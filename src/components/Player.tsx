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
import { TauriHlsLoader } from "../lib/hlsTauriLoader";
import { zapNeighbors, zapStep } from "../lib/zap";
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

export function Player({ channel, fitMode: fitModeProp, onBack, profileId = null, zapList, onZap, getEpgForChannel }: PlayerProps) {
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
  const retryTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  const statusSinceRef = useRef<number>(Date.now());
  const lastProgressRef = useRef<number>(Date.now());
  const [zapOpen, setZapOpen] = useState(false);
  const zapHideRef = useRef<number | null>(null);
  const zapOpenRef = useRef(false);
  useEffect(() => { zapOpenRef.current = zapOpen; }, [zapOpen]);

  // Media (codec/MSE) recovery budget — stops recoverMediaError from looping forever.
  const MAX_MEDIA_RECOVER = 2;
  const mediaRecoverRef = useRef(0);
  const [showDiag, setShowDiag] = useState(false);

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
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (connectTimerRef.current !== null) {
      window.clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
  }, []);

  const setStatusWithStamp = useCallback((s: PlayerStatus) => {
    statusSinceRef.current = Date.now();
    setStatus(s);
  }, []);

  const scheduleZapHide = useCallback(() => {
    if (zapHideRef.current !== null) window.clearTimeout(zapHideRef.current);
    zapHideRef.current = window.setTimeout(() => setZapOpen(false), 4000);
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
    }
  }, [zapList, channel, onZap, scheduleZapHide]);

  const zapSelect = useCallback((ch: Channel) => {
    if (!onZap) return;
    setZapOpen(true);
    scheduleZapHide();
    onZap(ch);
  }, [onZap, scheduleZapHide]);

  useEffect(() => {
    if (!zapList || zapList.length < 2 || !channel) return;
    const isLive = channel.kind == null || channel.kind === "live";
    if (!isLive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        zapDelta(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        zapDelta(1);
      } else if (e.key === "Escape" && zapOpenRef.current) {
        e.preventDefault();
        if (zapHideRef.current !== null) window.clearTimeout(zapHideRef.current);
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
      // Pre-ee60990 ignored them -> 403. Inject them into the Tauri loader via context.headers.
      const chHeaders = channelRef.current?.headers;
      const LoaderClass = chHeaders
        ? class extends TauriHlsLoader {
            load(ctx: never, cfg: never, cb: never) {
              (ctx as unknown as { headers?: Record<string, string> }).headers = {
                ...chHeaders,
                ...((ctx as unknown as { headers?: Record<string, string> }).headers ?? {}),
              };
              return super.load(ctx as never, cfg as never, cb as never);
            }
          }
        : TauriHlsLoader;
      const hls = new Hls({
        maxBufferLength: 30,
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
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        lastProgressRef.current = Date.now();
        if (stallTimerRef.current !== null) {
          window.clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRecoverRef.current < MAX_MEDIA_RECOVER) {
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
        // Clear stall/connect timers to avoid races with retry (fix hang at 3/3)
        if (stallTimerRef.current !== null) {
          window.clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        if (connectTimerRef.current !== null) {
          window.clearTimeout(connectTimerRef.current);
          connectTimerRef.current = null;
        }
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        if (decision.kind === "retry") {
          attemptRef.current = decision.nextAttempt;
          setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
          setStatusWithStamp("reconnecting");
          setError(null);
          retryTimerRef.current = window.setTimeout(() => {
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
          retryTimerRef.current = window.setTimeout(() => {
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
          // Try HLS-native fallback as last resort: some Xtream panels serve raw TS even when .m3u8 403s —
          // or CORS panel blocks m3u8 but TS is fetchable. Attempt direct video.src before hard-failing.
          const curV = videoRef.current;
          const lastUrl = sources[sourceIndexRef.current];
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
              setError(`Stream error: ${data.type}/${data.details}${ndMsg ? ` — ${ndMsg}` : httpCode ? ` — HTTP ${httpCode}` : ""}${total > 1 ? ` (all ${total} sources exhausted)` : ""} — check provider/server credentials or try VLC with same URL.`);
            });
            // If native also errors, the video.onerror handler (re-armed) will surface the final error.
            // Attach a one-shot native error to guarantee we don't hang in buffering.
            const onNativeFail = () => {
              curV.removeEventListener("error", onNativeFail);
              setStatusWithStamp("error");
              setError(`Stream error: ${data.type}/${data.details}${ndMsg ? ` — ${ndMsg}` : httpCode ? ` — HTTP ${httpCode}` : ""}${total > 1 ? ` (all ${total} sources exhausted)` : ""} — provider returned ${httpCode ?? "network error"} for ${ (()=>{try{return new URL(lastUrl).host}catch{return lastUrl}})() }. Verify username/password, max_connections, and that the line is active in provider panel.`);
            };
            curV.addEventListener("error", onNativeFail, { once: true });
            return;
          }
          setStatusWithStamp("error");
          // Prefer explicit HTTP code when hls.js hides it as "networkError/manifestLoadError"
          const codeHint = httpCode && httpCode !== 0 ? ` — HTTP ${httpCode}` : ndMsg ? ` — ${ndMsg}` : "";
          const hostHint = (()=>{ try{ return lastUrl ? new URL(lastUrl).host : "" }catch{ return "" } })();
          // Extra hint for mhiptv.info-style providers where port was omitted — pre-ee60990 required exact port.
          const isTypoHost = hostHint.includes("frequancy");
          const isAmagi = hostHint.includes("amagi.tv");
          const portHint = isTypoHost
            ? ` — URL has typo frequancy → frequency (auto-corrected), if still fails host may be offline.`
            : isAmagi && httpCode === 403
            ? ` — amagi.tv Samsung AU is geo-blocked outside AU (CloudFront 403). Try VLC in AU VPN or pick non-AU variant (US/EU).`
            : hostHint && !hostHint.includes(":") && (hostHint === "mhiptv.info" || hostHint.includes("mhiptv"))
            ? ` — check server URL includes port (e.g. http://mhiptv.info:8080 or :25461). Provider panel shows correct port.`
            : hostHint.includes("frequency.stream") || hostHint.includes("linear-")
            ? ` — frequency.stream linear channels often require exact Referer; now auto-handled, if 403 try VLC test: vlc "${lastUrl}"`
            : total > 1 && httpCode === 403 ? ` — try re-entering server with http:// and correct port, or test URL in VLC.`
            : httpCode === 403 ? ` — HTTP 403 usually means geo-block or expired token. Test in VLC: vlc "${lastUrl}" — if VLC also 403, stream is dead/geo-blocked.`
            : "";
          setError(
            `Stream error: ${data.type}/${data.details}${codeHint}${total > 1 ? ` (all ${total} sources exhausted)` : ""}${hostHint ? ` @ ${hostHint}` : ""}${portHint}`
          );
          if (total > 1) console.error(`[Player] All ${total} sources failed. Tried:`, sources, `last details:`, data.details, `code:`, httpCode, `hint: re-enter server URL exactly as provider gave (with :port) or check max_connections/line status.`);
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
      setAudioTracks([]);
      setSubtitleTracks([]);
      setAudioId(-1);
      setSubtitleId(-1);
      setSourceMeta({ index: 0, total: 1, attempt: 0 });
      return;
    }
    setError(null);
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
      if (stallTimerRef.current !== null) window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = window.setTimeout(() => {
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
            // Clear any pending retry before scheduling new one (avoid overlap hang at 3/3)
            if (retryTimerRef.current !== null) {
              window.clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
            if (stallTimerRef.current !== null) {
              window.clearTimeout(stallTimerRef.current);
              stallTimerRef.current = null;
            }
            if (connectTimerRef.current !== null) {
              window.clearTimeout(connectTimerRef.current);
              connectTimerRef.current = null;
            }
            setStatusWithStamp("reconnecting");
            // Reuse the same retry path as HLS error: just reload at current/next source
            if (decision.kind === "retry") {
              attemptRef.current = decision.nextAttempt;
              setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
              retryTimerRef.current = window.setTimeout(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
            } else {
              sourceIndexRef.current = decision.nextSourceIndex;
              attemptRef.current = 0;
              setSourceMeta({ index: sourceIndexRef.current, total, attempt: 0 });
              setError(`Switching to backup source…`);
              retryTimerRef.current = window.setTimeout(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
            }
          } else {
            clearTimers();
            setStatusWithStamp("error");
            setError(`Stream stalled — all ${total} sources exhausted.`);
          }
        }
      }, STALL_TIMEOUT_MS);
    };

    const armConnect = () => {
      if (connectTimerRef.current !== null) window.clearTimeout(connectTimerRef.current);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      connectTimerRef.current = window.setTimeout(() => {
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
          if (retryTimerRef.current !== null) {
            window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          if (decision.kind === "retry") {
            attemptRef.current = decision.nextAttempt;
            setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
            setStatusWithStamp("reconnecting");
            retryTimerRef.current = window.setTimeout(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
          } else if (decision.kind === "switch-source") {
            sourceIndexRef.current = decision.nextSourceIndex;
            attemptRef.current = 0;
            setSourceMeta({ index: sourceIndexRef.current, total, attempt: 0 });
            setError(`Switching to backup source…`);
            setStatusWithStamp("reconnecting");
            retryTimerRef.current = window.setTimeout(() => loadAtSource(v, ch, sourceIndexRef.current), decision.delayMs);
          } else {
            clearTimers();
            setStatusWithStamp("error");
            setError(`Connection timeout — all ${total} sources exhausted.`);
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
      if (connectTimerRef.current !== null) {
        window.clearTimeout(connectTimerRef.current);
        connectTimerRef.current = null;
      }
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
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
        if (connectTimerRef.current !== null) {
          window.clearTimeout(connectTimerRef.current);
          connectTimerRef.current = null;
        }
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
          retryTimerRef.current = window.setTimeout(() => {
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
          retryTimerRef.current = window.setTimeout(() => {
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
          setError(`Unable to play this stream.${total > 1 ? ` (all ${total} sources exhausted)` : ""}`);
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
      const y = e.clientY - rect.top;
      if (y > rect.height - 96) {
        void toggleFullscreen();
        return;
      }
      if (y < 56) {
        void toggleFullscreen();
        return;
      }
      const isLive = channelRef.current?.kind == null || channelRef.current?.kind === "live";
      const pct = x / w;
      if (!isLive && pct < 0.35) {
        handleSeek(-skipDuration);
      } else if (pct > 0.65) {
        handleSeek(skipDuration);
      } else {
        void toggleFullscreen();
      }
    },
    [toggleFullscreen, handleSeek, skipDuration]
  );

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
        onZapPrev={zapList && zapList.length > 1 && (channel?.kind == null || channel?.kind === "live") ? () => zapDelta(-1) : undefined}
        onZapNext={zapList && zapList.length > 1 && (channel?.kind == null || channel?.kind === "live") ? () => zapDelta(1) : undefined}
        zapOpen={zapOpen}
        onToggleZap={() => {
          if (zapOpen) {
            if (zapHideRef.current !== null) window.clearTimeout(zapHideRef.current);
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
      {resumePrompt && (
        <ResumePrompt
          position={resumePrompt.position}
          duration={resumePrompt.duration}
          title={channel.name}
          onResume={handleResume}
          onRestart={handleRestart}
        />
      )}
      {status === "loading" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Tuning {channel.name}…{sourceMeta.total > 1 && <span className="player-source"> SRC {sourceMeta.index + 1}/{sourceMeta.total}</span>}
        </div>
      )}
      {status === "buffering" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Buffering…{sourceMeta.total > 1 && <span className="player-source"> SRC {sourceMeta.index + 1}/{sourceMeta.total}</span>}
        </div>
      )}
      {status === "reconnecting" && (
        <div className="player-overlay">
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
              const diag = `Channel: ${channel.name}\nURL: ${channel.url}\nAlt: ${(channel.altUrls ?? []).join(" | ") || "none"}\nHeaders: ${channel.headers ? JSON.stringify(channel.headers) : "none"}\nSources tried: ${getSources(channel).join("\n")}\nSRC ${sourceMeta.index+1}/${sourceMeta.total} attempt ${sourceMeta.attempt}/${MAX_RETRIES}\nError: ${error}\nHint: Press F12 or Ctrl+Shift+I for DevTools (now unblocked), or test URL in VLC: vlc "${channel.url}"`;
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
Error: ${error}
Tip: F12 now works (was blocked). Test in VLC: vlc "${channel.url}"`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
