import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Channel } from "../types";
import { ColorBar } from "./ColorBar";
import { PlayerControls } from "./player/PlayerControls";
import { ResumePrompt } from "./player/ResumePrompt";
import { useVideoZoom } from "../hooks/useVideoZoom";
import { usePlaybackSpeed } from "../hooks/usePlaybackSpeed";
import { usePlaybackResume } from "../hooks/usePlaybackResume";

interface PlayerProps {
  channel: Channel | null;
  fitMode?: string;
  onBack?: () => void;
  profileId?: string | null;
}

type PlayerStatus = "idle" | "loading" | "buffering" | "reconnecting" | "error";

export interface TrackInfo {
  id: number;
  label: string;
  lang?: string;
}

export function Player({ channel, fitMode: fitModeProp, onBack, profileId = null }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);
  const channelRef = useRef<Channel | null>(null);
  channelRef.current = channel;
  const videoZoom = useVideoZoom();
  const fitMode = (fitModeProp as any) ?? videoZoom.fitMode;
  const { speed, saveSpeed } = usePlaybackSpeed();
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[]>([]);
  const [audioId, setAudioId] = useState<number>(-1);
  const [subtitleId, setSubtitleId] = useState<number>(-1);
  const { getPosition, savePosition, clearPosition } = usePlaybackResume(profileId);
  const getPositionRef = useRef(getPosition);
  const hasPromptedRef = useRef<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ position: number; duration: number } | null>(null);
  const pendingResumeRef = useRef<{ position: number; duration: number } | null>(null);

  const applySpeed = useCallback((v: HTMLVideoElement | null, s: number) => {
    if (!v) return;
    try { v.playbackRate = s; } catch {}
  }, []);

  useEffect(() => {
    applySpeed(videoRef.current, speed);
  }, [speed, applySpeed, channel]);

  const isResumable = useCallback(
    (pos: number, dur: number, kind?: string) => {
      if (kind === "live") return false;
      if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
      if (pos < 10) return false;
      if (dur - pos < 15) return false;
      const pct = pos / dur;
      return pct > 0.01 && pct < 0.985;
    },
    []
  );
  const isResumableRef = useRef(isResumable);
  useEffect(() => { isResumableRef.current = isResumable; }, [isResumable]);
  useEffect(() => { getPositionRef.current = getPosition; }, [getPosition]);

  const tryShowResumePrompt = useCallback(
    (kind?: string) => {
      if (!channel) return;
      if (hasPromptedRef.current === channel.id) return;
      const saved = getPositionRef.current(channel.id);
      if (!saved) return;
      if (!isResumableRef.current(saved.position, saved.duration, kind ?? channel.kind)) {
        // stale (near end or too early) — clean up
        if (saved.duration - saved.position < 15) clearPosition(channel.id);
        return;
      }
      // delay showing until duration is known; if we already have duration, show now
      const v = videoRef.current;
      const dur = v?.duration && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : saved.duration;
      pendingResumeRef.current = { position: saved.position, duration: dur };
      hasPromptedRef.current = channel.id;
      // pause immediately so user sees prompt instead of autoplaying from 0
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
        setAudioTracks(aTracks.map((t, i) => ({ id: t.id ?? i, label: t.name || t.lang || `Audio ${i+1}`, lang: t.lang })));
        setAudioId(typeof (hls as any).audioTrack === "number" ? (hls as any).audioTrack : -1);
      } catch { setAudioTracks([]); }
      try {
        const sTracks: any[] = (hls as any).subtitleTracks ?? [];
        setSubtitleTracks(sTracks.map((t, i) => ({ id: t.id ?? i, label: t.name || t.lang || `Sub ${i+1}`, lang: t.lang })));
        setSubtitleId(typeof (hls as any).subtitleTrack === "number" ? (hls as any).subtitleTrack : -1);
      } catch { setSubtitleTracks([]); }
    } else if (v) {
      // native text tracks fallback
      try {
        const tt = Array.from(v.textTracks) as any[];
        if (tt.length) {
          setSubtitleTracks(tt.map((t, i) => ({ id: i, label: t.label || t.language || `Sub ${i+1}`, lang: t.language })));
          const showing = tt.findIndex((t) => t.mode === "showing");
          setSubtitleId(showing);
        }
      } catch {}
      try {
        const at: any = (v as any).audioTracks;
        if (at && at.length) {
          const arr = Array.from(at as any[]) as any[];
          setAudioTracks(arr.map((t: any, i: number) => ({ id: i, label: t.label || t.language || `Audio ${i+1}`, lang: t.language })));
        }
      } catch {}
    }
  }, []);

  const switchAudio = useCallback((id: number) => {
    const hls = hlsRef.current;
    if (hls && typeof (hls as any).audioTrack !== "undefined") {
      try { (hls as any).audioTrack = id; setAudioId(id); } catch {}
    } else {
      const v: any = videoRef.current;
      const at = v?.audioTracks;
      if (at) {
        for (let i = 0; i < at.length; i++) at[i].enabled = i === id;
        setAudioId(id);
      }
    }
  }, []);

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
      try { (hls as any).subtitleTrack = id; setSubtitleId(id); } catch {}
      // also toggle native textTracks visibility via hls
      const v = videoRef.current;
      if (v) {
        Array.from(v.textTracks).forEach((t: any) => {
          // hls manages showing; keep native in sync if needed
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

  const attachHls = useCallback(
    (video: HTMLVideoElement, url: string) => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("buffering");
        refreshTracks();
        applySpeed(video, speedRef.current);
        // resume prompt — check saved position before autoplaying
        const saved = channelRef.current ? getPosition(channelRef.current.id) : undefined;
        if (saved && isResumable(saved.position, saved.duration, channelRef.current?.kind)) {
          const v = videoRef.current;
          pendingResumeRef.current = { position: saved.position, duration: saved.duration };
          try { v?.pause(); } catch {}
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
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
            setStatus("reconnecting");
            return;
          } catch {}
        }
        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          setStatus("reconnecting");
          setError(null);
          const delay = 1000 * retryCountRef.current;
          window.setTimeout(() => {
            const ch = channelRef.current;
            if (!ch || ch.url !== url) return;
            try {
              hls.startLoad();
            } catch {
              if (video.src !== url) {
                hls.loadSource(url);
              }
            }
          }, delay);
        } else {
          setStatus("error");
          setError(`Stream error: ${data.details}`);
        }
      });
    },
    [refreshTracks, applySpeed]
  );

  const retry = useCallback(() => {
    const v = videoRef.current;
    const ch = channelRef.current;
    if (!v || !ch) return;
    retryCountRef.current = 0;
    setError(null);
    setStatus("loading");
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.removeAttribute("src");
    v.load();
    const isLikelyHls = ch.url.includes(".m3u8") || ch.url.includes("m3u8");
    if (isLikelyHls && Hls.isSupported()) {
      attachHls(v, ch.url);
    } else {
      v.src = ch.url;
      void v.play().catch(() => {});
      applySpeed(v, speedRef.current);
    }
  }, [attachHls, applySpeed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) {
      setStatus("idle");
      setError(null);
      setAudioTracks([]);
      setSubtitleTracks([]);
      setAudioId(-1);
      setSubtitleId(-1);
      return;
    }
    setError(null);
    setStatus("loading");
    retryCountRef.current = 0;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const isLikelyHls = channel.url.includes(".m3u8") || channel.url.includes("m3u8");
    const onWaiting = () => setStatus((s) => (s === "error" ? s : "buffering"));
    const onPlaying = () => { setStatus("idle"); refreshTracks(); applySpeed(video, speedRef.current); };
    const onCanPlay = () => setStatus((s) => (s === "loading" || s === "buffering" ? "idle" : s));
    const onLoadedMeta = () => {
      refreshTracks();
      applySpeed(video, speedRef.current);
      if (!isLikelyHls || !Hls.isSupported()) tryShowResumePrompt(channel.kind);
    };
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("loadedmetadata", onLoadedMeta);
    if (isLikelyHls && Hls.isSupported()) {
      attachHls(video, channel.url);
      video.addEventListener("playing", onPlaying);
    } else {
      video.onloadeddata = null;
      video.onerror = null;
      video.src = channel.url;
      const onLoaded = () => { setStatus("idle"); refreshTracks(); applySpeed(video, speedRef.current); };
      const onErr = () => {
        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          setStatus("reconnecting");
          window.setTimeout(() => {
            const ch = channelRef.current;
            if (!ch || ch.url !== channel.url) return;
            video.src = ch.url;
            void video.play().catch(() => {});
            applySpeed(video, speedRef.current);
          }, 1000 * retryCountRef.current);
        } else {
          setStatus("error");
          setError("Unable to play this stream.");
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
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, attachHls]);

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
    <div className="player" onDoubleClick={toggleFullscreen}>
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
      />
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
          Tuning {channel.name}...
        </div>
      )}
      {status === "buffering" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Buffering...
        </div>
      )}
      {status === "reconnecting" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Reconnecting... ({retryCountRef.current}/3)
        </div>
      )}
      {status === "error" && error && (
        <div className="player-overlay player-error">
          <span aria-hidden>!</span> {error}
          <button type="button" className="player-retry" onClick={retry} aria-label="Retry playback">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
