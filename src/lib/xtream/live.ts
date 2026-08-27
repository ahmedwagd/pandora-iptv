import type { Channel, XtreamCreds } from "../../types";
import type { FetchFn, XtreamCategory, XtreamLiveStream } from "./types";
import { fetchJson } from "./http";
import { buildApiUrl, buildXtreamAltBases, buildXtreamLiveAltUrls, buildXtreamLiveUrl, parseCatchup } from "./urls";
import { categoryNameMap } from "./utils";
import type { XtreamAccountInfo } from "./types";

export async function getXtreamLiveChannels(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Channel[]> {
  const accountData = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds), opts);
  const auth = accountData.user_info?.auth;
  if (auth !== 1) {
    const status = accountData.user_info?.status;
    throw new Error(status ? `Account is ${status}.` : "Invalid Xtream credentials.");
  }
  const altBases = buildXtreamAltBases(creds, accountData.server_info);

  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_live_categories"), opts),
    fetchJson<XtreamLiveStream[]>(fetchFn, buildApiUrl(creds, "get_live_streams"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return streams.map((s) => {
    const url = buildXtreamLiveUrl(creds, s.stream_id);
    const altRaw = buildXtreamLiveAltUrls(creds, s.stream_id, altBases);
    const altUrls = altRaw.filter((u) => u !== url);
    const direct = s.direct_source && s.direct_source.trim() ? s.direct_source.trim() : null;
    const allAlts = [...(direct && direct !== url ? [direct] : []), ...altUrls];
    const catchup = parseCatchup(s);
    return {
      id: String(s.stream_id),
      name: s.name,
      url,
      ...(allAlts.length ? { altUrls: allAlts } : {}),
      ...(catchup ? { catchup } : {}),
      logo: s.stream_icon ?? undefined,
      group: nameByCat.get(s.category_id) ?? "Uncategorized",
      tvgId: s.epg_channel_id ?? undefined,
      kind: "live" as const,
    };
  });
}
