import { load, Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "iptv-app-data.json";

let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true }).catch((e) => {
      storePromise = null;
      throw e;
    });
  }
  return storePromise;
}

export async function getValue<T>(key: string): Promise<T | undefined> {
  try {
    const store = await getStore();
    const v = await store.get<T>(key);
    if (v !== undefined && v !== null) return v;
  } catch {}
  // Fallback for web / when store fails (e.g. no Tauri)
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  let ok = false;
  try {
    const store = await getStore();
    await store.set(key, value);
    ok = true;
  } catch {}
  // Always mirror to localStorage as backup for web and recovery
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  if (!ok) {
    // if store failed, we already mirrored to localStorage
  }
}

export async function deleteValue(key: string): Promise<void> {
  try {
    const store = await getStore();
    await store.delete(key);
  } catch {}
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** For tests: reset singleton */
export function __resetStoreForTests() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.NODE_ENV;
  if (env !== "production") storePromise = null;
}
