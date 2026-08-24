import { useCallback, useEffect, useState } from "react";
import { load, Store } from "@tauri-apps/plugin-store";
import type { XtreamCreds } from "../types";

const STORE_FILE = "iptv-app-data.json";
const XTREAM_KEY = "xtreamCreds";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true });
  return storePromise;
}

/**
 * Persists Xtream Codes credentials (server/username/password) to disk
 * via Tauri's store plugin. Saved as plaintext JSON, as agreed.
 */
export function useXtreamCreds() {
  const [creds, setCreds] = useState<XtreamCreds | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const store = await getStore();
      const saved = await store.get<XtreamCreds>(XTREAM_KEY);
      if (saved) setCreds(saved);
      setReady(true);
    })();
  }, []);

  const save = useCallback((c: XtreamCreds) => {
    setCreds(c);
    getStore().then((store) => {
      store.set(XTREAM_KEY, c);
    });
  }, []);

  return { creds, save, ready };
}
