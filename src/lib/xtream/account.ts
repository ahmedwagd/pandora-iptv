import type { XtreamCreds } from "../../types";
import type { FetchFn, XtreamAccount, XtreamAccountInfo } from "./types";
import { fetchJson } from "./http";
import { buildApiUrl } from "./urls";
import { formatExpDate, toTimestamp } from "./utils";

export async function getXtreamAccount(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<XtreamAccount> {
  const data = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds), opts);
  const u = data.user_info ?? {};
  const ts = toTimestamp(u.exp_date as string | number | null | undefined);
  return {
    username: u.username ?? creds.username,
    status: u.status ?? null,
    auth: typeof u.auth === "number" ? u.auth : Number(u.auth ?? 0),
    expDate: u.exp_date != null ? String(u.exp_date) : null,
    expTimestamp: ts,
    expDateFormatted: formatExpDate(u.exp_date as string | number | null | undefined),
    isTrial: String(u.is_trial ?? "0") === "1",
    maxConnections: u.max_connections != null ? String(u.max_connections) : null,
    activeConnections: u.active_cons != null ? String(u.active_cons) : null,
    createdAt: u.created_at != null ? String(u.created_at) : null,
    message: u.message ?? null,
  };
}
