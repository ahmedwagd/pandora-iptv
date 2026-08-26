import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "../../types";
import { useSkipDuration } from "../../hooks/useSkipDuration";

interface PlayerControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  channel: Channel | null;
  onRetry?: () => void;
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PlayerControls({ videoRef, channel, onRetry }: PlayerControlsProps) {
  const { skipDuration } = useSkipDuration();
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  const isLive = channel?.kind === "live" || !Number.isFinite(duration) || duration === 0 || duration === Infinity;
  const seekable = !isLive && duration > 0;

  const scheduleHide = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    // don't autohide while paused (user likely interacting)
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
    // init
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
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await v.requestFullscreen();
    } catch {
      // fallback: try container
      const c = controlsRef.current?.parentElement;
      if (c && !document.fullscreenElement) {
        try {
          await c.requestFullscreen();
        } catch {
          /* ignore */
        }
      }
    }
    scheduleHide();
  }, [videoRef, scheduleHide]);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled && v.readyState > 0) await v.requestPictureInPicture();
    } catch {
      /* PiP may be blocked */
    }
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

  const lastToggleRef = useRef(0);
  const guardedToggle = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 300) return;
    lastToggleRef.current = now;
    toggleVisible();
  }, [toggleVisible]);

  // left-click anywhere on the player should toggle controls visibility (even when hidden)
  useEffect(() => {
    const isInteractive = (el: HTMLElement | null) => !!el?.closest("button, input, [role='slider']");
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

  // direct player element listeners — more reliable than document in Tauri WebView
  useEffect(() => {
    const playerEl = videoRef.current?.parentElement as HTMLElement | null;
    if (!playerEl) return;
    const isInteractive = (el: HTMLElement | null) => !!el?.closest("button, input, [role='slider']");
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (isInteractive(target)) return;
      // only left-click
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      guardedToggle();
    };
    playerEl.addEventListener("click", handler);
    return () => playerEl.removeEventListener("click", handler);
  }, [guardedToggle, channel]);

  // local keyboard for player when focused/hovered
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      // only handle when player is visible/active
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
  }, [videoRef, togglePlay, toggleMute, toggleFullscreen, togglePiP, seekable, duration, skipDuration, scheduleHide]);

  if (!channel) return null;

  const pipSupported = typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled);

  return (
    <div
      ref={controlsRef}
      className={`player-controls ${visible ? "is-visible" : "is-hidden"}`}
      onMouseMove={scheduleHide}
      onMouseLeave={() => {
        if (!paused && hideTimer.current) window.clearTimeout(hideTimer.current);
        if (!paused) hideTimer.current = window.setTimeout(() => setVisible(false), 800);
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("button, input, [role='slider']")) return;
        guardedToggle();
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="toolbar"
      aria-label="Playback controls"
    >
      <div className="pc-center" aria-hidden={false}>
        <button
          type="button"
          className="pc-btn pc-btn--skip"
          onClick={skipBack}
          aria-label={`Back ${skipDuration} seconds`}
          title={`Back ${skipDuration}s`}
          disabled={!seekable && current <= 0}
        >
          <span className="pc-skip-label">↺ {skipDuration}s</span>
        </button>
        <button type="button" className="pc-btn pc-btn--center" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}>
          <span className="pc-center-icon">{paused ? "▶" : "❚❚"}</span>
        </button>
        <button
          type="button"
          className="pc-btn pc-btn--skip"
          onClick={skipForward}
          aria-label={`Forward ${skipDuration} seconds`}
          title={`Forward ${skipDuration}s`}
          disabled={!seekable && isLive}
        >
          <span className="pc-skip-label">{skipDuration}s ↻</span>
        </button>
      </div>
      <div className="player-controls-row">
        <button type="button" className="pc-btn pc-btn--play" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}>
          {paused ? "▶" : "❚❚"}
        </button>

        <div className="pc-time">
          {isLive ? <span className="pc-live">● Live</span> : <span>{fmtTime(current)} / {fmtTime(duration)}</span>}
        </div>

        {seekable ? (
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
          />
        ) : (
          <div className="pc-seek pc-seek--live" aria-hidden />
        )}

        <button
          type="button"
          className="pc-btn pc-btn--mute"
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        >
          {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔈" : "🔊"}
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

        <button
          type="button"
          className="pc-btn"
          onClick={togglePiP}
          disabled={!pipSupported}
          aria-label={isPiP ? "Exit picture in picture" : "Picture in picture"}
          aria-pressed={isPiP}
          title={!pipSupported ? "PiP not supported" : undefined}
        >
          PiP
        </button>

        <button type="button" className="pc-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} aria-pressed={isFullscreen}>
          ⛶
        </button>

        {onRetry && <button type="button" className="pc-btn pc-btn--retry" onClick={onRetry} aria-label="Retry stream">↻</button>}
      </div>
    </div>
  );
}
