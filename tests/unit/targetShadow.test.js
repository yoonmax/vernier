import { describe, expect, it } from 'vitest';
import { ARENA_RADIUS, EYE } from '../../src/core/constants.js';
import { contactShadowPlacement } from '../../src/rendering/TargetVisuals.js';
import { Target } from '../../src/targets/Target.js';
import { DEG_TO_RAD } from '../../src/utils/math.js';

function targetAt(yawDegrees, pitchDegrees, radius = 0.6) {
  const target = new Target();
  target.radius = radius;
  target.setAngles(yawDegrees * DEG_TO_RAD, pitchDegrees * DEG_TO_RAD);
  return target;
}

/** How far below the target the shadow's centre looks from the eye, in target radii. */
function apparentDrop(target) {
  const shadow = contactShadowPlacement(target, { x: 0, y: 0, z: 0, size: 0 });
  const shadowPitch = Math.atan2(shadow.y - EYE.y, Math.hypot(shadow.x - EYE.x, shadow.z - EYE.z));
  const targetPitch = Math.atan2(target.y - EYE.y, Math.hypot(target.x - EYE.x, target.z - EYE.z));
  const targetAngularRadius = Math.atan(target.radius / 16);
  return (targetPitch - shadowPitch) / targetAngularRadius;
}

describe('target contact shadows', () => {
  it.each([-1, 3, 10, 16, 21, 28])('stays close beneath a target at %i° of pitch', (pitch) => {
    const drop = apparentDrop(targetAt(0, pitch));
    expect(drop).toBeGreaterThan(0.2);
    expect(drop).toBeLessThan(0.8);
  });

  it('looks the same distance away at any height', () => {
    expect(apparentDrop(targetAt(0, 28))).toBeCloseTo(apparentDrop(targetAt(0, 0)), 0);
  });

  it('stays directly below the target, whichever way it is from the player', () => {
    for (const yaw of [-40, -15, 0, 22, 40]) {
      const target = targetAt(yaw, 12);
      const shadow = contactShadowPlacement(target, { x: 0, y: 0, z: 0, size: 0 });
      expect(Math.atan2(-shadow.x, -shadow.z)).toBeCloseTo(target.yaw, 8);
    }
  });

  it('sits on the wall, in front of it', () => {
    const shadow = contactShadowPlacement(targetAt(25, 14), { x: 0, y: 0, z: 0, size: 0 });
    const distance = Math.hypot(shadow.x, shadow.z);
    expect(distance).toBeLessThan(ARENA_RADIUS);
    expect(distance).toBeGreaterThan(ARENA_RADIUS - 0.1);
  });

  it('scales with the target', () => {
    const small = contactShadowPlacement(targetAt(0, 10, 0.2), { x: 0, y: 0, z: 0, size: 0 });
    const large = contactShadowPlacement(targetAt(0, 10, 0.8), { x: 0, y: 0, z: 0, size: 0 });
    expect(large.size / small.size).toBeCloseTo(4, 6);
  });

  it('never goes below the floor', () => {
    const shadow = contactShadowPlacement(targetAt(0, -5.8, 0.6), { x: 0, y: 0, z: 0, size: 0 });
    expect(shadow.y).toBeGreaterThan(0);
  });
});
