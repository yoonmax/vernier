import { describe, expect, it } from 'vitest';
import { getMode } from '../../src/modes/modeCatalog.js';
import { DEG_TO_RAD, angularDistance } from '../../src/utils/math.js';
import { SeededRandom } from '../../src/utils/rng.js';
import { modeContext, shootTarget } from './helpers.js';

/**
 * A replacement landing on the spot just shot looks as if the shot did nothing, even though
 * the hit sound played. So a new target must never overlap the disc it replaces.
 */
function expectReplacementsToMove(modeId, options, { shots = 400, seeds = 4 } = {}) {
  const definition = getMode(modeId);
  for (let seed = 1; seed <= seeds; seed += 1) {
    const env = modeContext({ rng: new SeededRandom(seed * 7919) });
    const mode = definition.create(options, env.context);
    mode.initialize();
    mode.start();

    for (let shot = 0; shot < shots; shot += 1) {
      env.clock.advance(50);
      mode.update(0.05);
      const target = env.targets.active[shot % env.targets.active.length];
      const { yaw, pitch, cell, id } = target;
      const before = new Set(env.targets.active.map((entry) => entry.id));
      before.delete(id);

      shootTarget(env, mode, target);

      const replacement = env.targets.active.find((entry) => !before.has(entry.id));
      expect(replacement).toBeDefined();
      expect(replacement.id).not.toBe(id);
      if (cell !== -1) expect(replacement.cell).not.toBe(cell);
      const separation = angularDistance(yaw, pitch, replacement.yaw, replacement.pitch);
      expect(separation).toBeGreaterThanOrEqual(definition.targetDiameter(options) * DEG_TO_RAD);
    }
  }
}

describe('a new target never appears where the last one was shot', () => {
  it.each([3, 4, 5])('gridshot with %i targets', (targetCount) => {
    expectReplacementsToMove('gridshot', { duration: 120, targetCount });
  });

  it('precision', () => {
    expectReplacementsToMove('precision', {});
  });

  it('speed', () => {
    expectReplacementsToMove('speed', { goal: 100 }, { shots: 99 });
  });

  it.each(['easy', 'normal', 'hard'])('micro at %s', (difficulty) => {
    expectReplacementsToMove('micro', { duration: 0, difficulty });
  });

  describe.each(['horizontal', 'vertical', 'circular', 'random'])('tracking on a %s path', (pattern) => {
    it.each([1, 3])('with %i targets', (targetCount) => {
      expectReplacementsToMove('tracking', { duration: 60, pattern, speed: 'medium', input: 'click', targetCount });
    });
  });

  it('holds for customised target size and spawn area', () => {
    const definition = getMode('gridshot');
    const options = { duration: 120, targetCount: 5 };
    const env = modeContext({ sizeScale: 2, areaScale: 0.5 });
    const mode = definition.create(options, env.context);
    mode.initialize();
    mode.start();
    for (let shot = 0; shot < 300; shot += 1) {
      env.clock.advance(50);
      const target = env.targets.active[shot % 5];
      const { cell } = target;
      const others = new Set(env.targets.active.filter((entry) => entry !== target).map((entry) => entry.id));
      shootTarget(env, mode, target);
      expect(env.targets.active.find((entry) => !others.has(entry.id)).cell).not.toBe(cell);
    }
  });

  it('stays reproducible from a seed', () => {
    const sequence = () => {
      const env = modeContext({ rng: new SeededRandom(42) });
      const mode = getMode('gridshot').create({ duration: 120, targetCount: 3 }, env.context);
      mode.initialize();
      mode.start();
      const cells = [];
      for (let shot = 0; shot < 60; shot += 1) {
        shootTarget(env, mode, env.targets.active[shot % 3]);
        cells.push(env.targets.active.map((entry) => entry.cell).join());
      }
      return cells;
    };
    expect(sequence()).toEqual(sequence());
  });
});
