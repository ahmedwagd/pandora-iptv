import { useEffect, useState } from "react";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
}

export function useUpdater() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (typeof window === "undefined" || !("__TAURI__" in window)) return;
    try {
      setChecking(true);
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        setInfo({
          available: true,
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          body: update.body,
        });
      } else if (update) {
        setInfo({ available: false, currentVersion: update.currentVersion });
      }
    } catch {
      // silent — updater may be unconfigured
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    if (typeof window === "undefined" || !("__TAURI__" in window)) return;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
      }
    } catch {}
  };

  useEffect(() => {
    void check();
  }, []);

  return { info, checking, check, install };
}
