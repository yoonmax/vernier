import { describe, expect, it } from 'vitest';
import { EYE, TARGET_SHELL_RADIUS } from '../../src/core/constants.js';
import { CameraController } from '../../src/rendering/CameraController.js';
import { angleToTarget, intersectDisc, intersectRoom, raycastTargets } from '../../src/shooting/RaycastManager.js';
import { ShootingSystem } from '../../src/shooting/ShootingSystem.js';
import { Target, worldRadiusFromDiameter } from '../../src/targets/Target.js';
import { TargetManager } from '../../src/targets/TargetManager.js';
import { directionFromAngles } from '../../src/utils/math.js';

function targetAt(yaw, pitch, radius = 0.5) {
  const target = new Target();
  target.radius = radius;
  target.setAngles(yaw, pitch);
  return target;
}

const direction = (yaw, pitch) => directionFromAngles(yaw, pitch, { x: 0, y: 0, z: 0 });

describe('raycast hit detection', () => {
  it('hits a target dead centre, at the shell distance', () => {
    const target = targetAt(0.3, 0.2);
    expect(intersectDisc(EYE, direction(0.3, 0.2), target)).toBeCloseTo(TARGET_SHELL_RADIUS, 8);
  });

  it('places targets so they exactly face the eye', () => {
    const target = targetAt(-0.8, 0.15);
    const toEye = { x: EYE.x - target.x, y: EYE.y - target.y, z: EYE.z - target.z };
    const length = Math.hypot(toEye.x, toEye.y, toEye.z);
    expect(length).toBeCloseTo(TARGET_SHELL_RADIUS, 8);
    expect(toEye.x / length).toBeCloseTo(target.nx, 8);
    expect(toEye.y / length).toBeCloseTo(target.ny, 8);
    expect(toEye.z / length).toBeCloseTo(target.nz, 8);
  });

  it('hits just inside the edge and misses just outside it', () => {
    const radius = 0.5;
    const target = targetAt(0, 0, radius);
    const edgeAngle = Math.atan(radius / TARGET_SHELL_RADIUS);
    expect(intersectDisc(EYE, direction(edgeAngle * 0.999, 0), target)).toBeGreaterThan(0);
    expect(intersectDisc(EYE, direction(edgeAngle * 1.001, 0), target)).toBe(-1);
  });

  it('hit area matches the angular size the target claims, in every direction', () => {
    const diameter = 3;
    const radius = worldRadiusFromDiameter(diameter);
    const target = targetAt(0.4, 0.2, radius);
    const half = (diameter / 2) * (Math.PI / 180);
    const samples = 24;
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const inside = direction(0.4 + (Math.cos(angle) * half * 0.98) / Math.cos(0.2), 0.2 + Math.sin(angle) * half * 0.98);
      const outside = direction(0.4 + (Math.cos(angle) * half * 1.04) / Math.cos(0.2), 0.2 + Math.sin(angle) * half * 1.04);
      expect(intersectDisc(EYE, inside, target)).toBeGreaterThan(0);
      expect(intersectDisc(EYE, outside, target)).toBe(-1);
    }
  });
});

describe('miss detection', () => {
  it('misses when aiming elsewhere', () => {
    expect(intersectDisc(EYE, direction(1, 0), targetAt(0, 0))).toBe(-1);
  });

  it('does not hit a target behind the ray', () => {
    expect(intersectDisc(EYE, direction(Math.PI, 0), targetAt(0, 0))).toBe(-1);
  });

  it('reports the angle to the nearest target on a miss', () => {
    const result = { target: null, distance: 0, offset: 0 };
    raycastTargets(EYE, direction(0.5, 0), [targetAt(0, 0), targetAt(0.2, 0)], result);
    expect(result.target).toBeNull();
    expect(result.offset).toBeCloseTo(0.3, 6);
  });

  it('reports no offset with no targets at all', () => {
    const result = { target: null, distance: 0, offset: 0 };
    raycastTargets(EYE, direction(0, 0), [], result);
    expect(result.target).toBeNull();
    expect(result.offset).toBe(Infinity);
  });
});

describe('shooting system', () => {
  it('uses the current camera orientation at the moment it fires', () => {
    const view = new CameraController();
    const targets = new TargetManager();
    const shooting = new ShootingSystem(view, targets);
    const target = targets.spawn(0.5, 0.1, 0.5, 0);

    view.setAngles(0, 0);
    expect(shooting.fire(0).hit).toBe(false);

    view.setAngles(0.5, 0.1);
    const result = shooting.fire(10);
    expect(result.hit).toBe(true);
    expect(result.target).toBe(target);
    expect(result.time).toBe(10);
    expect(result.offsetDegrees).toBeCloseTo(0, 2);
  });

  it('gives identical results for identical inputs', () => {
    const run = () => {
      const view = new CameraController();
      const targets = new TargetManager();
      const shooting = new ShootingSystem(view, targets);
      targets.spawn(0.2, 0.05, 0.4, 0);
      view.setAngles(0.201, 0.051);
      const { hit, offsetDegrees } = shooting.fire(0);
      return { hit, offsetDegrees };
    };
    expect(run()).toEqual(run());
  });

  it('picks the nearer target when two overlap on the ray', () => {
    const result = { target: null, distance: 0, offset: 0 };
    const far = targetAt(0, 0, 1);
    const near = targetAt(0, 0, 1);
    near.x = EYE.x;
    near.y = EYE.y;
    near.z = EYE.z - 10;
    raycastTargets(EYE, direction(0, 0), [far, near], result);
    expect(result.target).toBe(near);
    expect(result.distance).toBeCloseTo(10, 8);
  });
});

describe('room intersection', () => {
  const out = { x: 0, y: 0, z: 0, surface: '' };

  it('finds the wall straight ahead', () => {
    expect(intersectRoom(EYE, direction(0, 0), 18, 11, out)).toBe(true);
    expect(out.surface).toBe('wall');
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(18, 6);
  });

  it('finds the floor when looking down and the ceiling when looking up', () => {
    intersectRoom(EYE, direction(0, -1.2), 18, 11, out);
    expect(out.surface).toBe('floor');
    expect(out.y).toBeCloseTo(0, 6);
    intersectRoom(EYE, direction(0, 1.2), 18, 11, out);
    expect(out.surface).toBe('ceiling');
    expect(out.y).toBeCloseTo(11, 6);
  });

  it('angle to target is zero when aimed at its centre', () => {
    expect(angleToTarget(EYE, direction(0.3, -0.1), targetAt(0.3, -0.1))).toBeCloseTo(0, 6);
  });
});
