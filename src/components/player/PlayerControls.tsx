import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "../../types";
import { useSkipDuration } from "../../hooks/useSkipDuration";
import type { TrackInfo } from "../Player";

interface PlayerControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  channel: Channel | null;
  onRetry?: () => void;
  fitMode?: string;
  onCycleFitMode?: () => void;

  speed?: number;
  onSpeedChange?: (s: number) => void;
  audioTracks?: TrackInfo[];
  subtitleTracks?: TrackInfo[];
  audioId?: number;
  subtitleId?: number;
  onSwitchAudio?: (id: number) => void;
  onSwitchSubtitle?: (id: number) => void;
  onBack?: () => void;
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const FIT_LABELS: Record<string, string> = {
  contain: "Fit",
  cover: "Cover",
  fill: "Fill",
  "scale-down": "Small",
  none: "1:1",
};

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// inline SVG icons - minimal, crisp, 16x16 viewBox
const IconPlay = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M4 3.5L13 8L4 12.5V3.5Z" fill="currentColor" />
  </svg>
);
const IconPause = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="4" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
    <rect x="9" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
  </svg>
);
const IconSkipBack = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M11 13L5 8L11 3V13Z" fill="currentColor" />
    <path d="M4 4H5V12H4V4Z" fill="currentColor" opacity="0.9" />
  </svg>
);
const IconSkipFwd = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M5 13L11 8L5 3V13Z" fill="currentColor" />
    <path d="M11 4H12V12H11V4Z" fill="currentColor" opacity="0.9" />
  </svg>
);
const IconVolume = ({ muted, level }: { muted: boolean; level: number }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    {muted || level === 0 ? (
      <path d="M9 4L6 6H3V10H6L9 12V4Z M11 6L13 8L11 10 M13 5L15 8L13 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    ) : level < 0.5 ? (
      <path d="M9 4L6 6H3V10H6L9 12V4Z M10.5 6.5C11.2 7.2 11.2 8.8 10.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    ) : (
      <path d="M9 4L6 6H3V10H6L9 12V4Z M10.5 6C11.6 7 11.6 9 10.5 10 M12 4.5C13.8 6.2 13.8 9.8 12 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    )}
  </svg>
);
const IconCC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5 8H7 M9 8H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const IconAudio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 3C8 3 6 5 6 7C6 9 8 11 8 11C8 11 10 9 10 7C10 5 8 3 8 3Z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M4 8C4 11 6 13 8 13C10 13 12 11 12 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const IconSpeed = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 8L11 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M8 5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const IconFit = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3 6V3H6 M10 3H13V6 M13 10V13H10 M6 13H3V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="5" y="5" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
  </svg>
);
const IconPip = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="3" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="7.5" y="6" width="5" height="3.5" rx="0.5" fill="currentColor" opacity="0.9" />
  </svg>
);
const IconFullscreen = ({ isFullscreen }: { isFullscreen: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    {isFullscreen ? (
      <path d="M6 3H3V6 M10 3H13V6 M6 13H3V10 M10 13H13V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    ) : (
      <path d="M3 6V3H6 M10 3H13V6 M13 10V13H10 M6 13H3V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    )}
  </svg>
);

export function PlayerControls({ videoRef, channel, onRetry, fitMode = "contain", onCycleFitMode, speed = 1, onSpeedChange, audioTracks = [], subtitleTracks = [], audioId = -1, subtitleId = -1, onSwitchAudio, onSwitchSubtitle, onBack }: PlayerControlsProps) {
  const { skipDuration } = useSkipDuration();
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [visible, setVisible] = useState(true);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [seekHover, setSeekHover] = useState<{ time: number; left: number } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  const isLive = channel?.kind === "live" || !Number.isFinite(duration) || duration === 0 || duration === Infinity;
  const seekable = !isLive && duration > 0;

  const scheduleHide = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (!paused) {
      hideTimer.current = window.setTimeout(() => setVisible(false), 3000);
    }
  }, [paused]);

  const toggleVisible = useCallback(() => {
    if (visible) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setVisible(false);
    } else {
      scheduleHide();
    }
  }, [visible, scheduleHide]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => setDuration(v.duration);
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onPiPEnter = () => setIsPiP(true);
    const onPiPLeave = () => setIsPiP(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("enterpictureinpicture", onPiPEnter as EventListener);
    v.addEventListener("leavepictureinpicture", onPiPLeave as EventListener);
    document.addEventListener("fullscreenchange", onFs);
    setVolume(v.volume);
    setMuted(v.muted);
    setPaused(v.paused);
    setDuration(v.duration);
    setCurrent(v.currentTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("enterpictureinpicture", onPiPEnter as EventListener);
      v.removeEventListener("leavepictureinpicture", onPiPLeave as EventListener);
      document.removeEventListener("fullscreenchange", onFs);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
    scheduleHide();
  }, [videoRef, scheduleHide]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, [videoRef]);

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = videoRef.current;
      if (!v) return;
      const vol = Number(e.target.value);
      v.volume = vol;
      v.muted = vol === 0;
    },
    [videoRef]
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = videoRef.current;
      if (!v || !seekable) return;
      v.currentTime = Number(e.target.value);
    },
    [videoRef, seekable]
  );

  const toggleFullscreen = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const playerEl = (controlsRef.current?.parentElement ?? v.parentElement) as HTMLElement | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (playerEl && playerEl.requestFullscreen) await playerEl.requestFullscreen();
      else await v.requestFullscreen();
    } catch {
      try { if (playerEl && !document.fullscreenElement) await playerEl.requestFullscreen(); } catch {}
    }
    scheduleHide();
  }, [videoRef, scheduleHide]);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled && v.readyState > 0) await v.requestPictureInPicture();
    } catch {}
    scheduleHide();
  }, [videoRef, scheduleHide]);

  const skip = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (seekable) v.currentTime = Math.max(0, Math.min(duration, v.currentTime + delta));
      else if (delta < 0) v.currentTime = Math.max(0, v.currentTime + delta);
      else v.currentTime = v.currentTime + delta;
      scheduleHide();
    },
    [videoRef, seekable, duration, scheduleHide]
  );
  const skipBack = useCallback(() => skip(-skipDuration), [skip, skipDuration]);
  const skipForward = useCallback(() => skip(skipDuration), [skip, skipDuration]);

  const handleBack = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
    onBack?.();
    scheduleHide();
  }, [onBack, scheduleHide]);

  const lastToggleRef = useRef(0);
  const guardedToggle = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 300) return;
    lastToggleRef.current = now;
    toggleVisible();
  }, [toggleVisible]);

  useEffect(() => {
    const isInteractive = (el: HTMLElement | null) => !!el?.closest("button, input, [role=\"slider\"]");
    const isInPlayer = (target: HTMLElement | null) => {
      if (!target) return false;
      const playerEl = target.closest?.(".player") as HTMLElement | null;
      if (!playerEl) return false;
      if (controlsRef.current && !playerEl.contains(controlsRef.current)) return false;
      return true;
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!isInPlayer(target)) return;
      if (isInteractive(target)) return;
      guardedToggle();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [guardedToggle]);

  useEffect(() => {
    const playerEl = videoRef.current?.parentElement as HTMLElement | null;
    if (!playerEl) return;
    const isInteractive = (el: HTMLElement | null) => !!el?.closest("button, input, [role=\"slider\"]");
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (isInteractive(target)) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      guardedToggle();
    };
    playerEl.addEventListener("click", handler);
    return () => playerEl.removeEventListener("click", handler);
  }, [guardedToggle, channel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          void toggleFullscreen();
          break;
        case "p":
          e.preventDefault();
          void togglePiP();
          break;
        case "z":
          e.preventDefault();
          onCycleFitMode?.();
          scheduleHide();
          break;
        case "c":
          e.preventDefault();
          if (subtitleId === -1 && subtitleTracks.length) onSwitchSubtitle?.(subtitleTracks[0].id);
          else onSwitchSubtitle?.(-1);
          scheduleHide();
          break;
        case ",":
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(speed);
            if (idx > 0) onSpeedChange?.(SPEEDS[idx-1]);
          }
          scheduleHide();
          break;
        case ".":
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(speed);
            if (idx < SPEEDS.length-1) onSpeedChange?.(SPEEDS[idx+1]);
          }
          scheduleHide();
          break;
        case "arrowleft":
          if (seekable) {
            e.preventDefault();
            v.currentTime = Math.max(0, v.currentTime - skipDuration);
            scheduleHide();
          }
          break;
        case "arrowright":
          if (seekable) {
            e.preventDefault();
            v.currentTime = Math.min(duration, v.currentTime + skipDuration);
            scheduleHide();
          }
          break;
        case "arrowup":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          v.muted = false;
          break;
        case "arrowdown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          if (v.volume === 0) v.muted = true;
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoRef, togglePlay, toggleMute, toggleFullscreen, togglePiP, seekable, duration, skipDuration, scheduleHide, onCycleFitMode, speed, onSpeedChange, subtitleId, subtitleTracks, onSwitchSubtitle]);

  useEffect(() => {
    if (!visible) { setSpeedOpen(false); setAudioOpen(false); setSubsOpen(false); }
  }, [visible]);

  if (!channel) return null;
  const pipSupported = typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled);

  return (
    <>
      {isFullscreen && (
        <div className={`pc-top-bar ${visible ? "is-visible" : "is-hidden"}`}>

          <button type="button" className="pc-back" onClick={handleBack} aria-label="Back" data-tip="Back (Esc)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M10 13L5 8L10 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="pc-top-title" title={channel?.name}>{channel?.name}</span>
          <button type="button" className="pc-top-exit" onClick={handleBack} aria-label="Exit fullscreen" data-tip="Exit fullscreen">✕</button>
        </div>
      )}
    <div
      ref={controlsRef}
      className={`player-controls ${visible ? "is-visible" : "is-hidden"}`}
      onMouseMove={scheduleHide}
      onMouseLeave={() => {
        if (!paused && hideTimer.current) window.clearTimeout(hideTimer.current);
        if (!paused) hideTimer.current = window.setTimeout(() => setVisible(false), 800);
      }}
      onDoubleClick={() => { void toggleFullscreen(); }}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("button, input, [role=\"slider\"]")) return;
        guardedToggle();
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="toolbar"
      aria-label="Playback controls"
    >
      <div className="pc-center">
        <button
          type="button"
          className="pc-btn pc-btn--skip"
          onClick={skipBack}
          aria-label={`Back ${skipDuration} seconds`}
          data-tip={`Back ${skipDuration}s (Left)`}
          title={`Back ${skipDuration}s`}
          disabled={!seekable && current <= 0}
        >
          <IconSkipBack />
          <span className="pc-skip-label">{skipDuration}</span>
        </button>
        <button type="button" className="pc-btn pc-btn--center" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"} data-tip={paused ? "Play (Space)" : "Pause (Space)"}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        <button
          type="button"
          className="pc-btn pc-btn--skip"
          onClick={skipForward}
          aria-label={`Forward ${skipDuration} seconds`}
          data-tip={`Forward ${skipDuration}s (Right)`}
          title={`Forward ${skipDuration}s`}
          disabled={!seekable && isLive}
        >
          <span className="pc-skip-label">{skipDuration}</span>
          <IconSkipFwd />
        </button>
      </div>

      <div className="pc-bottom">
        <div className="pc-progress-wrap">
          <div className="pc-time">
            {isLive ? <span className="pc-live"><span className="pc-live-dot" />Live</span> : <span>{fmtTime(current)} <span className="pc-time-sep">/</span> {fmtTime(duration)}</span>}
          </div>
          {seekable ? (
            <div
              className="pc-seek-wrap"
              onMouseMove={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, x / rect.width));
                setSeekHover({ time: pct * duration, left: pct * 100 });
              }}
              onMouseLeave={() => setSeekHover(null)}
            >
              {seekHover && (
                <div className="pc-seek-tip" style={{ left: `${seekHover.left}%` } as React.CSSProperties} aria-hidden>
                  {fmtTime(seekHover.time)}
                </div>
              )}
              <input
                className="pc-seek"
                type="range"
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={duration || 0}
                aria-valuenow={Math.floor(current)}
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={handleSeek}
                style={{ background: `linear-gradient(to right, var(--signal) 0%, var(--signal) ${duration ? (current / duration) * 100 : 0}%, rgba(255,255,255,0.16) ${duration ? (current / duration) * 100 : 0}%, rgba(255,255,255,0.16) 100%)` } as React.CSSProperties}
              />
            </div>
          ) : (
            <div className="pc-seek pc-seek--live" aria-hidden />
          )}
        </div>

        <div className="player-controls-row">
          <div className="pc-group pc-group--primary">
            <button type="button" className="pc-btn pc-btn--play" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"} data-tip={paused ? "Play (k)" : "Pause (k)"}>
              {paused ? <IconPlay /> : <IconPause />}
            </button>
            <button
              type="button"
              className="pc-btn pc-btn--mute"
              onClick={toggleMute}
              data-tip={muted || volume === 0 ? "Unmute (m)" : "Mute (m)"}
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            >
              <IconVolume muted={muted || volume === 0} level={muted ? 0 : volume} />
            </button>
            <input
              className="pc-volume"
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolume}
            />
          </div>

          <div className="pc-divider" aria-hidden />

          <div className="pc-group pc-group--media">
            <div className="pc-menu-wrap">
              <button type="button" className={`pc-btn ${subtitleId !== -1 ? "is-active" : ""}`} onClick={() => { setSubsOpen(!subsOpen); setAudioOpen(false); setSpeedOpen(false); scheduleHide(); }} aria-label="Subtitles" data-tip="Subtitles (C)" title="Subtitles (C)">
                <IconCC />
              </button>
              {subsOpen && (
                <div className="pc-menu">
                  <button type="button" className={`pc-menu-item ${subtitleId === -1 ? "active" : ""}`} onClick={() => { onSwitchSubtitle?.(-1); setSubsOpen(false); scheduleHide(); }}>
                    Off
                  </button>
                  {subtitleTracks.length === 0 && <div className="pc-menu-empty">No subtitles</div>}
                  {subtitleTracks.map((t) => (
                    <button key={t.id} type="button" className={`pc-menu-item ${subtitleId === t.id ? "active" : ""}`} onClick={() => { onSwitchSubtitle?.(t.id); setSubsOpen(false); scheduleHide(); }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="pc-menu-wrap">
              <button type="button" className="pc-btn" onClick={() => { setAudioOpen(!audioOpen); setSubsOpen(false); setSpeedOpen(false); scheduleHide(); }} aria-label="Audio track" data-tip="Audio" title="Audio">
                <IconAudio />
              </button>
              {audioOpen && (
                <div className="pc-menu">
                  {audioTracks.length === 0 && <div className="pc-menu-empty">No alt audio</div>}
                  {audioTracks.map((t) => (
                    <button key={t.id} type="button" className={`pc-menu-item ${audioId === t.id ? "active" : ""}`} onClick={() => { onSwitchAudio?.(t.id); setAudioOpen(false); scheduleHide(); }}>
                      {t.label}
                    </button>
                  ))}
                  {audioTracks.length === 0 && (
                    <button type="button" className="pc-menu-item active" disabled>
                      Default
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="pc-menu-wrap">
              <button type="button" className="pc-btn pc-btn--speed" onClick={() => { setSpeedOpen(!speedOpen); setSubsOpen(false); setAudioOpen(false); scheduleHide(); }} aria-label="Playback speed" data-tip={`Speed ${speed}x (</>)`} title="Speed (</> )">
                <IconSpeed />
                <span className="pc-speed-val">{speed}x</span>
              </button>
              {speedOpen && (
                <div className="pc-menu">
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" className={`pc-menu-item ${speed === s ? "active" : ""}`} onClick={() => { onSpeedChange?.(s); setSpeedOpen(false); scheduleHide(); }}>
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pc-divider" aria-hidden />

          <div className="pc-group pc-group--size">
            <button type="button" className="pc-btn pc-btn--fit" onClick={onCycleFitMode} aria-label={`Fit mode: ${FIT_LABELS[fitMode] ?? fitMode}`} data-tip={`Fit: ${FIT_LABELS[fitMode] ?? fitMode} (Z)`} title={`Fit: ${FIT_LABELS[fitMode] ?? fitMode} (Z)`}>
              <IconFit />
            </button>
            <span className="pc-fit-label">{FIT_LABELS[fitMode] ?? fitMode}</span>
          </div>

          <div className="pc-divider" aria-hidden />

          <div className="pc-group">
            <button
              type="button"
              className="pc-btn"
              onClick={togglePiP}
              disabled={!pipSupported}
              aria-label={isPiP ? "Exit picture in picture" : "Picture in picture"}
              aria-pressed={isPiP}
              data-tip={isPiP ? "Exit PiP (p)" : "PiP (p)"}
              title={!pipSupported ? "PiP not supported" : undefined}
            >
              <IconPip />
            </button>
            <button type="button" className="pc-btn pc-btn--fullscreen" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} data-tip={isFullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"} aria-pressed={isFullscreen}>
              <IconFullscreen isFullscreen={isFullscreen} />
            </button>
            {onRetry && <button type="button" className="pc-btn pc-btn--retry" onClick={onRetry} aria-label="Retry stream" data-tip="Retry" title="Retry">↻</button>}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
