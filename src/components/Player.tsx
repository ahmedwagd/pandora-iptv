import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Channel } from "../types";
import { ColorBar } from "./ColorBar";
import { PlayerControls } from "./player/PlayerControls";

interface PlayerProps {
  channel: Channel | null;
}

type PlayerStatus = "idle" | "loading" | "buffering" | "reconnecting" | "error";

export function Player({ channel }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);
  const channelRef = useRef<Channel | null>(null);
  channelRef.current = channel;

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");

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
        video.play().catch(() => {
          /* autoplay blocked */
        });
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        // Try media error recovery first (common for codec)
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
            setStatus("reconnecting");
            return;
          } catch {
            /* fallthrough to retry */
          }
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
              // full reload fallback
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
    []
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
    }
  }, [attachHls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) {
      setStatus("idle");
      setError(null);
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
    const onPlaying = () => setStatus("idle");
    const onCanPlay = () => setStatus((s) => (s === "loading" || s === "buffering" ? "idle" : s));

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);

    if (isLikelyHls && Hls.isSupported()) {
      attachHls(video, channel.url);
      // native playing listener still applies after hls attach
      video.addEventListener("playing", onPlaying);
    } else {
      video.onloadeddata = null;
      video.onerror = null;
      video.src = channel.url;
      const onLoaded = () => setStatus("idle");
      const onErr = () => {
        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          setStatus("reconnecting");
          window.setTimeout(() => {
            const ch = channelRef.current;
            if (!ch || ch.url !== channel.url) return;
            video.src = ch.url;
            void video.play().catch(() => {});
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
    <div className="player">
      <video ref={videoRef} autoPlay playsInline className="player-video" />
      <PlayerControls videoRef={videoRef} channel={channel} onRetry={retry} />

      {status === "loading" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Tuning {channel.name}…
        </div>
      )}
      {status === "buffering" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Buffering…
        </div>
      )}
      {status === "reconnecting" && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Reconnecting… ({retryCountRef.current}/3)
        </div>
      )}
      {status === "error" && error && (
        <div className="player-overlay player-error">
          <span aria-hidden>⚠</span> {error}
          <button type="button" className="player-retry" onClick={retry} aria-label="Retry playback">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
