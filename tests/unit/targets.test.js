import { describe, expect, it } from 'vitest';
import { TARGET_SHELL_RADIUS, ZONE_CENTER_PITCH, ARENA_RADIUS } from '../../src/core/constants.js';
import { ARENA_HEIGHT, FLOOR_CLEARANCE } from '../../src/core/constants.js';
import { MODES, resolveOptions } from '../../src/modes/modeCatalog.js';
import { MOTION_PATTERNS, createMotion } from '../../src/targets/TargetMotion.js';
import { worldRadiusFromDiameter } from '../../src/targets/Target.js';
import { TargetManager } from '../../src/targets/TargetManager.js';
import { TargetPool } from '../../src/targets/TargetPool.js';
import { TargetSpawner } from '../../src/targets/TargetSpawner.js';
import { DEG_TO_RAD, angularDistance } from '../../src/utils/math.js';
import { SeededRandom, parseSeed } from '../../src/utils/rng.js';
import { modeContext, shootTarget } from './helpers.js';

const REGION = { yawRange: 24, pitchRange: 11, avoidRepeat: 8, minSeparation: 2 };

function spawnMany(region, count, active = [], angularRadius = 1.5 * DEG_TO_RAD, seed = 99, areaScale = 1) {
  const spawner = new TargetSpawner(new SeededRandom(seed), region, areaScale, angularRadius * 2 / DEG_TO_RAD);
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const { yaw, pitch, cell } = spawner.next(active, angularRadius);
    results.push({ yaw, pitch, cell });
  }
  return results;
}

describe('target spawning bounds', () => {
  it('keeps every position inside the configured region', () => {
    for (const { yaw, pitch } of spawnMany(REGION, 2000)) {
      expect(Math.abs(yaw)).toBeLessThanOrEqual(REGION.yawRange * DEG_TO_RAD);
      expect(Math.abs(pitch - ZONE_CENTER_PITCH)).toBeLessThanOrEqual(REGION.pitchRange * DEG_TO_RAD);
    }
  });

  it('scales the region with the spawn-area setting', () => {
    for (const { yaw } of spawnMany(REGION, 500, [], 1.5 * DEG_TO_RAD, 5, 0.5)) {
      expect(Math.abs(yaw)).toBeLessThanOrEqual(12 * DEG_TO_RAD);
    }
  });

  it('never places targets behind the player, the wall or the floor', () => {
    const manager = new TargetManager();
    for (const { yaw, pitch } of spawnMany(REGION, 500)) {
      const target = manager.spawn(yaw, pitch, 0.5, 0);
      expect(target.z).toBeLessThan(0);
      expect(Math.hypot(target.x, target.z)).toBeLessThan(ARENA_RADIUS);
      expect(target.y - target.radius).toBeGreaterThan(0);
      manager.remove(target);
    }
  });

  it('does not immediately repeat a position', () => {
    const positions = spawnMany(REGION, 400);
    for (let i = 1; i < positions.length; i += 1) {
      const gap = angularDistance(positions[i].yaw, positions[i].pitch, positions[i - 1].yaw, positions[i - 1].pitch);
      expect(gap).toBeGreaterThanOrEqual(REGION.avoidRepeat * DEG_TO_RAD);
    }
  });

  it('reproduces the same scenario from the same seed, and a different one otherwise', () => {
    expect(spawnMany(REGION, 50, [], 0.02, 777)).toEqual(spawnMany(REGION, 50, [], 0.02, 777));
    expect(spawnMany(REGION, 50, [], 0.02, 777)).not.toEqual(spawnMany(REGION, 50, [], 0.02, 778));
  });

  it('parses seeds from numbers and text', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('  ')).toBeNull();
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed('practice')).toBe(parseSeed('practice'));
    expect(parseSeed('practice')).not.toBe(parseSeed('other'));
  });
});

describe('floor and ceiling', () => {
  const variants = (mode) => {
    const base = resolveOptions(mode);
    if (mode.id === 'tracking') {
      return MOTION_PATTERNS.map((pattern) => ({ ...base, pattern, speed: 'fast', targetCount: 3, duration: 60 }));
    }
    if (mode.id === 'gridshot') return [{ ...base, targetCount: 5 }];
    if (mode.id === 'micro') return [{ ...base, duration: 0 }];
    return [base];
  };
  const cases = MODES.flatMap((mode) => variants(mode).map((options) => [mode.id, mode, options]));
  const sizes = [[1, 1], [1, 1.5], [2, 1.5], [2, 0.5], [0.5, 1.5]];

  const expectInsideRoom = (target) => {
    expect(target.y - target.radius).toBeGreaterThanOrEqual(FLOOR_CLEARANCE - 1e-6);
    expect(target.y + target.radius).toBeLessThan(ARENA_HEIGHT);
  };

  it.each(cases)('%s stays above the floor at every size and spawn area', (id, definition, options) => {
    for (const [sizeScale, areaScale] of sizes) {
      const env = modeContext({ sizeScale, areaScale, rng: new SeededRandom(5) });
      const mode = definition.create(options, env.context);
      mode.initialize();
      mode.start();
      for (let step = 0; step < 300; step += 1) {
        env.clock.advance(60);
        mode.update(0.06);
        if (mode.finished) break;
        env.targets.active.forEach(expectInsideRoom);
        if (env.targets.active.length > 0 && step % 3 === 0) shootTarget(env, mode, env.targets.active[0]);
        if (mode.finished) break;
        env.targets.active.forEach(expectInsideRoom);
      }
    }
  });

  it('does not change where targets can appear at standard settings', () => {
    const spawner = new TargetSpawner(new SeededRandom(1), REGION, 1, 2.8);
    expect(spawner.pitchLow).toBeCloseTo(ZONE_CENTER_PITCH - REGION.pitchRange * DEG_TO_RAD, 10);
    expect(spawner.pitchHigh).toBeCloseTo(ZONE_CENTER_PITCH + REGION.pitchRange * DEG_TO_RAD, 10);
  });

  it('keeps a raised grid from overlapping', () => {
    const diameter = 8.4;
    const spawner = new TargetSpawner(new SeededRandom(1), { yawRange: 14, pitchRange: 8, gridColumns: 5, gridRows: 4 }, 1.5, diameter);
    const positions = [];
    const active = [];
    for (let i = 0; i < 300; i += 1) positions.push({ ...spawner.next(active, (diameter / 2) * DEG_TO_RAD) });
    for (const a of positions) {
      for (const b of positions) {
        if (a.cell !== b.cell) expect(angularDistance(a.yaw, a.pitch, b.yaw, b.pitch)).toBeGreaterThan(diameter * DEG_TO_RAD);
      }
    }
  });
});

describe('target separation', () => {
  it('keeps new targets clear of active ones', () => {
    const manager = new TargetManager();
    const angularRadius = 2 * DEG_TO_RAD;
    const radius = TARGET_SHELL_RADIUS * Math.tan(angularRadius);
    const spawner = new TargetSpawner(new SeededRandom(3), { ...REGION, avoidRepeat: 0 });
    for (let round = 0; round < 300; round += 1) {
      manager.clear();
      for (let i = 0; i < 5; i += 1) {
        const { yaw, pitch } = spawner.next(manager.active, angularRadius);
        for (const other of manager.active) {
          const gap = angularDistance(yaw, pitch, other.yaw, other.pitch);
          expect(gap).toBeGreaterThanOrEqual(angularRadius * 2);
        }
        manager.spawn(yaw, pitch, radius, 0);
      }
    }
  });

  it('never overlaps grid cells, even at the largest size and smallest area', () => {
    const diameter = 4.2 * 2;
    const spawner = new TargetSpawner(new SeededRandom(1), { yawRange: 14, pitchRange: 8, gridColumns: 5, gridRows: 4 }, 0.5, diameter);
    const manager = new TargetManager();
    const radius = worldRadiusFromDiameter(diameter);
    const angular = (diameter / 2) * DEG_TO_RAD;
    for (let i = 0; i < 400; i += 1) {
      if (manager.active.length === 5) manager.remove(manager.active[i % 5]);
      const { yaw, pitch, cell } = spawner.next(manager.active, angular);
      for (const other of manager.active) {
        expect(angularDistance(yaw, pitch, other.yaw, other.pitch)).toBeGreaterThan(diameter * DEG_TO_RAD);
        expect(other.cell).not.toBe(cell);
      }
      manager.spawn(yaw, pitch, radius, 0, cell);
    }
  });

  it('still returns a position when a region is impossibly crowded', () => {
    const manager = new TargetManager();
    const spawner = new TargetSpawner(new SeededRandom(1), { yawRange: 1, pitchRange: 1, minSeparation: 5 });
    for (let i = 0; i < 6; i += 1) {
      const { yaw, pitch } = spawner.next(manager.active, 0.02);
      expect(Number.isFinite(yaw) && Number.isFinite(pitch)).toBe(true);
      manager.spawn(yaw, pitch, 0.3, 0);
    }
  });
});

describe('target size', () => {
  it('gives a world radius that subtends the requested angle', () => {
    const radius = worldRadiusFromDiameter(3);
    expect(2 * Math.atan(radius / TARGET_SHELL_RADIUS) / DEG_TO_RAD).toBeCloseTo(3, 8);
  });
});

describe('target lifecycle', () => {
  it('gives every target a unique id, and reuses pooled objects', () => {
    const manager = new TargetManager();
    const first = manager.spawn(0, 0, 0.5, 0);
    const firstId = first.id;
    manager.remove(first);
    const second = manager.spawn(0.1, 0, 0.5, 0);
    expect(second).toBe(first);
    expect(second.id).not.toBe(firstId);
  });

  it('keeps ids unique across a clear', () => {
    const manager = new TargetManager();
    const { id } = manager.spawn(0, 0, 0.5, 0);
    manager.clear();
    expect(manager.spawn(0, 0, 0.5, 0).id).toBeGreaterThan(id);
  });

  it('clears motion and returns to the pool on release', () => {
    const pool = new TargetPool(1);
    const manager = new TargetManager(pool);
    const target = manager.spawn(0, 0, 0.5, 0);
    target.motion = () => {};
    manager.remove(target);
    expect(target.active).toBe(false);
    expect(target.motion).toBeNull();
    expect(pool.free).toContain(target);
  });

  it('bumps the revision on every change', () => {
    const manager = new TargetManager();
    const before = manager.revision;
    const target = manager.spawn(0, 0, 0.5, 0);
    expect(manager.revision).toBeGreaterThan(before);
    const after = manager.revision;
    manager.remove(target);
    expect(manager.revision).toBeGreaterThan(after);
  });
});

describe('target motion', () => {
  const options = { speed: 16, yawRange: 26, pitchRange: 10 };

  it.each(MOTION_PATTERNS)('%s stays inside the region', (pattern) => {
    const motion = createMotion(pattern, new SeededRandom(8), options);
    const sample = { yaw: 0, pitch: 0 };
    for (let t = 0; t < 120; t += 0.05) {
      motion(t, sample);
      expect(Math.abs(sample.yaw)).toBeLessThanOrEqual(26 * DEG_TO_RAD + 1e-9);
      expect(Math.abs(sample.pitch - ZONE_CENTER_PITCH)).toBeLessThanOrEqual(10 * DEG_TO_RAD + 1e-9);
    }
  });

  it.each(MOTION_PATTERNS)('%s has the same path at any frame rate', (pattern) => {
    // Motion is a function of time, so reaching t = 3 by any route gives the same answer.
    const motion = createMotion(pattern, new SeededRandom(8), options);
    const direct = { yaw: 0, pitch: 0 };
    motion(3, direct);
    const stepped = { yaw: 0, pitch: 0 };
    for (let frame = 1; frame <= 360 * 3; frame += 1) motion(frame / 360, stepped);
    expect(stepped.yaw).toBeCloseTo(direct.yaw, 8);
    expect(stepped.pitch).toBeCloseTo(direct.pitch, 8);
  });

  it.each(MOTION_PATTERNS)('%s moves smoothly, with no jumps', (pattern) => {
    const motion = createMotion(pattern, new SeededRandom(21), options);
    const previous = { yaw: 0, pitch: 0 };
    const sample = { yaw: 0, pitch: 0 };
    motion(0, previous);
    let peak = 0;
    for (let t = 0.002; t < 30; t += 0.002) {
      motion(t, sample);
      peak = Math.max(peak, Math.hypot(sample.yaw - previous.yaw, sample.pitch - previous.pitch) / 0.002);
      previous.yaw = sample.yaw;
      previous.pitch = sample.pitch;
    }
    // Peak speed stays within a small factor of the requested speed.
    expect(peak / DEG_TO_RAD).toBeLessThan(options.speed * 3);
    expect(peak).toBeGreaterThan(0);
  });
});
