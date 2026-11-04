import { DEG_TO_RAD } from '../utils/math.js';

/** Fixed eye position. The camera rotates around this point and never translates. */
export const EYE = Object.freeze({ x: 0, y: 1.7, z: 0 });

/**
 * Targets live on a sphere centred on the eye, so every target is the same distance away
 * and its size can be stated as a true angle. A 3° target is 3° wherever it spawns.
 */
export const TARGET_SHELL_RADIUS = 16;

/** No target's lower edge comes closer to the floor than this, in metres. */
export const FLOOR_CLEARANCE = 0.25;

export const ARENA_RADIUS = 18;
export const ARENA_HEIGHT = 11;

/** The view direction a session starts from, and the centre of every spawn region. */
export const ZONE_CENTER_PITCH = 10 * DEG_TO_RAD;
