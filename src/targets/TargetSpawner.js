import { TARGET_SHELL_RADIUS, ZONE_CENTER_PITCH } from '../core/constants.js';
import { DEG_TO_RAD, angularDistance } from '../utils/math.js';
import { lowestPitchForRadius, worldRadiusFromDiameter } from './Target.js';

const CANDIDATE_ATTEMPTS = 32;

/**
 * @typedef {object} SpawnRegion
 * @property {number} yawRange half-width in degrees either side of straight ahead
 * @property {number} pitchRange half-height in degrees either side of the zone centre
 * @property {number} [minSeparation] clear gap between target edges, in degrees
 * @property {number} [avoidRepeat] minimum angle from the previous spawn, in degrees
 * @property {number} [gridColumns] with gridRows, spawns on fixed cells rather than freely
 * @property {number} [gridRows]
 */

/**
 * Chooses valid positions inside a forward-facing region. Every choice comes from the
 * seeded generator, so a seed fully determines a scenario's layout.
 *
 * Positions are angles on the target shell, which guarantees each target is in front of
 * the wall, in front of the player and reachable from the fixed eye position.
 */
export class TargetSpawner {
  /**
   * @param {import('../utils/rng.js').SeededRandom} rng
   * @param {SpawnRegion} region
   * @param {number} areaScale player's spawn-area multiplier
   * @param {number} targetDiameter degrees, so a grid can guarantee its cells never overlap
   */
  constructor(rng, region, areaScale = 1, targetDiameter = 0) {
    this.rng = rng;
    this.yawRange = region.yawRange * areaScale * DEG_TO_RAD;
    const pitchRange = region.pitchRange * areaScale * DEG_TO_RAD;
    this.pitchLow = ZONE_CENTER_PITCH - pitchRange;
    this.pitchHigh = ZONE_CENTER_PITCH + pitchRange;
    this.minSeparation = (region.minSeparation ?? 2) * DEG_TO_RAD;
    this.avoidRepeat = (region.avoidRepeat ?? 6) * DEG_TO_RAD;
    this.gridColumns = region.gridColumns ?? 0;
    this.gridRows = region.gridRows ?? 0;
    if (this.gridColumns > 0) {
      // Large targets or a small spawn area could otherwise overlap: widen the grid to fit.
      const spacing = (targetDiameter + 0.6) * DEG_TO_RAD;
      const span = spacing * (this.gridRows - 1);
      this.pitchLow = Math.min(this.pitchLow, ZONE_CENTER_PITCH - span / 2);
      this.pitchHigh = Math.max(this.pitchHigh, ZONE_CENTER_PITCH + span / 2);
    }
    // Lift the bottom of the region clear of the floor. A grid keeps its full height by growing
    // upwards, so its cells still can't overlap.
    const pitchSpan = this.pitchHigh - this.pitchLow;
    this.pitchLow = Math.max(this.pitchLow, lowestPitchForRadius(worldRadiusFromDiameter(targetDiameter)));
    if (this.gridColumns > 0) {
      this.pitchHigh = Math.max(this.pitchHigh, this.pitchLow + pitchSpan);
      // A degree of yaw covers less visual angle higher up (it shrinks with cos(pitch)),
      // so columns are spaced to fit at the grid's highest row.
      const yawSpacing = ((targetDiameter + 0.6) * DEG_TO_RAD) / Math.cos(this.pitchHigh);
      this.yawRange = Math.max(this.yawRange, (yawSpacing * (this.gridColumns - 1)) / 2);
    }
    this.lastYaw = NaN;
    this.lastPitch = NaN;
    this.vacatedYaw = NaN;
    this.vacatedPitch = NaN;
    this.vacatedRadius = 0;
    this.vacatedCell = -1;
    this.result = { yaw: 0, pitch: ZONE_CENTER_PITCH, cell: -1 };
  }

  /**
   * Records the spot of a target that was just hit. Its replacement must not overlap it: a
   * new disc on the same spot looks as if the shot did nothing, even though it scored.
   *
   * With several targets up, the last spawn isn't the target that was hit, so this can't be
   * inferred from spawn history.
   */
  markVacated(target) {
    this.vacatedYaw = target.yaw;
    this.vacatedPitch = target.pitch;
    this.vacatedRadius = this.angularRadiusOf(target);
    this.vacatedCell = target.cell;
  }

  /** True if a disc at this position would be fully clear of the spot just vacated. */
  isClearOfVacated(yaw, pitch, angularRadius) {
    return this.vacatedClearance(yaw, pitch, angularRadius) >= 0;
  }

  vacatedClearance(yaw, pitch, angularRadius) {
    if (!Number.isFinite(this.vacatedYaw)) return Infinity;
    const required = angularRadius + this.vacatedRadius + this.minSeparation;
    return angularDistance(yaw, pitch, this.vacatedYaw, this.vacatedPitch) - required;
  }

  /**
   * @param {Array<import('./Target.js').Target>} activeTargets
   * @param {number} angularRadius angular radius of the new target, in radians
   */
  next(activeTargets, angularRadius) {
    const result = this.gridColumns > 0
      ? this.nextGridCell(activeTargets)
      : this.nextFree(activeTargets, angularRadius);
    this.lastYaw = result.yaw;
    this.lastPitch = result.pitch;
    return result;
  }

  nextFree(activeTargets, angularRadius) {
    let bestYaw = 0;
    let bestPitch = ZONE_CENTER_PITCH;
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < CANDIDATE_ATTEMPTS; attempt += 1) {
      const yaw = this.rng.range(-this.yawRange, this.yawRange);
      const pitch = this.rng.range(this.pitchLow, this.pitchHigh);
      const clearance = this.clearance(yaw, pitch, activeTargets, angularRadius);
      if (clearance >= 0) {
        this.result.yaw = yaw;
        this.result.pitch = pitch;
        this.result.cell = -1;
        return this.result;
      }
      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestYaw = yaw;
        bestPitch = pitch;
      }
    }

    // A crowded region can run out of perfect spots. Use the least-bad one rather than stall.
    this.result.yaw = bestYaw;
    this.result.pitch = bestPitch;
    this.result.cell = -1;
    return this.result;
  }

  /** Positive when a candidate satisfies every spacing rule, negative by how far it fails. */
  clearance(yaw, pitch, activeTargets, angularRadius) {
    let clearance = Infinity;
    for (const target of activeTargets) {
      const required = angularRadius + this.angularRadiusOf(target) + this.minSeparation;
      const gap = angularDistance(yaw, pitch, target.yaw, target.pitch) - required;
      if (gap < clearance) clearance = gap;
    }
    if (Number.isFinite(this.lastYaw)) {
      const gap = angularDistance(yaw, pitch, this.lastYaw, this.lastPitch) - this.avoidRepeat;
      if (gap < clearance) clearance = gap;
    }
    return Math.min(clearance, this.vacatedClearance(yaw, pitch, angularRadius));
  }

  angularRadiusOf(target) {
    return Math.atan(target.radius / TARGET_SHELL_RADIUS);
  }

  /** Cell layout: pick any unoccupied cell other than the one just hit. */
  nextGridCell(activeTargets) {
    const cellCount = this.gridColumns * this.gridRows;
    const start = this.rng.int(0, cellCount - 1);
    let chosen = start;
    for (let offset = 0; offset < cellCount; offset += 1) {
      const cell = (start + offset) % cellCount;
      if (cell === this.vacatedCell) continue;
      if (activeTargets.some((target) => target.cell === cell)) continue;
      chosen = cell;
      break;
    }
    const column = chosen % this.gridColumns;
    const row = Math.floor(chosen / this.gridColumns);
    const columnSpan = this.gridColumns > 1 ? column / (this.gridColumns - 1) : 0.5;
    const rowSpan = this.gridRows > 1 ? row / (this.gridRows - 1) : 0.5;
    this.result.yaw = -this.yawRange + columnSpan * this.yawRange * 2;
    this.result.pitch = this.pitchLow + rowSpan * (this.pitchHigh - this.pitchLow);
    this.result.cell = chosen;
    return this.result;
  }
}
