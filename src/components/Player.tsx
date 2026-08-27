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
  STALL_TIMEOUT_MS,
  decideAfterFailure,
} from "../lib/streamPolicy";
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
      const hls = new Hls({
        maxBufferLength: 30,
        enableWorker: true,
        manifestLoadingTimeOut: CONNECT_TIMEOUT_MS,
        fragLoadingTimeOut: STALL_TIMEOUT_MS,
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
          try {
            hls.recoverMediaError();
            setStatusWithStamp("reconnecting");
            return;
          } catch {}
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
        if (decision.kind === "retry") {
          attemptRef.current = decision.nextAttempt;
          setSourceMeta({ index: sourceIndexRef.current, total, attempt: attemptRef.current });
          setStatusWithStamp("reconnecting");
          setError(null);
          retryTimerRef.current = window.setTimeout(() => {
            const cur = channelRef.current;
            if (!cur) return;
            const curSources = getSources(cur);
            const curUrl = curSources[sourceIndexRef.current];
            if (!curUrl || curUrl !== url) return;
            try {
              hls.startLoad();
            } catch {
              hls.loadSource(curUrl);
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
          setStatusWithStamp("error");
          setError(`Stream error: ${data.details}${total > 1 ? ` (all ${total} sources exhausted)` : ""}`);
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
            setStatusWithStamp("error");
            setError(`Stream stalled — all ${total} sources exhausted.`);
          }
        }
      }, STALL_TIMEOUT_MS);
    };

    const armConnect = () => {
      if (connectTimerRef.current !== null) window.clearTimeout(connectTimerRef.current);
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
          {error?.startsWith("Switching") ? error : `Reconnecting… (${sourceMeta.attempt}/${3})`}
          {sourceMeta.total > 1 && <span className="player-source"> SRC {sourceMeta.index + 1}/{sourceMeta.total}</span>}
        </div>
      )}
      {status === "error" && error && (
        <div className="player-overlay player-error">
          <span aria-hidden>!</span> {error}
          <button
            type="button"
            className="player-retry"
            onClick={retry}
            aria-label="Retry playback"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
