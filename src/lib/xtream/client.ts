import type { XtreamCreds } from "../../types";
import type { FetchFn } from "./types";
import { getXtreamAccount } from "./account";
import { getXtreamLiveChannels } from "./live";
import { getXtreamMovies, getXtreamSeries, getXtreamMovieDetail, getXtreamSeasons } from "./vod";
import { getXtreamSimpleDataTable, getXtreamShortEpg } from "./epg";

export class XtreamClient {
  constructor(
    private creds: XtreamCreds,
    private fetchFn: FetchFn,
    private opts: { timeoutMs?: number; retries?: number } = {}
  ) {}

  live(opts?: { signal?: AbortSignal }) {
    return getXtreamLiveChannels(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  movies(opts?: { signal?: AbortSignal }) {
    return getXtreamMovies(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  series(opts?: { signal?: AbortSignal }) {
    return getXtreamSeries(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  movieDetail(streamId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamMovieDetail(this.creds, this.fetchFn, streamId, { ...this.opts, ...opts });
  }
  seasons(seriesId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamSeasons(this.creds, this.fetchFn, seriesId, { ...this.opts, ...opts });
  }
  simpleDataTable(opts?: { signal?: AbortSignal }) {
    return getXtreamSimpleDataTable(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  shortEpg(streamId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamShortEpg(this.creds, this.fetchFn, streamId, { ...this.opts, ...opts });
  }
  account(opts?: { signal?: AbortSignal }) {
    return getXtreamAccount(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
}
