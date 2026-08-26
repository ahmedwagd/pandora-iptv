export const StorageKeys = {
  xtreamCreds: "xtreamCreds",
  favoriteIds: "favoriteIds",
  watchHistory: "watchHistory",
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
