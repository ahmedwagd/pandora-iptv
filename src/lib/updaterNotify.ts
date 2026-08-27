import type { UpdateInfo } from "../hooks/useUpdater";
import { strings, type Lang } from "../i18n";

/**
 * Show an OS notification when a new version is available.
 * Falls back silently if not in Tauri or permission denied.
 * Caller should also render an in-app banner.
 * @param lang - UI language for localized title/body (defaults to "en")
 */
export async function notifyUpdateAvailable(info: UpdateInfo, lang: Lang = "en"): Promise<boolean> {
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
    const s = strings[lang] ?? strings.en;
    // Arabic uses RTL-friendly template from i18n: notificationTitle/notificationBody
    const titleTemplate = (s as Record<string, string>).notificationTitle ?? `PandoraIPTV ${info.latestVersion} available`;
    const title = titleTemplate.includes("{{version}}")
      ? titleTemplate.replace("{{version}}", info.latestVersion)
      : `PandoraIPTV ${info.latestVersion} available`;
    const bodyFromNotes = info.body ? info.body.slice(0, 140).replace(/\s+/g, " ").trim() : "";
    const bodyFallbackTemplate = (s as Record<string, string>).notificationBody ?? `Update ${info.currentVersion} → ${info.latestVersion}`;
    const bodyFallback = bodyFallbackTemplate
      .replace("{{current}}", info.currentVersion)
      .replace("{{latest}}", info.latestVersion);
    const body = bodyFromNotes || bodyFallback;
    await sendNotification({ title, body });
    return true;
  } catch {
    // notification plugin not available or not configured
    return false;
  }
}
