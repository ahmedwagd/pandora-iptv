/**
 * Single-responsibility timer manager for Player retry/stall/connect timers.
 * Replaces three Ref<number|null> + manual clearTimeout duplication in Player.tsx
 */
export class PlayerTimers {
  private retryId: number | null = null;
  private stallId: number | null = null;
  private connectId: number | null = null;
  private zapHideId: number | null = null;

  clearRetry(): void {
    if (this.retryId !== null) { window.clearTimeout(this.retryId); this.retryId = null; }
  }
  clearStall(): void {
    if (this.stallId !== null) { window.clearTimeout(this.stallId); this.stallId = null; }
  }
  clearConnect(): void {
    if (this.connectId !== null) { window.clearTimeout(this.connectId); this.connectId = null; }
  }
  clearZapHide(): void {
    if (this.zapHideId !== null) { window.clearTimeout(this.zapHideId); this.zapHideId = null; }
  }
  clearAll(): void {
    this.clearRetry(); this.clearStall(); this.clearConnect();
  }
  clearAllWithZap(): void {
    this.clearAll(); this.clearZapHide();
  }

  scheduleRetry(fn: () => void, delayMs: number): void {
    this.clearRetry();
    this.retryId = window.setTimeout(fn, delayMs);
  }
  armStall(fn: () => void, delayMs: number): void {
    if (this.stallId !== null) window.clearTimeout(this.stallId);
    this.stallId = window.setTimeout(fn, delayMs);
  }
  armConnect(fn: () => void, delayMs: number): void {
    if (this.connectId !== null) window.clearTimeout(this.connectId);
    if (this.retryId !== null) { window.clearTimeout(this.retryId); this.retryId = null; }
    this.connectId = window.setTimeout(fn, delayMs);
  }
  scheduleZapHide(fn: () => void, delayMs: number): void {
    if (this.zapHideId !== null) window.clearTimeout(this.zapHideId);
    this.zapHideId = window.setTimeout(fn, delayMs);
  }

  // For testing / cleanup
  get ids(): { retry: number | null; stall: number | null; connect: number | null; zapHide: number | null } {
    return { retry: this.retryId, stall: this.stallId, connect: this.connectId, zapHide: this.zapHideId };
  }
}
