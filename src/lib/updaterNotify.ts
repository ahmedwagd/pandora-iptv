import type { UpdateInfo } from "../hooks/useUpdater";

/**
 * Show an OS notification when a new version is available.
 * Falls back silently if not in Tauri or permission denied.
 * Caller should also render an in-app banner.
 */
export async function notifyUpdateAvailable(info: UpdateInfo): Promise<boolean> {
  if (!info.available || !info.latestVersion) return false;
  if (typeof window === "undefined" || !("__TAURI__" in window)) return false;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (!granted) return false;
    const title = `PandoraIPTV ${info.latestVersion} available`;
    const body = info.body
      ? info.body.slice(0, 140).replace(/\s+/g, " ").trim()
      : `Update ${info.currentVersion} → ${info.latestVersion}`;
    await sendNotification({ title, body });
    return true;
  } catch {
    // notification plugin not available or not configured
    return false;
  }
}
