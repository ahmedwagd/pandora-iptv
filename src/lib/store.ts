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
  const store = await getStore();
  return (await store.get<T>(key)) ?? undefined;
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

export async function deleteValue(key: string): Promise<void> {
  const store = await getStore();
  await store.delete(key);
}

/** For tests: reset singleton */
export function __resetStoreForTests() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.NODE_ENV;
  if (env !== "production") storePromise = null;
}
