import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Channel } from "../types";
import { ColorBar } from "./ColorBar";

interface PlayerProps {
  channel: Channel | null;
}

/**
 * Renders the active stream. Uses hls.js for .m3u8 sources (the vast
 * majority of live IPTV streams) and falls back to native <video>
 * playback for anything the browser engine can handle natively
 * (e.g. Safari/WebKit's built-in HLS support, or direct mp4/ts links).
 */
export function Player({ channel }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;

    setError(null);
    setLoading(true);

    // Tear down any previous hls.js instance before attaching a new source
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isLikelyHls = channel.url.includes(".m3u8") || channel.url.includes("m3u8");

    if (isLikelyHls && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {
          /* autoplay may be blocked; user can press play */
        });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setLoading(false);
          setError(`Stream error: ${data.details}`);
        }
      });
    } else {
      // Native playback path (Safari HLS, or non-HLS direct streams)
      // Clear previous listeners to avoid leaks on rapid channel switches
      video.onloadeddata = null;
      video.onerror = null;
      video.src = channel.url;
      const onLoaded = () => setLoading(false);
      const onErr = () => {
        setLoading(false);
        setError("Unable to play this stream.");
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Remove native listeners + reset src to stop in-flight fetch
      if (video) {
        video.onloadeddata = null;
        video.onerror = null;
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [channel]);

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
      <video ref={videoRef} controls autoPlay className="player-video" />
      {loading && (
        <div className="player-overlay">
          <span className="inline-loader" aria-hidden />
          Tuning {channel.name}…
        </div>
      )}
      {error && (
        <div className="player-overlay player-error">
          <span aria-hidden>⚠</span> {error}
        </div>
      )}
    </div>
  );
}
