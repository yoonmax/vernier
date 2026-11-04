export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const TWO_PI = Math.PI * 2;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Wraps an angle in radians to the range [-PI, PI). */
export function wrapAngle(radians) {
  const wrapped = (radians + Math.PI) % TWO_PI;
  return (wrapped < 0 ? wrapped + TWO_PI : wrapped) - Math.PI;
}

/**
 * Converts view angles to a unit direction.
 * Yaw 0 and pitch 0 look down -Z. Positive yaw turns left and positive pitch looks up,
 * matching a Three.js camera rotated in YXZ order.
 *
 * @param {number} yaw radians
 * @param {number} pitch radians
 * @param {{x:number,y:number,z:number}} out receives the result, so hot paths never allocate
 */
export function directionFromAngles(yaw, pitch, out) {
  const cosPitch = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cosPitch;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cosPitch;
  return out;
}

/** Great-circle angle in radians between two view directions given as yaw and pitch. */
export function angularDistance(yawA, pitchA, yawB, pitchB) {
  const cosine =
    Math.sin(pitchA) * Math.sin(pitchB) +
    Math.cos(pitchA) * Math.cos(pitchB) * Math.cos(yawA - yawB);
  return Math.acos(clamp(cosine, -1, 1));
}
