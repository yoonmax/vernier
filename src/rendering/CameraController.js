import { DEG_TO_RAD, RAD_TO_DEG, clamp, directionFromAngles, wrapAngle } from '../utils/math.js';
import { radiansPerCount } from '../input/SensitivityController.js';

/** Converts horizontal FOV to the vertical FOV Three.js expects, for a given aspect ratio. */
export function verticalFovDegrees(horizontalDegrees, aspect) {
  const halfHorizontal = (horizontalDegrees * DEG_TO_RAD) / 2;
  return 2 * Math.atan(Math.tan(halfHorizontal) / aspect) * RAD_TO_DEG;
}

/**
 * The authoritative view orientation. Mouse events write to it directly, with no smoothing
 * and no frame-time scaling, and the shooting system reads from it directly, so a click
 * always uses the latest input rather than whatever the last frame drew.
 */
export class CameraController {
  constructor() {
    this.yaw = 0;
    this.pitch = 0;
    this.radiansPerCountX = radiansPerCount(1);
    this.radiansPerCountY = this.radiansPerCountX;
    this.invertY = false;
    this.pitchLimit = 89 * DEG_TO_RAD;
  }

  configure({ sensitivity, verticalMultiplier, invertY, pitchLimitDegrees }) {
    this.radiansPerCountX = radiansPerCount(sensitivity);
    this.radiansPerCountY = this.radiansPerCountX * verticalMultiplier;
    this.invertY = invertY;
    this.pitchLimit = pitchLimitDegrees * DEG_TO_RAD;
    this.pitch = clamp(this.pitch, -this.pitchLimit, this.pitchLimit);
  }

  /** Applies a relative mouse movement. Moving right turns right; moving up looks up. */
  applyMouseDelta(deltaX, deltaY) {
    this.yaw = wrapAngle(this.yaw - deltaX * this.radiansPerCountX);
    const verticalSign = this.invertY ? 1 : -1;
    this.pitch = clamp(
      this.pitch + verticalSign * deltaY * this.radiansPerCountY,
      -this.pitchLimit,
      this.pitchLimit,
    );
  }

  setAngles(yaw, pitch) {
    this.yaw = wrapAngle(yaw);
    this.pitch = clamp(pitch, -this.pitchLimit, this.pitchLimit);
  }

  /** Writes the current view direction into `out` without allocating. */
  getDirection(out) {
    return directionFromAngles(this.yaw, this.pitch, out);
  }

  /** Copies orientation to a Three.js camera. Its rotation order must be YXZ. */
  applyTo(camera) {
    camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
