import { GameMode } from './GameMode.js';

/** Target diameter in degrees of visual angle. */
export const SPEED_DIAMETER = 3.2;

/** Hit a fixed number of targets as fast as possible. The clock stops on the last hit. */
export class SpeedMode extends GameMode {
  constructor({ goal }, context) {
    super(
      {
        targetCount: 1,
        hitGoal: goal,
        targetDiameter: SPEED_DIAMETER,
        region: { yawRange: 24, pitchRange: 11, avoidRepeat: 8 },
      },
      context,
    );
  }

  getExtraStatistics() {
    const goalReached = this.recorder.hits >= this.rules.hitGoal;
    return { completionMs: goalReached ? this.finalElapsed : null };
  }
}
