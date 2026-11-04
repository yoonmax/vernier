import { GameMode } from './GameMode.js';

/** Target diameter in degrees for each difficulty. Contrast stays high: size is the test. */
export const MICRO_DIAMETERS = Object.freeze({ easy: 1.2, normal: 0.85, hard: 0.55 });

/** Very small targets in a tight forward region. Timed, or endless when duration is 0. */
export class MicroMode extends GameMode {
  constructor({ duration, difficulty }, context) {
    super(
      {
        targetCount: 1,
        durationMs: duration > 0 ? duration * 1000 : undefined,
        targetDiameter: MICRO_DIAMETERS[difficulty],
        region: { yawRange: 12, pitchRange: 7, avoidRepeat: 3 },
      },
      context,
    );
  }
}
