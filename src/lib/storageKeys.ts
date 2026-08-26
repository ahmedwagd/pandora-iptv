export const StorageKeys = {
  xtreamCreds: "xtreamCreds",
  favoriteIds: "favoriteIds",
  watchHistory: "watchHistory",
  profiles: "profiles",
  activeProfileId: "activeProfileId",
  playbackSkip: "playbackSkip",
  videoFitMode: "videoFitMode",
  videoZoom: "videoZoom",
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys] | string;

export function scopedKey(base: string, profileId: string): string {
  return `${base}:${profileId}`;
}
