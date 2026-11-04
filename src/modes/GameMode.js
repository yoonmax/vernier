import { TimeManager } from '../core/TimeManager.js';
import { DEG_TO_RAD } from '../utils/math.js';
import { TargetSpawner } from '../targets/TargetSpawner.js';
import { worldRadiusFromDiameter } from '../targets/Target.js';
import { SessionRecorder } from '../stats/SessionRecorder.js';

/**
 * @typedef {object} ModeContext
 * @property {import('../targets/TargetManager.js').TargetManager} targets
 * @property {import('../utils/rng.js').SeededRandom} rng
 * @property {import('../shooting/ShootingSystem.js').ShootingSystem} shooting
 * @property {() => number} [now] monotonic milliseconds, injectable for tests
 * @property {() => boolean} [isTriggerHeld]
 * @property {number} [sizeScale] player's target-size multiplier
 * @property {number} [areaScale] player's spawn-area multiplier
 * @property {(reason:string) => void} [onFinish]
 */

/**
 * @typedef {object} ModeRules
 * @property {number} targetCount targets kept active at once
 * @property {number} targetDiameter target size in degrees of visual angle
 * @property {import('../targets/TargetSpawner.js').SpawnRegion} region
 * @property {number} [durationMs] ends the session after this much active time
 * @property {number} [hitGoal] ends the session after this many hits
 */

/**
 * Shared session behaviour. Modes describe their rules and override the few hooks where
 * they really differ, so spawning, timing and scoring exist in exactly one place.
 */
export class GameMode {
  /**
   * @param {ModeRules} rules
   * @param {ModeContext} context
   */
  constructor(rules, context) {
    this.rules = rules;
    this.context = context;
    this.targets = context.targets;
    this.rng = context.rng;
    this.clock = new TimeManager(context.now);
    this.recorder = new SessionRecorder();
    this.sizeScale = context.sizeScale ?? 1;
    this.areaScale = context.areaScale ?? 1;
    this.diameter = rules.targetDiameter * this.sizeScale;
    this.worldRadius = worldRadiusFromDiameter(this.diameter);
    this.angularRadius = (this.diameter / 2) * DEG_TO_RAD;
    this.spawner = new TargetSpawner(this.rng, rules.region, this.areaScale, this.diameter);
    this.started = false;
    this.paused = false;
    this.finished = false;
    this.finishReason = null;
    this.finalElapsed = 0;
  }

  /** True for modes scored on contact time, where the trigger never fires single shots. */
  get usesTriggerHold() {
    return false;
  }

  /** Clears transient state and places the first targets so they are ready before the start. */
  initialize() {
    this.targets.clear();
    this.recorder.reset();
    this.clock.reset();
    this.started = false;
    this.paused = false;
    this.finished = false;
    this.finishReason = null;
    this.finalElapsed = 0;
    this.onInitialize();
  }

  start() {
    this.clock.start();
    this.started = true;
    this.paused = false;
    this.onStart();
  }

  update(deltaSeconds) {
    if (!this.started || this.paused || this.finished) return;
    const elapsed = this.clock.elapsed();
    if (this.rules.durationMs !== undefined && elapsed >= this.rules.durationMs) {
      this.finalElapsed = this.rules.durationMs;
      this.finish('time');
      return;
    }
    this.onUpdate(deltaSeconds, elapsed);
  }

  /** Takes a shot from the shooting system and applies it to the session. */
  onShot(result) {
    if (!this.started || this.paused || this.finished) return false;
    const { durationMs } = this.rules;
    if (durationMs !== undefined && result.time >= durationMs) {
      this.finalElapsed = durationMs;
      this.finish('time');
      return false;
    }
    if (result.hit) this.onHit(result);
    else this.onMiss(result);
    return true;
  }

  onHit(result) {
    const { target, time } = result;
    this.recorder.recordHit(time, Math.max(0, time - target.spawnTime), result.offsetDegrees);
    this.spawner.markVacated(target);
    this.targets.remove(target);
    if (this.rules.hitGoal !== undefined && this.recorder.hits >= this.rules.hitGoal) {
      this.finalElapsed = time;
      this.finish('goal');
      return;
    }
    this.fillTargets(time);
  }

  onMiss(result) {
    this.recorder.recordMiss(result.offsetDegrees);
  }

  pause() {
    if (!this.started || this.paused || this.finished) return;
    this.paused = true;
    this.clock.pause();
    this.onPause();
  }

  resume() {
    if (!this.started || !this.paused || this.finished) return;
    this.paused = false;
    this.clock.resume();
    this.onResume();
  }

  reset() {
    this.initialize();
  }

  finish(reason = 'manual') {
    if (this.finished) return;
    if (!this.finalElapsed) this.finalElapsed = this.clock.elapsed();
    this.clock.pause();
    this.finished = true;
    this.finishReason = reason;
    this.targets.clear();
    this.context.onFinish?.(reason);
  }

  /** Session clock for the HUD: time remaining for timed modes, time elapsed otherwise. */
  getClock() {
    const elapsed = this.finished ? this.finalElapsed : this.clock.elapsed();
    const { durationMs } = this.rules;
    return durationMs !== undefined
      ? { elapsedMs: elapsed, remainingMs: Math.max(0, durationMs - elapsed) }
      : { elapsedMs: elapsed, remainingMs: null };
  }

  /** Score and accuracy as the HUD should show them right now. */
  getLiveScore() {
    return this.recorder.score;
  }

  getLiveAccuracy() {
    const { hits, shots } = this.recorder;
    return shots > 0 ? hits / shots : null;
  }

  /** Text for the HUD's progress position, when the mode has a count to show. */
  getProgress() {
    const { hitGoal } = this.rules;
    return hitGoal !== undefined ? { current: this.recorder.hits, total: hitGoal } : null;
  }

  getStatistics() {
    const duration = this.finished ? this.finalElapsed : this.clock.elapsed();
    return { ...this.recorder.summary(duration), ...this.getExtraStatistics() };
  }

  /** Spawns until the configured number of targets is active. */
  fillTargets(time) {
    while (this.targets.active.length < this.rules.targetCount) this.spawnTarget(time);
  }

  spawnTarget(time) {
    const { yaw, pitch, cell } = this.spawner.next(this.targets.active, this.angularRadius);
    return this.targets.spawn(yaw, pitch, this.worldRadius, time, cell);
  }

  onInitialize() {
    this.fillTargets(0);
  }

  onStart() {}

  onUpdate() {}

  onPause() {}

  onResume() {}

  getExtraStatistics() {
    return {};
  }
}
