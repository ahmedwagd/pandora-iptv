export const MAX_RETRIES = 3;
export const BASE_RETRY_DELAY_MS = 1_000;
export const MAX_RETRY_DELAY_MS = 15_000;
export const STALL_TIMEOUT_MS = 8_000;
export const CONNECT_TIMEOUT_MS = 10_000;

/** Exponential backoff capped at MAX_RETRY_DELAY_MS. attempt is 0-based. */
export function computeRetryDelay(
  attempt: number,
  base = BASE_RETRY_DELAY_MS,
  cap = MAX_RETRY_DELAY_MS
): number {
  const exp = base * Math.pow(2, attempt);
  return Math.min(exp, cap);
}

/** Advance to the next source in [primary, ...altUrls]. Returns null when exhausted. */
export function nextSourceIndex(currentIndex: number, totalSources: number): number | null {
  const next = currentIndex + 1;
  return next < totalSources ? next : null;
}

/** True when no progress for stallTimeout. lastProgressAt is ms epoch. */
export function isStalled(lastProgressAt: number, now: number, stallTimeout = STALL_TIMEOUT_MS): boolean {
  return now - lastProgressAt >= stallTimeout;
}

/** True when still in a non-idle status without transition for connectTimeout. */
export function isConnectTimeout(
  statusSince: number,
  now: number,
  connectTimeout = CONNECT_TIMEOUT_MS
): boolean {
  return now - statusSince >= connectTimeout;
}

/** Pure reducer helper describing the next action after a fatal load error. */
export type RetryDecision =
  | { kind: "retry"; delayMs: number; nextAttempt: number }
  | { kind: "switch-source"; nextSourceIndex: number; delayMs: number }
  | { kind: "fail" };

export function decideAfterFailure(opts: {
  sourceIndex: number;
  totalSources: number;
  attempt: number; // attempt count within current source (0-based, already tried `attempt+1` times)
}): RetryDecision {
  if (opts.attempt < MAX_RETRIES) {
    return { kind: "retry", delayMs: computeRetryDelay(opts.attempt), nextAttempt: opts.attempt + 1 };
  }
  const nxt = nextSourceIndex(opts.sourceIndex, opts.totalSources);
  if (nxt !== null) {
    // Small delay before switching source; reuse base delay.
    return { kind: "switch-source", nextSourceIndex: nxt, delayMs: BASE_RETRY_DELAY_MS };
  }
  return { kind: "fail" };
}
