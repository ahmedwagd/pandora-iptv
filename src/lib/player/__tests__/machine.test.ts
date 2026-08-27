import { describe, it, expect } from "vitest";
import { playerMachineNext, canRecoverMedia } from "../machine";

describe("playerMachineNext", () => {
  it("retries within same source", () => {
    const { decision, nextState } = playerMachineNext({ sourceIndex: 0, attempt: 0, mediaRecovers: 0 }, { type: "HlsFatalError" }, 2);
    expect(decision.kind).toBe("retry");
    expect(nextState.attempt).toBe(1);
    expect(nextState.sourceIndex).toBe(0);
  });
  it("switches source after MAX_RETRIES", () => {
    // MAX_RETRIES =3, attempt 3 means exhausted retries for source 0
    const { decision, nextState } = playerMachineNext({ sourceIndex: 0, attempt: 3, mediaRecovers: 0 }, { type: "StallTimeout" }, 2);
    expect(decision.kind).toBe("switch-source");
    if (decision.kind === "switch-source") expect(decision.nextSourceIndex).toBe(1);
    expect(nextState.sourceIndex).toBe(1);
    expect(nextState.attempt).toBe(0);
  });
  it("fails when all sources exhausted", () => {
    const { decision } = playerMachineNext({ sourceIndex: 1, attempt: 3, mediaRecovers: 0 }, { type: "ConnectTimeout" }, 2);
    expect(decision.kind).toBe("fail");
  });
  it("keeps state on fail", () => {
    const state = { sourceIndex: 0, attempt: 3, mediaRecovers: 1 };
    const { decision, nextState } = playerMachineNext(state, { type: "NativeError" }, 1);
    expect(decision.kind).toBe("fail");
    expect(nextState).toEqual(state);
  });
});

describe("canRecoverMedia", () => {
  it("allows recover under budget", () => { expect(canRecoverMedia(0, 2)).toBe(true); expect(canRecoverMedia(1, 2)).toBe(true); });
  it("blocks at budget", () => { expect(canRecoverMedia(2, 2)).toBe(false); });
});
