import { EYE } from '../core/constants.js';
import { RAD_TO_DEG } from '../utils/math.js';
import { raycastTargets } from './RaycastManager.js';

/**
 * Hitscan from the exact eye position along the authoritative view direction. There is no
 * spread, travel time or animation dependency: the result exists before fire() returns.
 */
export class ShootingSystem {
  /**
   * @param {import('../rendering/CameraController.js').CameraController} camera
   * @param {import('../targets/TargetManager.js').TargetManager} targets
   */
  constructor(camera, targets) {
    this.camera = camera;
    this.targets = targets;
    this.direction = { x: 0, y: 0, z: -1 };
    this.raycast = { target: null, distance: Infinity, offset: Infinity };
    /** Reused between shots. Read it synchronously; do not store a reference to it. */
    this.result = { hit: false, target: null, time: 0, offsetDegrees: 0, point: { x: 0, y: 0, z: 0 } };
  }

  /** @param {number} time session time of the shot in milliseconds */
  fire(time) {
    this.camera.getDirection(this.direction);
    raycastTargets(EYE, this.direction, this.targets.active, this.raycast);

    const { result, raycast, direction } = this;
    result.hit = raycast.target !== null;
    result.target = raycast.target;
    result.time = time;
    result.offsetDegrees = Number.isFinite(raycast.offset) ? raycast.offset * RAD_TO_DEG : NaN;
    if (result.hit) {
      result.point.x = EYE.x + direction.x * raycast.distance;
      result.point.y = EYE.y + direction.y * raycast.distance;
      result.point.z = EYE.z + direction.z * raycast.distance;
    }
    return result;
  }

  /** True if the current view is on a target. Used by the hold-to-track variant. */
  isOnTarget() {
    this.camera.getDirection(this.direction);
    raycastTargets(EYE, this.direction, this.targets.active, this.raycast);
    return this.raycast.target !== null;
  }
}
