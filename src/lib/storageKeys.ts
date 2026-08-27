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
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys] | string;

export function scopedKey(base: string, profileId: string): string {
  return `${base}:${profileId}`;
}
