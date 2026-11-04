import { defaultSettings, sanitizeSettings } from './SettingsSchema.js';

const STORAGE_KEY = 'vernier.settings.v1';

/** Loads settings, returning defaults if storage is missing, blocked or corrupted. */
export function loadSettings(storage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? sanitizeSettings(JSON.parse(text)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** localStorage when the browser allows it, otherwise null. Reading it can throw. */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
