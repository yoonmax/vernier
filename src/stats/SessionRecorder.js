import { MISS_PENALTY, accuracy, hitPoints, hitsPerSecond } from './metrics.js';

/** Records gameplay events for one session. All reported numbers derive from these events. */
export class SessionRecorder {
  constructor() {
    this.reset();
  }

  reset() {
    this.shots = 0;
    this.hits = 0;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.firstHitTime = NaN;
    this.lastHitTime = NaN;
    this.acquisitionTotal = 0;
    this.hitOffsetTotal = 0;
    this.missOffsetTotal = 0;
    this.measuredMisses = 0;
    /** Hits in each whole second of the session, for the results chart. */
    this.timeline = [];
  }

  recordHit(time, acquisitionMs, offsetDegrees) {
    this.shots += 1;
    this.hits += 1;
    this.streak += 1;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    this.score += hitPoints(this.streak);
    if (Number.isNaN(this.firstHitTime)) this.firstHitTime = time;
    this.lastHitTime = time;
    this.acquisitionTotal += acquisitionMs;
    this.hitOffsetTotal += offsetDegrees;

    const second = Math.floor(time / 1000);
    while (this.timeline.length <= second) this.timeline.push(0);
    this.timeline[second] += 1;
  }

  recordMiss(offsetDegrees) {
    this.shots += 1;
    this.streak = 0;
    this.score = Math.max(0, this.score - MISS_PENALTY);
    if (Number.isFinite(offsetDegrees)) {
      this.missOffsetTotal += offsetDegrees;
      this.measuredMisses += 1;
    }
  }

  /** @param {number} durationMs active session time */
  summary(durationMs) {
    // Seconds with no hits still happened, including any at the end of the session.
    const seconds = Math.ceil(durationMs / 1000);
    while (this.timeline.length < seconds) this.timeline.push(0);
    const misses = this.shots - this.hits;
    const intervalCount = this.hits - 1;
    return {
      shots: this.shots,
      hits: this.hits,
      misses,
      score: this.score,
      accuracy: accuracy(this.hits, this.shots),
      hitsPerSecond: hitsPerSecond(this.hits, durationMs),
      durationMs,
      bestStreak: this.bestStreak,
      averageHitIntervalMs:
        intervalCount > 0 ? (this.lastHitTime - this.firstHitTime) / intervalCount : 0,
      averageAcquisitionMs: this.hits > 0 ? this.acquisitionTotal / this.hits : 0,
      averageHitOffsetDegrees: this.hits > 0 ? this.hitOffsetTotal / this.hits : 0,
      averageMissOffsetDegrees:
        this.measuredMisses > 0 ? this.missOffsetTotal / this.measuredMisses : 0,
      timeline: this.timeline.slice(),
    };
  }
}
