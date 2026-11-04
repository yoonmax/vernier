import { describe, expect, it } from 'vitest';
import { GridshotMode } from '../../src/modes/GridshotMode.js';
import { MICRO_DIAMETERS, MicroMode } from '../../src/modes/MicroMode.js';
import { MODES, getMode, isEndless, resolveOptions, variantKey, variantLabel } from '../../src/modes/modeCatalog.js';
import { PrecisionMode } from '../../src/modes/PrecisionMode.js';
import { FALSE_START_PENALTY_MS, ReactionMode, ReactionPhase } from '../../src/modes/ReactionMode.js';
import { SpeedMode } from '../../src/modes/SpeedMode.js';
import { TrackingMode } from '../../src/modes/TrackingMode.js';
import { modeContext, shootMiss, shootTarget } from './helpers.js';

function started(ModeClass, options, overrides) {
  const env = modeContext(overrides);
  const mode = new ModeClass(options, env.context);
  mode.initialize();
  mode.start();
  return { ...env, mode };
}

describe('single-target replacement', () => {
  it('keeps exactly one target, and replaces it the moment it is hit', () => {
    const env = started(PrecisionMode, {});
    expect(env.targets.active).toHaveLength(1);
    const first = env.targets.active[0];
    const firstId = first.id;
    const { yaw, pitch } = first;
    shootTarget(env, env.mode, first);
    expect(env.targets.active).toHaveLength(1);
    expect(env.targets.active[0].id).not.toBe(firstId);
    expect(env.targets.active[0].yaw === yaw && env.targets.active[0].pitch === pitch).toBe(false);
  });

  it('keeps the target when a shot misses', () => {
    const env = started(PrecisionMode, {});
    const { id } = env.targets.active[0];
    shootMiss(env, env.mode);
    expect(env.targets.active[0].id).toBe(id);
    expect(env.mode.recorder.shots).toBe(1);
    expect(env.mode.recorder.hits).toBe(0);
  });

  it('runs endlessly until told to finish', () => {
    const env = started(PrecisionMode, {});
    env.clock.advance(10 * 60 * 1000);
    env.mode.update(0.016);
    expect(env.mode.finished).toBe(false);
    env.mode.finish('manual');
    expect(env.finished).toEqual(['manual']);
  });
});

describe('multi-target replacement', () => {
  it('maintains the configured number of targets through rapid hits', () => {
    const env = started(GridshotMode, { duration: 60, targetCount: 3 });
    expect(env.targets.active).toHaveLength(3);
    for (let i = 0; i < 200; i += 1) {
      env.clock.advance(5);
      shootTarget(env, env.mode, env.targets.active[i % 3]);
      expect(env.targets.active).toHaveLength(3);
    }
    expect(env.mode.recorder.hits).toBe(200);
  });

  it('supports other target counts', () => {
    expect(started(GridshotMode, { duration: 60, targetCount: 5 }).targets.active).toHaveLength(5);
  });

  it('removes only the target that was hit', () => {
    const env = started(GridshotMode, { duration: 60, targetCount: 3 });
    const [a, b, c] = env.targets.active.map((target) => target.id);
    shootTarget(env, env.mode, env.targets.active[1]);
    const ids = env.targets.active.map((target) => target.id);
    expect(ids).toContain(a);
    expect(ids).toContain(c);
    expect(ids).not.toContain(b);
  });
});

describe('timed mode completion', () => {
  it.each([15, 30, 60, 120])('finishes exactly at %i seconds', (duration) => {
    const env = started(GridshotMode, { duration, targetCount: 3 });
    env.clock.advance(duration * 1000 - 1);
    env.mode.update(0.016);
    expect(env.mode.finished).toBe(false);
    env.clock.advance(1);
    env.mode.update(0.016);
    expect(env.mode.finished).toBe(true);
    expect(env.finished).toEqual(['time']);
    expect(env.mode.getStatistics().durationMs).toBe(duration * 1000);
    expect(env.targets.active).toHaveLength(0);
  });

  it('reports the exact length even if the frame that ends it arrives late', () => {
    const env = started(GridshotMode, { duration: 15, targetCount: 3 });
    env.clock.advance(15400);
    env.mode.update(0.1);
    expect(env.mode.getStatistics().durationMs).toBe(15000);
  });

  it('ignores a shot fired after time is up', () => {
    const env = started(GridshotMode, { duration: 15, targetCount: 3 });
    env.clock.advance(15001);
    const counted = shootTarget(env, env.mode, env.targets.active[0]);
    expect(counted).toBe(false);
    expect(env.mode.recorder.shots).toBe(0);
    expect(env.mode.finished).toBe(true);
  });

  it('finishes only once', () => {
    const env = started(GridshotMode, { duration: 15, targetCount: 3 });
    env.clock.advance(20000);
    env.mode.update(0.1);
    env.mode.update(0.1);
    env.mode.finish();
    expect(env.finished).toHaveLength(1);
  });
});

describe('speed mode completion', () => {
  it.each([25, 50, 100])('stops the clock on hit number %i', (goal) => {
    const env = started(SpeedMode, { goal });
    for (let i = 0; i < goal - 1; i += 1) {
      env.clock.advance(200);
      shootTarget(env, env.mode, env.targets.active[0]);
      expect(env.mode.finished).toBe(false);
      expect(env.targets.active).toHaveLength(1);
    }
    env.clock.advance(200);
    shootTarget(env, env.mode, env.targets.active[0]);
    expect(env.mode.finished).toBe(true);
    expect(env.finished).toEqual(['goal']);

    const stats = env.mode.getStatistics();
    expect(stats.completionMs).toBe(goal * 200);
    expect(stats.hits).toBe(goal);
    expect(stats.averageAcquisitionMs).toBeCloseTo(200, 6);

    env.clock.advance(5000);
    expect(env.mode.getStatistics().completionMs).toBe(goal * 200);
  });

  it('has no completion time if ended early', () => {
    const env = started(SpeedMode, { goal: 25 });
    env.clock.advance(100);
    shootTarget(env, env.mode, env.targets.active[0]);
    env.mode.finish('manual');
    expect(env.mode.getStatistics().completionMs).toBeNull();
  });

  it('counts misses in accuracy but not towards the goal', () => {
    const env = started(SpeedMode, { goal: 25 });
    shootMiss(env, env.mode);
    shootTarget(env, env.mode, env.targets.active[0]);
    const stats = env.mode.getStatistics();
    expect(stats.accuracy).toBe(0.5);
    expect(stats.hits).toBe(1);
    expect(env.mode.getProgress()).toEqual({ current: 1, total: 25 });
  });
});

describe('micro mode', () => {
  it('uses smaller targets at higher difficulty', () => {
    const radius = (difficulty) => started(MicroMode, { duration: 60, difficulty }).targets.active[0].radius;
    expect(radius('easy')).toBeGreaterThan(radius('normal'));
    expect(radius('normal')).toBeGreaterThan(radius('hard'));
    expect(MICRO_DIAMETERS.easy).toBeLessThan(2);
  });

  it('is timed, or endless when the length is zero', () => {
    const timed = started(MicroMode, { duration: 30, difficulty: 'normal' });
    timed.clock.advance(30000);
    timed.mode.update(0.016);
    expect(timed.mode.finished).toBe(true);

    const endless = started(MicroMode, { duration: 0, difficulty: 'normal' });
    endless.clock.advance(3600000);
    endless.mode.update(0.016);
    expect(endless.mode.finished).toBe(false);
    expect(endless.mode.getClock().remainingMs).toBeNull();
  });

  it('records how far from centre each hit landed', () => {
    const env = started(MicroMode, { duration: 60, difficulty: 'easy' });
    const target = env.targets.active[0];
    env.view.setAngles(target.yaw + 0.002, target.pitch);
    env.mode.onShot(env.shooting.fire(env.mode.clock.elapsed()));
    const stats = env.mode.getStatistics();
    expect(stats.hits).toBe(1);
    expect(stats.averageHitOffsetDegrees).toBeGreaterThan(0.05);
    expect(stats.averageHitOffsetDegrees).toBeLessThan(0.2);
  });
});

describe('tracking mode', () => {
  const click = { duration: 30, pattern: 'horizontal', speed: 'medium', input: 'click', targetCount: 1 };
  const hold = { ...click, input: 'hold' };

  it('moves targets with session time', () => {
    const env = started(TrackingMode, click);
    const target = env.targets.active[0];
    const start = target.yaw;
    env.clock.advance(500);
    env.mode.update(0.5);
    expect(target.yaw).not.toBeCloseTo(start, 6);
  });

  it('places targets on their path at the same position for the same time, at any frame rate', () => {
    const position = (steps) => {
      const env = started(TrackingMode, click);
      for (let i = 0; i < steps; i += 1) {
        env.clock.advance(1000 / steps);
        env.mode.update(1 / steps);
      }
      return env.targets.active[0].yaw;
    };
    expect(position(60)).toBeCloseTo(position(240), 6);
  });

  it('scores clicks and spawns a replacement in the click variant', () => {
    const env = started(TrackingMode, click);
    const { id } = env.targets.active[0];
    shootTarget(env, env.mode, env.targets.active[0]);
    expect(env.mode.recorder.hits).toBe(1);
    expect(env.targets.active[0].id).not.toBe(id);
    expect(env.targets.active[0].motion).not.toBeNull();
  });

  it('supports several targets at once', () => {
    expect(started(TrackingMode, { ...click, targetCount: 3 }).targets.active).toHaveLength(3);
  });

  it('scores only contact time while the trigger is held in the hold variant', () => {
    let held = false;
    const env = started(TrackingMode, hold, { isTriggerHeld: () => held });
    expect(env.mode.usesTriggerHold).toBe(true);
    const frame = (seconds) => {
      env.clock.advance(seconds * 1000);
      env.mode.update(seconds);
    };

    // On target, but not firing: nothing counts.
    frame(0.1);
    env.view.setAngles(env.targets.active[0].yaw, env.targets.active[0].pitch);
    frame(0.1);
    expect(env.mode.contactMs).toBe(0);

    // Firing, and tracking the target exactly: all of it counts.
    held = true;
    for (let i = 0; i < 100; i += 1) {
      env.view.setAngles(env.targets.active[0].yaw, env.targets.active[0].pitch);
      frame(0.01);
    }
    expect(env.mode.contactMs).toBeGreaterThan(900);

    // Firing, looking away: held time grows and contact doesn't.
    const contact = env.mode.contactMs;
    env.view.setAngles(Math.PI, 0);
    frame(0.5);
    expect(env.mode.contactMs).toBe(contact);

    const stats = env.mode.getStatistics();
    expect(stats.heldMs).toBeCloseTo(1500, 0);
    expect(stats.accuracy).toBeCloseTo(stats.contactMs / stats.heldMs, 8);
    expect(stats.score).toBe(Math.round(stats.contactMs / 10));
  });
});

describe('tracking contact time', () => {
  it('follows the session clock, so a long frame neither loses nor invents time', () => {
    const env = started(TrackingMode, { duration: 30, pattern: 'horizontal', speed: 'slow', input: 'hold', targetCount: 1 }, { isTriggerHeld: () => true });
    env.view.setAngles(Math.PI, 0);
    env.clock.advance(5000);
    // The game loop limits the step it reports after a stall to 0.1 s. The clock knows better.
    env.mode.update(0.1);
    expect(env.mode.heldMs).toBe(5000);
  });

  it('does not count paused time', () => {
    const env = started(TrackingMode, { duration: 30, pattern: 'horizontal', speed: 'slow', input: 'hold', targetCount: 1 }, { isTriggerHeld: () => true });
    env.clock.advance(1000);
    env.mode.update(1);
    env.mode.pause();
    env.clock.advance(60000);
    env.mode.resume();
    env.clock.advance(1000);
    env.mode.update(1);
    expect(env.mode.heldMs).toBe(2000);
  });
});

describe('reaction-time calculation', () => {
  const runTrial = (env, reactionMs) => {
    for (let i = 0; i < 500 && env.mode.phase !== ReactionPhase.ACTIVE; i += 1) {
      env.clock.advance(20);
      env.mode.update(0.02);
    }
    expect(env.mode.phase).toBe(ReactionPhase.ACTIVE);
    env.clock.advance(reactionMs);
    shootTarget(env, env.mode, env.targets.active[0]);
  };

  it('shows no target until the random delay has passed, within its bounds', () => {
    const env = started(ReactionMode, { trials: 5 });
    expect(env.targets.active).toHaveLength(0);
    env.clock.advance(999);
    env.mode.update(0.016);
    expect(env.targets.active).toHaveLength(0);
    env.clock.advance(2501);
    env.mode.update(0.016);
    expect(env.targets.active).toHaveLength(1);
  });

  it('measures from the target appearing to the hit, and summarises the trials', () => {
    const env = started(ReactionMode, { trials: 5 });
    for (const ms of [200, 300, 250, 400, 350]) runTrial(env, ms);
    expect(env.mode.finished).toBe(true);
    const { reaction, falseStarts, score } = env.mode.getStatistics();
    expect(reaction.trials).toEqual([200, 300, 250, 400, 350]);
    expect(reaction.average).toBe(300);
    expect(reaction.median).toBe(300);
    expect(reaction.fastest).toBe(200);
    expect(reaction.slowest).toBe(400);
    expect(reaction.deviation).toBeCloseTo(70.71, 1);
    expect(reaction.consistency).toBeCloseTo(1 - 70.71 / 300, 2);
    expect(falseStarts).toBe(0);
    expect(score).toBe(300);
  });

  it('penalises a false start and restarts the wait, without touching measured times', () => {
    const env = started(ReactionMode, { trials: 5 });
    env.clock.advance(500);
    env.mode.update(0.016);
    shootMiss(env, env.mode);
    expect(env.mode.falseStarts).toBe(1);
    expect(env.mode.takeNotice()).toBe('Too early');
    expect(env.mode.takeNotice()).toBeNull();
    expect(env.mode.phase).toBe(ReactionPhase.WAITING);

    for (let i = 0; i < 5; i += 1) runTrial(env, 300);
    const stats = env.mode.getStatistics();
    expect(stats.reaction.median).toBe(300);
    expect(stats.score).toBe(300 + FALSE_START_PENALTY_MS);
    expect(stats.falseStarts).toBe(1);
  });

  it('treats a click made before the target appeared as a false start, even if handled after', () => {
    const env = started(ReactionMode, { trials: 5 });
    for (let i = 0; i < 500 && env.mode.phase !== ReactionPhase.ACTIVE; i += 1) {
      env.clock.advance(20);
      env.mode.update(0.02);
    }
    const target = env.targets.active[0];
    env.view.setAngles(target.yaw, target.pitch);
    const result = env.shooting.fire(env.mode.clock.elapsed() - 5);
    expect(result.hit).toBe(true);
    env.mode.onShot(result);
    expect(env.mode.reactionTimes).toHaveLength(0);
    expect(env.mode.falseStarts).toBe(1);
    expect(env.targets.active).toHaveLength(0);
    expect(env.mode.phase).toBe(ReactionPhase.WAITING);
  });

  it('keeps the clock running through a miss while the target is up', () => {
    const env = started(ReactionMode, { trials: 5 });
    for (let i = 0; i < 500 && env.mode.phase !== ReactionPhase.ACTIVE; i += 1) {
      env.clock.advance(20);
      env.mode.update(0.02);
    }
    env.clock.advance(100);
    shootMiss(env, env.mode);
    env.clock.advance(150);
    shootTarget(env, env.mode, env.targets.active[0]);
    expect(env.mode.reactionTimes[0]).toBe(250);
    expect(env.mode.falseStarts).toBe(0);
  });

  it('discards an attempt interrupted by a pause', () => {
    const env = started(ReactionMode, { trials: 5 });
    for (let i = 0; i < 500 && env.mode.phase !== ReactionPhase.ACTIVE; i += 1) {
      env.clock.advance(20);
      env.mode.update(0.02);
    }
    env.mode.pause();
    expect(env.targets.active).toHaveLength(0);
    env.clock.advance(60000);
    env.mode.resume();
    expect(env.mode.phase).toBe(ReactionPhase.WAITING);
    expect(env.mode.reactionTimes).toHaveLength(0);
  });

  it('gives no score when no trial was completed', () => {
    const env = started(ReactionMode, { trials: 5 });
    env.mode.finish('manual');
    expect(env.mode.getStatistics().score).toBeNull();
  });
});

describe('pause and resume timing', () => {
  it('excludes paused time from the session clock', () => {
    const env = started(GridshotMode, { duration: 60, targetCount: 3 });
    env.clock.advance(10000);
    env.mode.pause();
    env.clock.advance(3600000);
    env.mode.update(0.016);
    expect(env.mode.finished).toBe(false);
    env.mode.resume();
    env.clock.advance(5000);
    expect(env.mode.clock.elapsed()).toBe(15000);
    expect(env.mode.getClock().remainingMs).toBe(45000);
  });

  it('cannot time out while paused', () => {
    const env = started(GridshotMode, { duration: 15, targetCount: 3 });
    env.mode.pause();
    env.clock.advance(100000);
    env.mode.update(0.016);
    expect(env.mode.finished).toBe(false);
  });

  it('ignores shots while paused', () => {
    const env = started(PrecisionMode, {});
    env.mode.pause();
    expect(shootTarget(env, env.mode, env.targets.active[0])).toBe(false);
    expect(env.mode.recorder.shots).toBe(0);
  });

  it('freezes moving targets while paused', () => {
    const env = started(TrackingMode, { duration: 30, pattern: 'horizontal', speed: 'fast', input: 'click', targetCount: 1 });
    env.clock.advance(500);
    env.mode.update(0.5);
    const { yaw } = env.targets.active[0];
    env.mode.pause();
    env.clock.advance(4000);
    env.mode.update(0.1);
    expect(env.targets.active[0].yaw).toBe(yaw);
    env.mode.resume();
    env.mode.update(0);
    expect(env.targets.active[0].yaw).toBeCloseTo(yaw, 6);
  });

  it('does nothing when pausing before the start or after the finish', () => {
    const env = modeContext();
    const mode = new PrecisionMode({}, env.context);
    mode.initialize();
    mode.pause();
    expect(mode.paused).toBe(false);
    mode.start();
    mode.finish();
    mode.pause();
    expect(mode.paused).toBe(false);
  });
});

describe('reset and switching modes', () => {
  it('reset clears score, time and targets', () => {
    const env = started(GridshotMode, { duration: 60, targetCount: 3 });
    env.clock.advance(1000);
    shootTarget(env, env.mode, env.targets.active[0]);
    shootMiss(env, env.mode);
    env.mode.reset();
    expect(env.mode.recorder.shots).toBe(0);
    expect(env.mode.recorder.score).toBe(0);
    expect(env.mode.started).toBe(false);
    expect(env.mode.clock.elapsed()).toBe(0);
    expect(env.targets.active).toHaveLength(3);
  });

  it('a new mode on the same manager starts clean', () => {
    const env = started(GridshotMode, { duration: 60, targetCount: 5 });
    const next = new PrecisionMode({}, env.context);
    next.initialize();
    expect(env.targets.active).toHaveLength(1);
  });

  it('a reaction reset forgets earlier trials', () => {
    const env = started(ReactionMode, { trials: 5 });
    env.mode.falseStarts = 3;
    env.mode.reactionTimes.push(200);
    env.mode.reset();
    expect(env.mode.falseStarts).toBe(0);
    expect(env.mode.reactionTimes).toHaveLength(0);
    expect(env.targets.active).toHaveLength(0);
  });
});

describe('mode catalogue', () => {
  it('lists the six modes', () => {
    expect(MODES.map((mode) => mode.id)).toEqual(['gridshot', 'precision', 'speed', 'micro', 'tracking', 'reaction']);
  });

  it.each(MODES.map((mode) => [mode.id, mode]))('%s can run a full session with default options', (id, definition) => {
    const env = modeContext();
    const options = resolveOptions(definition);
    const mode = definition.create(options, env.context);
    mode.initialize();
    mode.start();
    env.clock.advance(5000);
    mode.update(0.016);
    if (env.targets.active.length > 0) shootTarget(env, mode, env.targets.active[0]);
    shootMiss(env, mode);
    mode.finish('manual');
    const stats = mode.getStatistics();
    expect(stats.shots).toBeGreaterThan(0);
    const metric = definition.metric(options);
    expect(['higher', 'lower']).toContain(metric.better);
    expect(definition.targetDiameter(options)).toBeGreaterThan(0);
  });

  it('falls back to defaults for invalid saved options', () => {
    const gridshot = getMode('gridshot');
    expect(resolveOptions(gridshot, { duration: 999, targetCount: 'x' })).toEqual({ duration: 60, targetCount: 3 });
    expect(resolveOptions(gridshot, { duration: 15 })).toEqual({ duration: 15, targetCount: 3 });
    expect(getMode('nonsense')).toBe(MODES[0]);
  });

  it('keeps different variants apart for personal bests', () => {
    const gridshot = getMode('gridshot');
    expect(variantKey(gridshot, { duration: 15, targetCount: 3 })).not.toBe(variantKey(gridshot, { duration: 60, targetCount: 3 }));
    expect(variantLabel(gridshot, { duration: 60, targetCount: 3 })).toBe('60 s, 3 targets');
  });

  it('knows which variants are endless', () => {
    const micro = getMode('micro');
    expect(isEndless(getMode('precision'), {})).toBe(true);
    expect(isEndless(micro, { duration: 0 })).toBe(true);
    expect(isEndless(micro, { duration: 60 })).toBe(false);
    expect(isEndless(getMode('gridshot'), { duration: 60 })).toBe(false);
  });

  it('compares endless variants on rate, and needs enough hits for it to mean anything', () => {
    expect(getMode('precision').metric({}).key).toBe('hitsPerSecond');
    expect(getMode('precision').metric({}).minHits).toBeGreaterThan(0);
    expect(getMode('micro').metric({ duration: 0 }).key).toBe('hitsPerSecond');
    expect(getMode('micro').metric({ duration: 60 }).key).toBe('score');
    expect(getMode('speed').metric({}).better).toBe('lower');
    expect(getMode('reaction').metric({}).better).toBe('lower');
  });
});
