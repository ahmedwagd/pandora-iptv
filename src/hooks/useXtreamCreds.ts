import { useCallback, useEffect, useState } from "react";
import { deleteValue, getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";
import type { XtreamCreds } from "../types";

/**
 * Persists Xtream Codes credentials (server/username/password) to disk
 * via Tauri's store plugin when "Remember me" is checked. `clear()`
 * wipes both memory and disk (used for logout / un-remembered logins).
 */
export function useXtreamCreds() {
  const [creds, setCreds] = useState<XtreamCreds | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getValue<XtreamCreds>(StorageKeys.xtreamCreds);
      if (saved) setCreds(saved);
      setReady(true);
    })();
  }, []);

  const save = useCallback((c: XtreamCreds) => {
    setCreds(c);
    setValue(StorageKeys.xtreamCreds, c);
  }, []);

  const clear = useCallback(() => {
    setCreds(null);
    deleteValue(StorageKeys.xtreamCreds);
  }, []);

  return { creds, save, clear, ready };
}
