export const StorageKeys = {
  xtreamCreds: "xtreamCreds",
  favoriteIds: "favoriteIds",
  watchHistory: "watchHistory",
  profiles: "profiles",
  activeProfileId: "activeProfileId",
  playbackSkip: "playbackSkip",
  videoFitMode: "videoFitMode",
  videoZoom: "videoZoom",
  playbackSpeed: "playbackSpeed",
  subtitleEnabled: "subtitleEnabled",
  playbackPositions: "playbackPositions",
  epgReminders: "epgReminders",
  epgEnabled: "epgEnabled",
  recentSearches: "recentSearches",
  updaterAutoCheck: "updater:autoCheckEnabled",
  updaterIntervalMs: "updater:intervalMs",
  updaterLastChecked: "updater:lastChecked",
  updaterDismissedVersion: "updater:dismissedVersion",
  browseFilters: "filters",
  channelListFilters: "channelList",
  virtualPosterEnabled: "virtualPoster",
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys] | string;

export function scopedKey(base: string, profileId: string): string {
  return `${base}:${profileId}`;
}

export function browseFiltersKey(profileId: string, contentMode: string): string {
  return `${StorageKeys.browseFilters}:${profileId}:${contentMode}`;
}

export function channelListFiltersKey(profileId: string): string {
  return `${StorageKeys.channelListFilters}:${profileId}`;
}
