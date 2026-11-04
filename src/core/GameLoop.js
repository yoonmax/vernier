/**
 * requestAnimationFrame loop with an optional frame cap. "Uncapped" adds no limit of its
 * own, but browsers still schedule rAF to the display, so this can't exceed refresh rate.
 */
export class GameLoop {
  /** @param {(deltaSeconds:number, now:number, frameMs:number) => void} onFrame */
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.handle = 0;
    this.running = false;
    this.lastFrame = 0;
    this.minimumInterval = 0;
    this.nextFrameDue = 0;
    this.tick = this.tick.bind(this);
  }

  /** @param {number} fps frames per second, or 0 for no cap */
  setCap(fps) {
    this.minimumInterval = fps > 0 ? 1000 / fps : 0;
    this.nextFrameDue = this.lastFrame + this.minimumInterval;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.nextFrameDue = this.lastFrame + this.minimumInterval;
    this.handle = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  tick(now) {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);
    const elapsed = now - this.lastFrame;
    if (elapsed <= 0) return;
    if (this.minimumInterval > 0) {
      // A small tolerance stops a 60 cap on a 60 Hz display dropping frames to timer jitter.
      if (now < this.nextFrameDue - 1) return;
      // Due times advance on a fixed schedule, so the cap holds on average. If the display
      // can't keep up there's no debt to repay: start the schedule again from now.
      this.nextFrameDue += this.minimumInterval;
      if (this.nextFrameDue < now) this.nextFrameDue = now + this.minimumInterval;
    }
    this.lastFrame = now;
    // Long gaps come from a hidden tab or a stall. Never let one become a huge simulation step.
    this.onFrame(Math.min(elapsed, 100) / 1000, now, elapsed);
  }
}
