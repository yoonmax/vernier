const defaultNow = () => performance.now();

/**
 * Pausable session clock built on a monotonic source. Paused time is excluded,
 * so a timed run can never lose or gain time while the player is away.
 */
export class TimeManager {
  /** @param {() => number} now monotonic milliseconds, injectable for tests */
  constructor(now = defaultNow) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.running = false;
    this.startedAt = 0;
    this.accumulated = 0;
  }

  start() {
    this.accumulated = 0;
    this.startedAt = this.now();
    this.running = true;
  }

  pause() {
    if (!this.running) return;
    this.accumulated += this.now() - this.startedAt;
    this.running = false;
  }

  resume() {
    if (this.running) return;
    this.startedAt = this.now();
    this.running = true;
  }

  /**
   * Session time at an earlier moment on the same monotonic clock, such as an input event's
   * timestamp. Clamped so an event can't land outside the time this session has been running.
   */
  elapsedAt(timestamp) {
    if (!this.running) return this.accumulated;
    const elapsed = this.accumulated + (timestamp - this.startedAt);
    return Math.min(Math.max(this.accumulated, elapsed), this.elapsed());
  }

  /** Active session time in milliseconds. */
  elapsed() {
    return this.running ? this.accumulated + (this.now() - this.startedAt) : this.accumulated;
  }
}
