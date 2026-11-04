import { reactionSummary } from '../stats/metrics.js';
import { GameMode } from './GameMode.js';

/** Target diameter in degrees of visual angle. */
export const REACTION_DIAMETER = 5;

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 3500;
/** Added to the score, not to measured reaction times, for each shot fired too early. */
export const FALSE_START_PENALTY_MS = 50;
const INTER_TRIAL_MS = 600;

export const ReactionPhase = Object.freeze({ REST: 'rest', WAITING: 'waiting', ACTIVE: 'active' });

/**
 * Wait, react, shoot, for a fixed number of trials.
 *
 * Rules:
 * - The target appears after a random delay of 1.0–3.5 s.
 * - A shot during the wait is a false start: the delay restarts and the final score gains 50 ms.
 * - A miss while the target is visible does not end the trial; the clock keeps running.
 * - Pausing during a trial discards that attempt and restarts it, so time away never counts.
 *
 * The score is median reaction time plus false-start penalties. Lower is better.
 */
export class ReactionMode extends GameMode {
  constructor({ trials }, context) {
    super(
      {
        targetCount: 1,
        targetDiameter: REACTION_DIAMETER,
        region: { yawRange: 7, pitchRange: 4, avoidRepeat: 2 },
      },
      context,
    );
    this.trialGoal = trials;
    this.resetTrials();
  }

  resetTrials() {
    this.reactionTimes = [];
    this.falseStarts = 0;
    this.phase = ReactionPhase.REST;
    this.phaseEndsAt = 0;
    this.trialStartedAt = 0;
    this.lastTrialMs = null;
    this.notice = null;
  }

  /** A message for the HUD after a shot, cleared once read. */
  takeNotice() {
    const { notice } = this;
    this.notice = null;
    return notice;
  }

  onInitialize() {
    this.resetTrials();
  }

  onStart() {
    this.beginWait(0);
  }

  beginWait(time) {
    this.phase = ReactionPhase.WAITING;
    this.phaseEndsAt = time + this.rng.range(MIN_DELAY_MS, MAX_DELAY_MS);
  }

  onUpdate(deltaSeconds, elapsed) {
    if (this.phase === ReactionPhase.REST && elapsed >= this.phaseEndsAt) {
      this.beginWait(elapsed);
    } else if (this.phase === ReactionPhase.WAITING && elapsed >= this.phaseEndsAt) {
      this.spawnTarget(elapsed);
      this.trialStartedAt = elapsed;
      this.phase = ReactionPhase.ACTIVE;
    }
  }

  onHit(result) {
    // The click physically happened before the target appeared, so it can't be a reaction to it.
    if (result.time < this.trialStartedAt) {
      this.onMiss({ ...result, hit: false });
      return;
    }
    const reaction = result.time - this.trialStartedAt;
    this.reactionTimes.push(reaction);
    this.lastTrialMs = reaction;
    this.recorder.recordHit(result.time, reaction, result.offsetDegrees);
    this.spawner.markVacated(result.target);
    this.targets.remove(result.target);
    if (this.reactionTimes.length >= this.trialGoal) {
      this.finalElapsed = result.time;
      this.finish('goal');
      return;
    }
    this.phase = ReactionPhase.REST;
    this.phaseEndsAt = result.time + INTER_TRIAL_MS;
  }

  onMiss(result) {
    if (this.phase === ReactionPhase.ACTIVE && result.time >= this.trialStartedAt) {
      this.recorder.recordMiss(result.offsetDegrees);
      return;
    }
    if (this.phase === ReactionPhase.WAITING || result.time < this.trialStartedAt) {
      this.falseStarts += 1;
      this.notice = 'Too early';
      this.recorder.recordMiss(NaN);
      this.targets.clear();
      this.beginWait(result.time);
    }
    // Shots in the short rest after a hit are ignored: the next trial hasn't begun.
  }

  onPause() {
    if (this.phase === ReactionPhase.ACTIVE) this.targets.clear();
  }

  onResume() {
    if (this.phase !== ReactionPhase.REST) this.beginWait(this.clock.elapsed());
  }

  getProgress() {
    return { current: this.reactionTimes.length, total: this.trialGoal };
  }

  /** The score position shows the last measured reaction, rather than points. */
  getLiveScore() {
    return this.lastTrialMs === null ? null : `${Math.round(this.lastTrialMs)} ms`;
  }

  getExtraStatistics() {
    const summary = reactionSummary(this.reactionTimes);
    const valid = this.reactionTimes.length > 0;
    return {
      score: valid ? summary.median + this.falseStarts * FALSE_START_PENALTY_MS : null,
      reaction: { ...summary, trials: this.reactionTimes.slice() },
      falseStarts: this.falseStarts,
    };
  }
}
