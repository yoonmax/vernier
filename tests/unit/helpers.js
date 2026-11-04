import { CameraController } from '../../src/rendering/CameraController.js';
import { ShootingSystem } from '../../src/shooting/ShootingSystem.js';
import { TargetManager } from '../../src/targets/TargetManager.js';
import { SeededRandom } from '../../src/utils/rng.js';

/** A controllable monotonic clock. */
export function fakeClock(start = 1000) {
  const clock = { time: start, now: () => clock.time, advance: (ms) => { clock.time += ms; } };
  return clock;
}

export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

/** A complete mode context with no rendering, so rules can be tested on their own. */
export function modeContext(overrides = {}) {
  const clock = fakeClock();
  const targets = new TargetManager();
  const view = new CameraController();
  const shooting = new ShootingSystem(view, targets);
  const finished = [];
  return {
    clock,
    targets,
    view,
    shooting,
    finished,
    context: {
      targets,
      shooting,
      rng: new SeededRandom(12345),
      now: clock.now,
      onFinish: (reason) => finished.push(reason),
      ...overrides,
    },
  };
}

/** Aims exactly at a target and fires through the real shooting system. */
export function shootTarget({ view, shooting }, mode, target) {
  view.setAngles(target.yaw, target.pitch);
  return mode.onShot(shooting.fire(mode.clock.elapsed()));
}

/** Aims well away from every target and fires. */
export function shootMiss({ view, shooting }, mode) {
  view.setAngles(Math.PI, 0);
  return mode.onShot(shooting.fire(mode.clock.elapsed()));
}
