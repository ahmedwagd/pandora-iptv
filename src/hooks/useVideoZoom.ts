import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

export type VideoFitMode = "contain" | "cover" | "fill" | "scale-down" | "none";

export const FIT_MODES: { mode: VideoFitMode; label: string; icon: string }[] = [
  { mode: "contain", label: "Fit", icon: "?" },
  { mode: "cover", label: "Cover", icon: "?" },
  { mode: "fill", label: "Fill", icon: "?" },
  { mode: "scale-down", label: "Small", icon: "?" },
  { mode: "none", label: "1:1", icon: "?" },
];

const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

function clampZoom(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(n)));
}

export function useVideoZoom() {
  const [fitMode, setFitMode] = useState<VideoFitMode>("contain");
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedMode = await getValue<string>(StorageKeys.videoFitMode);
      if (!cancelled && savedMode && FIT_MODES.some((f) => f.mode === savedMode)) {
        setFitMode(savedMode as VideoFitMode);
      }
      const savedZoom = await getValue<number>(StorageKeys.videoZoom);
      if (!cancelled && typeof savedZoom === "number" && Number.isFinite(savedZoom)) {
        setZoom(clampZoom(savedZoom));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveFitMode = useCallback((m: VideoFitMode) => {
    setFitMode(m);
    void setValue(StorageKeys.videoFitMode, m);
  }, []);

  const cycleFitMode = useCallback(() => {
    setFitMode((prev) => {
      const idx = FIT_MODES.findIndex((f) => f.mode === prev);
      const next = FIT_MODES[(idx + 1) % FIT_MODES.length].mode;
      void setValue(StorageKeys.videoFitMode, next);
      return next;
    });
  }, []);

  const saveZoom = useCallback((z: number) => {
    const v = clampZoom(z);
    setZoom(v);
    void setValue(StorageKeys.videoZoom, v);
  }, []);

  const zoomIn = useCallback(() => saveZoom(zoom + 10), [saveZoom, zoom]);
  const zoomOut = useCallback(() => saveZoom(zoom - 10), [saveZoom, zoom]);
  const resetZoom = useCallback(() => saveZoom(DEFAULT_ZOOM), [saveZoom]);

  return {
    fitMode,
    saveFitMode,
    cycleFitMode,
    zoom,
    saveZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    MIN_ZOOM,
    MAX_ZOOM,
  };
}
