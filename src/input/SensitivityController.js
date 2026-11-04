import { DEG_TO_RAD } from '../utils/math.js';

/**
 * Degrees of rotation per mouse count at sensitivity 1.0. This is the 0.022° yaw used by
 * many competitive shooters, so a familiar number here gives a familiar turn rate.
 */
export const DEGREES_PER_COUNT_AT_ONE = 0.022;
const CM_PER_INCH = 2.54;

/**
 * Sensitivity is angular rotation per mouse count. It is a displacement ratio with no time
 * in it: mouse deltas are already distances, so multiplying by frame time would make aim
 * depend on frame rate.
 */
export function radiansPerCount(sensitivity) {
  return sensitivity * DEGREES_PER_COUNT_AT_ONE * DEG_TO_RAD;
}

export function degreesPerCount(sensitivity) {
  return sensitivity * DEGREES_PER_COUNT_AT_ONE;
}

/**
 * Mouse travel for a full turn: (360 / degrees per count) counts, divided by counts per
 * inch, converted to centimetres. An estimate, because browsers may see OS-processed input.
 */
export function cmPer360(sensitivity, dpi) {
  if (sensitivity <= 0 || dpi <= 0) return Infinity;
  return (360 / degreesPerCount(sensitivity) / dpi) * CM_PER_INCH;
}

/** Inverse of cmPer360, used when a player enters the distance they already know. */
export function sensitivityFromCmPer360(cm, dpi) {
  return (360 * CM_PER_INCH) / (cm * dpi * DEGREES_PER_COUNT_AT_ONE);
}

/** Maps a slider position in [0, 1] to sensitivity on a log scale, so low values stay fine. */
export function sliderToSensitivity(position, min, max) {
  return min * Math.pow(max / min, position);
}

export function sensitivityToSlider(value, min, max) {
  return Math.log(value / min) / Math.log(max / min);
}
