import { ZONE_CENTER_PITCH } from '../core/constants.js';
import { DEG_TO_RAD, TWO_PI } from '../utils/math.js';

/**
 * Motion is a pure function of session time rather than an integrated velocity. Sampling
 * at 60 Hz or 360 Hz gives the same path, so target speed cannot depend on frame rate.
 *
 * Every pattern keeps the target within the region's half-angles.
 */
export const MOTION_PATTERNS = Object.freeze(['horizontal', 'vertical', 'circular', 'random']);

/**
 * @param {string} pattern one of MOTION_PATTERNS
 * @param {import('../utils/rng.js').SeededRandom} rng
 * @param {{ speed:number, yawRange:number, pitchRange:number }} options speed in degrees per second, ranges in degrees
 * @returns {(timeSeconds:number, out:{yaw:number,pitch:number}) => void}
 */
export function createMotion(pattern, rng, { speed, yawRange, pitchRange }) {
  const yawExtent = yawRange * DEG_TO_RAD;
  const pitchExtent = pitchRange * DEG_TO_RAD;
  const speedRad = speed * DEG_TO_RAD;
  const phase = rng.range(0, TWO_PI);

  if (pattern === 'horizontal') {
    // Peak angular speed of A·sin(ωt) is A·ω, so ω = speed / A gives the requested speed.
    const omega = speedRad / yawExtent;
    const row = ZONE_CENTER_PITCH + rng.range(-0.5, 0.5) * pitchExtent;
    return (t, out) => {
      out.yaw = yawExtent * Math.sin(omega * t + phase);
      out.pitch = row;
    };
  }

  if (pattern === 'vertical') {
    const omega = speedRad / pitchExtent;
    const column = rng.range(-0.5, 0.5) * yawExtent;
    return (t, out) => {
      out.yaw = column;
      out.pitch = ZONE_CENTER_PITCH + pitchExtent * Math.sin(omega * t + phase);
    };
  }

  if (pattern === 'circular') {
    const radius = Math.min(yawExtent, pitchExtent) * rng.range(0.7, 1);
    const omega = (speedRad / radius) * (rng.next() < 0.5 ? -1 : 1);
    const centreYaw = rng.range(-1, 1) * Math.max(0, yawExtent - radius);
    return (t, out) => {
      out.yaw = centreYaw + radius * Math.cos(omega * t + phase);
      out.pitch = ZONE_CENTER_PITCH + radius * Math.sin(omega * t + phase);
    };
  }

  // Smooth random: three sines per axis at unrelated frequencies. The path never visibly
  // repeats, stays continuous, and the amplitudes sum to 1 so it cannot leave the region.
  const yawTerms = randomTerms(rng);
  const pitchTerms = randomTerms(rng);
  const yawScale = speedRad / yawExtent / termSpeed(yawTerms);
  const pitchScale = speedRad / pitchExtent / termSpeed(pitchTerms);
  return (t, out) => {
    out.yaw = yawExtent * sumTerms(yawTerms, t * yawScale);
    out.pitch = ZONE_CENTER_PITCH + pitchExtent * sumTerms(pitchTerms, t * pitchScale);
  };
}

function randomTerms(rng) {
  const weights = [rng.range(0.4, 0.6), rng.range(0.2, 0.35), rng.range(0.1, 0.2)];
  const total = weights[0] + weights[1] + weights[2];
  return [1, 1.73, 2.91].map((frequency, index) => ({
    amplitude: weights[index] / total,
    frequency: frequency * rng.range(0.9, 1.1),
    phase: rng.range(0, TWO_PI),
  }));
}

function termSpeed(terms) {
  return terms.reduce((sum, term) => sum + term.amplitude * term.frequency, 0);
}

function sumTerms(terms, t) {
  return (
    terms[0].amplitude * Math.sin(terms[0].frequency * t + terms[0].phase) +
    terms[1].amplitude * Math.sin(terms[1].frequency * t + terms[1].phase) +
    terms[2].amplitude * Math.sin(terms[2].frequency * t + terms[2].phase)
  );
}
