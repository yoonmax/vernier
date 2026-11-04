import { EYE, FLOOR_CLEARANCE, TARGET_SHELL_RADIUS } from '../core/constants.js';
import { DEG_TO_RAD, directionFromAngles } from '../utils/math.js';

/** World radius of a disc on the target shell that subtends `diameterDegrees` at the eye. */
export function worldRadiusFromDiameter(diameterDegrees) {
  return TARGET_SHELL_RADIUS * Math.tan((diameterDegrees * DEG_TO_RAD) / 2);
}

/**
 * The lowest pitch at which a disc of this world radius stays fully above the floor. Solves
 * EYE.y + R·sin(pitch) - radius = clearance. Large targets and wide spawn areas could
 * otherwise push a disc through the floor, leaving it partly hidden but still scored.
 */
export function lowestPitchForRadius(radius) {
  return Math.asin((FLOOR_CLEARANCE + radius - EYE.y) / TARGET_SHELL_RADIUS);
}

const scratchDirection = { x: 0, y: 0, z: 0 };

/**
 * A disc on the target shell, always facing the eye. The eye never moves and the disc's
 * widest edge lies in the plane through its centre, so the visible silhouette and the hit
 * test are the same circle.
 */
export class Target {
  constructor() {
    this.id = 0;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.nx = 0;
    this.ny = 0;
    this.nz = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.4;
    this.spawnTime = 0;
    this.motion = null;
    this.cell = -1;
  }

  setAngles(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    directionFromAngles(yaw, pitch, scratchDirection);
    this.x = EYE.x + scratchDirection.x * TARGET_SHELL_RADIUS;
    this.y = EYE.y + scratchDirection.y * TARGET_SHELL_RADIUS;
    this.z = EYE.z + scratchDirection.z * TARGET_SHELL_RADIUS;
    this.nx = -scratchDirection.x;
    this.ny = -scratchDirection.y;
    this.nz = -scratchDirection.z;
  }
}
