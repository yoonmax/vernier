const SAMPLE_CAPACITY = 1000;
/** A 1% low needs enough samples to contain a meaningful worst 1%. */
const MINIMUM_ONE_PERCENT_SAMPLES = 200;

/**
 * Rolling frame-time statistics over the last 1000 presented frames.
 * Uses a fixed buffer, so measuring performance never adds garbage of its own.
 */
export class FrameStats {
  constructor() {
    this.samples = new Float32Array(SAMPLE_CAPACITY);
    this.sorted = new Float32Array(SAMPLE_CAPACITY);
    this.count = 0;
    this.cursor = 0;
    this.total = 0;
  }

  reset() {
    this.count = 0;
    this.cursor = 0;
    this.total = 0;
  }

  /** @param {number} frameMs time since the previous presented frame */
  add(frameMs) {
    if (this.count === SAMPLE_CAPACITY) this.total -= this.samples[this.cursor];
    else this.count += 1;
    this.samples[this.cursor] = frameMs;
    this.total += frameMs;
    this.cursor = (this.cursor + 1) % SAMPLE_CAPACITY;
  }

  /** Mean FPS over the most recent `window` frames. */
  currentFps(window = 30) {
    const span = Math.min(window, this.count);
    if (span === 0) return 0;
    let sum = 0;
    for (let i = 1; i <= span; i += 1) {
      sum += this.samples[(this.cursor - i + SAMPLE_CAPACITY) % SAMPLE_CAPACITY];
    }
    return sum > 0 ? (span * 1000) / sum : 0;
  }

  /** Total frames over total time. Averaging per-frame FPS would overstate it. */
  averageFps() {
    return this.total > 0 ? (this.count * 1000) / this.total : 0;
  }

  lastFrameMs() {
    if (this.count === 0) return 0;
    return this.samples[(this.cursor - 1 + SAMPLE_CAPACITY) % SAMPLE_CAPACITY];
  }

  /** FPS across the slowest 1% of frames, or null until there are enough samples. */
  onePercentLowFps() {
    if (this.count < MINIMUM_ONE_PERCENT_SAMPLES) return null;
    const view = this.sorted.subarray(0, this.count);
    view.set(this.samples.subarray(0, this.count));
    view.sort();
    const worstCount = Math.max(1, Math.floor(this.count / 100));
    let sum = 0;
    for (let i = this.count - worstCount; i < this.count; i += 1) sum += view[i];
    return sum > 0 ? (worstCount * 1000) / sum : 0;
  }
}
