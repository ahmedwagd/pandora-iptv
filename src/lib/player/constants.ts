/**
 * Centralized player tuning constants — replaces magic numbers scattered in Player.tsx
 */

export const PLAYER_MAX_MEDIA_RECOVER = 2;
export const PLAYER_MAX_BUFFER_LENGTH_SEC = 30;
export const PLAYER_ZAP_HIDE_MS = 4000;
export const PLAYER_ZAP_HINT_MS = 2000;
export const PLAYER_ZAP_HINT_KEY = "panora:zapHintShown";
export const PLAYER_SEEK_HINT_DURATION_MS = 520;
export const PLAYER_SEEK_HINT_REMOVE_MS = 560;

export const PLAYER_RESUMABLE_MIN_POS_SEC = 10;
export const PLAYER_RESUMABLE_MIN_REMAIN_SEC = 15;
export const PLAYER_RESUMABLE_MIN_PCT = 0.01;
export const PLAYER_RESUMABLE_MAX_PCT = 0.985;

export const PLAYER_CLICK_ZONE_TOP_PX = 56;
export const PLAYER_CLICK_ZONE_BOTTOM_PX = 96;
export const PLAYER_CLICK_ZONE_LEFT_PCT = 0.35;
export const PLAYER_CLICK_ZONE_RIGHT_PCT = 0.65;

export const PLAYER_RESUME_SAVE_THROTTLE_MS = 1000;
export const PLAYER_RESUME_SAVE_INTERVAL_MS = 5000;
export const PLAYER_RESUME_END_CLEAR_SEC = 10;
