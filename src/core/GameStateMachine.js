export const GameState = Object.freeze({
  MAIN_MENU: 'MAIN_MENU',
  MODE_SELECTION: 'MODE_SELECTION',
  READY: 'READY',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESULTS: 'RESULTS',
  SETTINGS: 'SETTINGS',
  STATISTICS: 'STATISTICS',
  ABOUT: 'ABOUT',
});

const S = GameState;

const TRANSITIONS = Object.freeze({
  [S.MAIN_MENU]: [S.MODE_SELECTION, S.READY, S.SETTINGS, S.STATISTICS, S.ABOUT],
  [S.MODE_SELECTION]: [S.MAIN_MENU, S.READY, S.SETTINGS],
  [S.READY]: [S.COUNTDOWN, S.PLAYING, S.MODE_SELECTION, S.MAIN_MENU, S.SETTINGS],
  [S.COUNTDOWN]: [S.PLAYING, S.PAUSED, S.READY],
  [S.PLAYING]: [S.PAUSED, S.RESULTS, S.READY],
  [S.PAUSED]: [S.COUNTDOWN, S.PLAYING, S.READY, S.RESULTS, S.SETTINGS, S.MAIN_MENU, S.MODE_SELECTION],
  [S.RESULTS]: [S.READY, S.MODE_SELECTION, S.MAIN_MENU, S.STATISTICS],
  [S.SETTINGS]: [S.MAIN_MENU, S.MODE_SELECTION, S.READY, S.PAUSED],
  [S.STATISTICS]: [S.MAIN_MENU, S.RESULTS],
  [S.ABOUT]: [S.MAIN_MENU],
});

/** Holds the current state and rejects any transition not listed above. */
export class GameStateMachine {
  constructor(initial = S.MAIN_MENU) {
    this.state = initial;
    this.previous = null;
    this.listeners = new Set();
  }

  can(next) {
    return TRANSITIONS[this.state]?.includes(next) ?? false;
  }

  /** @returns {boolean} whether the transition happened */
  transition(next) {
    if (!this.can(next)) return false;
    this.previous = this.state;
    this.state = next;
    for (const listener of this.listeners) listener(next, this.previous);
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
