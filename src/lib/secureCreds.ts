import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export async function isSecureAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("get_credentials", { account: "__probe__" });
    return true;
  } catch {
    return false;
  }
}

export function credAccount(profileId: string | null): string {
  return `xtream:${profileId ?? "default"}`;
}

export async function saveSecure(profileId: string | null, json: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("save_credentials", { account: credAccount(profileId), password: json });
    return true;
  } catch {
    return false;
  }
}

export async function getSecure(profileId: string | null): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const v = await invoke<string | null>("get_credentials", { account: credAccount(profileId) });
    return v ?? null;
  } catch {
    return null;
  }
}

export async function deleteSecure(profileId: string | null): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("delete_credentials", { account: credAccount(profileId) });
    return true;
  } catch {
    return false;
  }
}
