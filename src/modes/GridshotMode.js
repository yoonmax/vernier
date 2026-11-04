import { GameMode } from './GameMode.js';

/** Target diameter in degrees of visual angle. */
export const GRIDSHOT_DIAMETER = 4.2;

/** Timed multi-target practice on a fixed grid, always keeping the full set of targets up. */
export class GridshotMode extends GameMode {
  constructor({ duration, targetCount }, context) {
    super(
      {
        targetCount,
        durationMs: duration * 1000,
        targetDiameter: GRIDSHOT_DIAMETER,
        region: { yawRange: 14, pitchRange: 8, gridColumns: 5, gridRows: 4 },
      },
      context,
    );
  }
}
