/**
 * Exact ray-disc intersection, with no physics engine and no scene-graph traversal.
 *
 * The ray is P(t) = O + tD, and the disc lies in the plane through C with normal N:
 *
 *   t = dot(C - O, N) / dot(D, N)
 *
 * A hit needs t > 0 and |P(t) - C| <= r, compared squared to avoid the square root.
 *
 * @returns {number} distance along the ray, or -1 for a miss
 */
export function intersectDisc(origin, direction, target) {
  const denominator = direction.x * target.nx + direction.y * target.ny + direction.z * target.nz;
  if (Math.abs(denominator) < 1e-9) return -1;

  const toCentreX = target.x - origin.x;
  const toCentreY = target.y - origin.y;
  const toCentreZ = target.z - origin.z;
  const t = (toCentreX * target.nx + toCentreY * target.ny + toCentreZ * target.nz) / denominator;
  if (t <= 0) return -1;

  const offsetX = origin.x + direction.x * t - target.x;
  const offsetY = origin.y + direction.y * t - target.y;
  const offsetZ = origin.z + direction.z * t - target.z;
  const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
  return distanceSquared <= target.radius * target.radius ? t : -1;
}

/** Angle in radians between a ray and the direction from its origin to a target's centre. */
export function angleToTarget(origin, direction, target) {
  const x = target.x - origin.x;
  const y = target.y - origin.y;
  const z = target.z - origin.z;
  const length = Math.sqrt(x * x + y * y + z * z);
  const cosine = (x * direction.x + y * direction.y + z * direction.z) / length;
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

/**
 * Finds the nearest target hit by a ray. `result` is reused between shots to avoid
 * allocating, and `offset` holds the angle to the hit target or to the closest miss.
 */
export function raycastTargets(origin, direction, targets, result) {
  result.target = null;
  result.distance = Infinity;
  result.offset = Infinity;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const distance = intersectDisc(origin, direction, target);
    if (distance > 0 && distance < result.distance) {
      result.distance = distance;
      result.target = target;
    }
  }

  if (result.target) {
    result.offset = angleToTarget(origin, direction, result.target);
  } else {
    for (let i = 0; i < targets.length; i += 1) {
      const angle = angleToTarget(origin, direction, targets[i]);
      if (angle < result.offset) result.offset = angle;
    }
  }
  return result;
}

/**
 * Where a ray meets the circular room: wall, floor or ceiling. Used only for cosmetic
 * impact marks. Writes to `out` and returns whether the surface was found.
 */
export function intersectRoom(origin, direction, radius, height, out) {
  let t = Infinity;
  out.surface = 'wall';

  // Wall: solve |(O + tD).xz| = radius, a quadratic in t. The eye is inside, so take the far root.
  const a = direction.x * direction.x + direction.z * direction.z;
  if (a > 1e-9) {
    const b = 2 * (origin.x * direction.x + origin.z * direction.z);
    const c = origin.x * origin.x + origin.z * origin.z - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) t = (-b + Math.sqrt(discriminant)) / (2 * a);
  }
  if (direction.y < 0) {
    const floor = -origin.y / direction.y;
    if (floor < t) {
      t = floor;
      out.surface = 'floor';
    }
  } else if (direction.y > 0) {
    const ceiling = (height - origin.y) / direction.y;
    if (ceiling < t) {
      t = ceiling;
      out.surface = 'ceiling';
    }
  }
  if (!Number.isFinite(t)) return false;
  out.x = origin.x + direction.x * t;
  out.y = origin.y + direction.y * t;
  out.z = origin.z + direction.z * t;
  return true;
}
