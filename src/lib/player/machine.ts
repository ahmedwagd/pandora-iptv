import { decideAfterFailure, type RetryDecision } from "../streamPolicy";

export type PlayerMachineState = {
  sourceIndex: number;
  attempt: number;
  mediaRecovers: number;
};

export type PlayerMachineEvent =
  | { type: "HlsFatalError" }
  | { type: "StallTimeout" }
  | { type: "ConnectTimeout" }
  | { type: "NativeError" };

/**
 * Pure reducer helper — centralizes the 4x duplicated decideAfterFailure handling
 * in Player.tsx (hls ERROR, armStall, armConnect, video.onerror).
 * Returns the decision plus next state for caller to apply.
 */
export function playerMachineNext(
  state: PlayerMachineState,
  event: PlayerMachineEvent,
  totalSources: number
): { decision: RetryDecision; nextState: PlayerMachineState } {
  // Media recover is handled separately (MAX_MEDIA_RECOVER budget)
  // This machine only handles retry / switch-source / fail via streamPolicy
  const decision = decideAfterFailure({
    sourceIndex: state.sourceIndex,
    totalSources,
    attempt: state.attempt,
  });

  let nextState: PlayerMachineState = { ...state };
  if (decision.kind === "retry") {
    nextState = { ...state, attempt: decision.nextAttempt };
  } else if (decision.kind === "switch-source") {
    nextState = { ...state, sourceIndex: decision.nextSourceIndex, attempt: 0 };
  }
  // fail keeps state as-is
  void event; // event type kept for future branching (e.g., different backoff per event)
  return { decision, nextState };
}

export function canRecoverMedia(currentRecovers: number, maxRecover: number): boolean {
  return currentRecovers < maxRecover;
}
