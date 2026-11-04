import { GameMode } from './GameMode.js';

/** Target diameter in degrees of visual angle. */
export const PRECISION_DIAMETER = 2.8;

/** Endless single-target practice. Runs until the player ends it. */
export class PrecisionMode extends GameMode {
  constructor(options, context) {
    super(
      {
        targetCount: 1,
        targetDiameter: PRECISION_DIAMETER,
        region: { yawRange: 26, pitchRange: 11, avoidRepeat: 7 },
      },
      context,
    );
  }
}
