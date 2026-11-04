import { createStore } from 'zustand/vanilla';
import {
  GRAPHICS_PRESETS,
  SCHEMA,
  defaultSettings,
  defaultsFor,
  sanitizeValue,
} from './SettingsSchema.js';
import { browserStorage, loadSettings, saveSettings } from './SettingsStorage.js';

const PRESET_KEYS = new Set(Object.keys(GRAPHICS_PRESETS.high));
const SAVE_DELAY_MS = 150;

/**
 * Creates the settings store. The game subscribes to it directly and React reads through a
 * hook, so a change applies at once without routing gameplay through a component.
 */
export function createSettingsStore(storage = browserStorage()) {
  let saveTimer = null;

  const persist = (settings) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSettings(storage, settings), SAVE_DELAY_MS);
  };

  const store = createStore((set, get) => ({
    settings: loadSettings(storage),

    /** Sets one value, after validation. */
    update(category, key, value) {
      const spec = SCHEMA[category]?.[key];
      if (!spec) return;
      const current = get().settings;
      const group = { ...current[category], [key]: sanitizeValue(spec, value) };
      // Hand-tuning a value the preset controls means the preset no longer describes it.
      if (category === 'graphics' && PRESET_KEYS.has(key)) group.preset = 'custom';
      const settings = { ...current, [category]: group };
      set({ settings });
      persist(settings);
    },

    applyGraphicsPreset(preset) {
      const values = GRAPHICS_PRESETS[preset];
      if (!values) return;
      const current = get().settings;
      const settings = {
        ...current,
        graphics: { ...current.graphics, ...values, preset },
      };
      set({ settings });
      persist(settings);
    },

    /**
     * Changes theme. A black crosshair vanishes on the dark theme's walls, but plain white would
     * vanish on its white targets, so a crosshair still at the default colour turns white with a
     * thin black outline, which shows against both.
     */
    setTheme(theme) {
      const current = get().settings;
      const crosshair = { ...current.crosshair };
      if (theme === 'dark-studio' && crosshair.color === '#000000') {
        crosshair.color = '#ffffff';
        crosshair.outline = true;
        crosshair.outlineColor = '#000000';
      } else if (theme !== 'dark-studio' && crosshair.color === '#ffffff') {
        crosshair.color = '#000000';
        crosshair.outline = false;
        crosshair.outlineColor = '#ffffff';
      }
      const settings = {
        ...current,
        crosshair,
        graphics: { ...current.graphics, theme },
      };
      set({ settings });
      persist(settings);
    },

    resetCategory(category) {
      const current = get().settings;
      const settings = { ...current, [category]: defaultsFor(category) };
      set({ settings });
      persist(settings);
    },

    resetAll() {
      const settings = defaultSettings();
      set({ settings });
      persist(settings);
    },

    flush() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      saveSettings(storage, get().settings);
    },
  }));

  return store;
}

export const settingsStore = createSettingsStore();
