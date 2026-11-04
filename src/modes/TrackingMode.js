import { ZONE_CENTER_PITCH } from '../core/constants.js';
import { lowestPitchForRadius } from '../targets/Target.js';
import { createMotion } from '../targets/TargetMotion.js';
import { RAD_TO_DEG } from '../utils/math.js';
import { GameMode } from './GameMode.js';

/** Target diameter in degrees of visual angle. */
export const TRACKING_DIAMETER = 3.4;

export const TRACKING_SPEEDS = Object.freeze({ slow: 9, medium: 16, fast: 26 });
const MOTION_ATTEMPTS = 16;
const REGION = Object.freeze({ yawRange: 26, pitchRange: 10, avoidRepeat: 0 });

/**
 * Moving targets, in two clearly separate variants.
 *
 * Click: each hit scores like any other mode, then a new target takes up the same pattern.
 * Hold: hold the trigger and stay on target. Score is contact time alone, at 100 points
 * per second, and "accuracy" becomes the share of trigger-held time spent on target.
 */
export class TrackingMode extends GameMode {
  constructor({ duration, pattern, speed, input, targetCount }, context) {
    super(
      {
        targetCount,
        durationMs: duration * 1000,
        targetDiameter: TRACKING_DIAMETER,
        region: { ...REGION, minSeparation: 4 },
      },
      context,
    );
    this.pattern = pattern;
    this.speed = TRACKING_SPEEDS[speed];
    this.hold = input === 'hold';
    this.contactMs = 0;
    this.heldMs = 0;
    this.onTarget = false;
    this.lastUpdateMs = 0;
    this.motionSample = { yaw: 0, pitch: 0 };
  }

  get usesTriggerHold() {
    return this.hold;
  }

  onInitialize() {
    this.contactMs = 0;
    this.heldMs = 0;
    this.onTarget = false;
    this.lastUpdateMs = 0;
    this.fillTargets(0);
    this.moveTargets(0);
  }

  spawnTarget(time) {
    const target = super.spawnTarget(time);
    target.motion = this.createClearMotion(time / 1000);
    return target;
  }

  /**
   * A moving target's position comes from its path, not the spawner, so the spawner's checks
   * can't apply. Instead, draw new paths until one starts clear of the spot just hit.
   */
  createClearMotion(seconds) {
    const options = {
      speed: this.speed,
      yawRange: REGION.yawRange * this.areaScale,
      // Paths swing evenly around the zone's centre, so the floor limits how far they can swing.
      pitchRange: Math.min(
        REGION.pitchRange * this.areaScale,
        (ZONE_CENTER_PITCH - lowestPitchForRadius(this.worldRadius)) * RAD_TO_DEG,
      ),
    };
    let motion;
    for (let attempt = 0; attempt < MOTION_ATTEMPTS; attempt += 1) {
      motion = createMotion(this.pattern, this.rng, options);
      motion(seconds, this.motionSample);
      if (this.spawner.isClearOfVacated(this.motionSample.yaw, this.motionSample.pitch, this.angularRadius)) break;
    }
    return motion;
  }

  /** Every target's position is a pure function of session time, never of frame count. */
  moveTargets(elapsedMs) {
    const seconds = elapsedMs / 1000;
    for (const target of this.targets.active) {
      target.motion(seconds, this.motionSample);
      target.setAngles(this.motionSample.yaw, this.motionSample.pitch);
    }
  }

  onUpdate(deltaSeconds, elapsedMs) {
    this.moveTargets(elapsedMs);
    // Measured on the session clock rather than the frame time, which is limited after a stall.
    const deltaMs = elapsedMs - this.lastUpdateMs;
    this.lastUpdateMs = elapsedMs;
    if (!this.hold) return;
    const held = this.context.isTriggerHeld?.() ?? false;
    this.onTarget = held && this.context.shooting.isOnTarget();
    if (held) this.heldMs += deltaMs;
    if (this.onTarget) this.contactMs += deltaMs;
  }

  onHit(result) {
    super.onHit(result);
    this.moveTargets(result.time);
  }

  getLiveScore() {
    return this.hold ? Math.round(this.contactMs / 10) : super.getLiveScore();
  }

  getLiveAccuracy() {
    if (!this.hold) return super.getLiveAccuracy();
    return this.heldMs > 0 ? this.contactMs / this.heldMs : null;
  }

  getExtraStatistics() {
    if (!this.hold) return {};
    const contactAccuracy = this.heldMs > 0 ? this.contactMs / this.heldMs : 0;
    return {
      score: Math.round(this.contactMs / 10),
      accuracy: contactAccuracy,
      contactMs: this.contactMs,
      heldMs: this.heldMs,
    };
  }
}
