import { createStore } from 'zustand/vanilla';
import { MODES, getMode, resolveOptions } from '../modes/modeCatalog.js';
import { browserStorage } from '../settings/SettingsStorage.js';
import { GameState } from '../core/GameStateMachine.js';

const PREFERENCES_KEY = 'vernier.prefs.v1';

/** Loads the preferred mode and each mode's last options, ignoring anything invalid. */
export function loadPreferences(storage) {
  const defaults = { modeId: MODES[0].id, options: {} };
  try {
    const raw = JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    const modeId = MODES.some((mode) => mode.id === raw.modeId) ? raw.modeId : defaults.modeId;
    const options = {};
    for (const mode of MODES) options[mode.id] = resolveOptions(mode, raw.options?.[mode.id]);
    return { modeId, options };
  } catch {
    return defaults;
  }
}

const storage = browserStorage();
const preferences = loadPreferences(storage);

function savePreferences({ modeId, optionsByMode }) {
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify({ modeId, options: optionsByMode }));
  } catch {
    // Preferences are a convenience: losing them must never interrupt the game.
  }
}

/**
 * State the interface renders from. It changes on screen transitions and player choices,
 * never per frame: the HUD and crosshair are updated directly, outside React.
 */
export const appStore = createStore((set, get) => ({
  screen: GameState.MAIN_MENU,
  settingsReturn: GameState.MAIN_MENU,
  ready: false,
  modeId: preferences.modeId,
  optionsByMode: preferences.options,
  countdown: null,
  results: null,
  lockError: null,
  rawInputStatus: 'unknown',
  fullscreen: false,

  selectMode(modeId) {
    set({ modeId });
    savePreferences(get());
  },

  setOption(modeId, key, value) {
    const optionsByMode = {
      ...get().optionsByMode,
      [modeId]: { ...resolveOptions(getMode(modeId), get().optionsByMode[modeId]), [key]: value },
    };
    set({ optionsByMode });
    savePreferences(get());
  },

  currentOptions() {
    const { modeId, optionsByMode } = get();
    return resolveOptions(getMode(modeId), optionsByMode[modeId]);
  },
}));
