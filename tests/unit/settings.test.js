import { describe, expect, it, vi } from 'vitest';
import { GRAPHICS_PRESETS, SCHEMA, defaultSettings, runProfile, sanitizeSettings, sanitizeValue } from '../../src/settings/SettingsSchema.js';
import { loadSettings, saveSettings } from '../../src/settings/SettingsStorage.js';
import { createSettingsStore } from '../../src/settings/settingsStore.js';
import { memoryStorage } from './helpers.js';

const KEY = 'vernier.settings.v1';

describe('settings validation', () => {
  it('clamps numbers to range and rejects non-numbers', () => {
    const spec = SCHEMA.camera.fov;
    expect(sanitizeValue(spec, 500)).toBe(120);
    expect(sanitizeValue(spec, 10)).toBe(60);
    expect(sanitizeValue(spec, 90)).toBe(90);
    expect(sanitizeValue(spec, 'wide')).toBe(103);
    expect(sanitizeValue(spec, NaN)).toBe(103);
    expect(sanitizeValue(spec, Infinity)).toBe(103);
  });

  it('accepts only real choices', () => {
    expect(sanitizeValue(SCHEMA.crosshair.style, 'dot')).toBe('dot');
    expect(sanitizeValue(SCHEMA.crosshair.style, 'giant')).toBe('cross');
    expect(sanitizeValue(SCHEMA.graphics.fpsCap, 144)).toBe(144);
    expect(sanitizeValue(SCHEMA.graphics.fpsCap, 77)).toBe(0);
  });

  it('accepts only six-digit hex colours', () => {
    expect(sanitizeValue(SCHEMA.crosshair.color, '#00E5FF')).toBe('#00e5ff');
    expect(sanitizeValue(SCHEMA.crosshair.color, 'red')).toBe('#000000');
    expect(sanitizeValue(SCHEMA.crosshair.color, '#123')).toBe('#000000');
    expect(sanitizeValue(SCHEMA.crosshair.color, 5)).toBe('#000000');
  });

  it('accepts only real booleans', () => {
    expect(sanitizeValue(SCHEMA.mouse.invertY, true)).toBe(true);
    expect(sanitizeValue(SCHEMA.mouse.invertY, 'true')).toBe(false);
  });

  it('limits text length', () => {
    expect(sanitizeValue(SCHEMA.targets.seed, 'x'.repeat(100))).toHaveLength(32);
  });

  it('fills missing values and removes unknown ones', () => {
    const clean = sanitizeSettings({ mouse: { sensitivity: 2, hacked: 'yes' }, bogus: { a: 1 } });
    expect(clean.mouse.sensitivity).toBe(2);
    expect(clean.mouse.dpi).toBe(800);
    expect(clean.mouse.hacked).toBeUndefined();
    expect(clean.bogus).toBeUndefined();
    expect(clean.camera.fov).toBe(103);
  });

  it.each([null, undefined, 5, 'text', [], { mouse: 'nope' }, { mouse: null }])('produces complete defaults from %j', (input) => {
    expect(sanitizeSettings(input)).toEqual(defaultSettings());
  });

  it('has the default experience the game is designed around', () => {
    const settings = defaultSettings();
    expect(settings.crosshair.style).toBe('cross');
    expect(settings.crosshair.color).toBe('#000000');
    expect(settings.graphics.theme).toBe('white-lab');
    expect(settings.camera.fov).toBeGreaterThanOrEqual(100);
    expect(settings.camera.fov).toBeLessThanOrEqual(103);
    expect(settings.graphics.fpsCap).toBe(0);
    expect(settings.mouse.rawInput).toBe(true);
  });

  it('every default is itself valid', () => {
    expect(sanitizeSettings(defaultSettings())).toEqual(defaultSettings());
  });
});

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const settings = defaultSettings();
    settings.mouse.sensitivity = 1.234;
    settings.crosshair.color = '#ff0000';
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('returns defaults when nothing is saved', () => {
    expect(loadSettings(memoryStorage())).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
  });

  it('survives corrupted JSON', () => {
    expect(loadSettings(memoryStorage({ [KEY]: '{{{nope' }))).toEqual(defaultSettings());
  });

  it('repairs out-of-range saved values', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ camera: { fov: 9000 }, mouse: { sensitivity: 'fast' } }) });
    const loaded = loadSettings(storage);
    expect(loaded.camera.fov).toBe(120);
    expect(loaded.mouse.sensitivity).toBe(1);
  });

  it('survives a storage that throws', () => {
    const storage = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    expect(loadSettings(storage)).toEqual(defaultSettings());
    expect(saveSettings(storage, defaultSettings())).toBe(false);
  });
});

describe('settings store', () => {
  it('validates changes, and applies them at once', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().update('camera', 'fov', 90);
    expect(store.getState().settings.camera.fov).toBe(90);
    store.getState().update('camera', 'fov', 9999);
    expect(store.getState().settings.camera.fov).toBe(120);
  });

  it('ignores unknown settings', () => {
    const store = createSettingsStore(memoryStorage());
    const before = store.getState().settings;
    store.getState().update('camera', 'nope', 1);
    store.getState().update('nope', 'fov', 1);
    expect(store.getState().settings).toBe(before);
  });

  it('saves automatically after a change', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.getState().update('mouse', 'sensitivity', 2.5);
    expect(storage.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(JSON.parse(storage.getItem(KEY)).mouse.sensitivity).toBe(2.5);
    vi.useRealTimers();
  });

  it('saves at once when flushed', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.getState().update('mouse', 'dpi', 1600);
    store.getState().flush();
    expect(JSON.parse(storage.getItem(KEY)).mouse.dpi).toBe(1600);
  });

  it('only notifies changed categories with a new object', () => {
    const store = createSettingsStore(memoryStorage());
    const { mouse, camera } = store.getState().settings;
    store.getState().update('camera', 'fov', 90);
    expect(store.getState().settings.mouse).toBe(mouse);
    expect(store.getState().settings.camera).not.toBe(camera);
  });

  it('applies graphics presets as a group', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().applyGraphicsPreset('performance');
    const { graphics } = store.getState().settings;
    expect(graphics.preset).toBe('performance');
    for (const [key, value] of Object.entries(GRAPHICS_PRESETS.performance)) expect(graphics[key]).toBe(value);
  });

  it('marks the preset custom when one of its settings is changed', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().update('graphics', 'shadows', 'off');
    expect(store.getState().settings.graphics.preset).toBe('custom');
  });

  it('keeps the preset when changing something it does not control', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().update('graphics', 'fpsCap', 144);
    expect(store.getState().settings.graphics.preset).toBe('high');
  });

  it('keeps the crosshair visible on both walls and targets when the theme changes', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().setTheme('dark-studio');
    expect(store.getState().settings.crosshair).toMatchObject({ color: '#ffffff', outline: true, outlineColor: '#000000' });
    store.getState().setTheme('white-lab');
    expect(store.getState().settings.crosshair).toMatchObject({ color: '#000000', outline: false });
  });

  it('leaves a chosen crosshair colour alone when the theme changes', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().update('crosshair', 'color', '#00e5ff');
    store.getState().setTheme('dark-studio');
    expect(store.getState().settings.crosshair.color).toBe('#00e5ff');
  });

  it('resets one category or everything', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().update('mouse', 'sensitivity', 5);
    store.getState().update('camera', 'fov', 90);
    store.getState().resetCategory('mouse');
    expect(store.getState().settings.mouse.sensitivity).toBe(1);
    expect(store.getState().settings.camera.fov).toBe(90);
    store.getState().resetAll();
    expect(store.getState().settings).toEqual(defaultSettings());
  });
});

describe('standard and customised runs', () => {
  it('treats the defaults as standard', () => {
    expect(runProfile(defaultSettings())).toEqual({ standard: true, reasons: [] });
  });

  it('marks anything that changes difficulty as customised', () => {
    const settings = defaultSettings();
    settings.targets.size = 1.5;
    settings.targets.spawnArea = 0.5;
    settings.targets.opacity = 0.5;
    const profile = runProfile(settings);
    expect(profile.standard).toBe(false);
    expect(profile.reasons).toEqual(['target size', 'spawn area', 'target opacity']);
  });

  it('does not penalise cosmetic or comfort changes', () => {
    const settings = defaultSettings();
    settings.targets.color = '#ff0000';
    settings.targets.centerMarker = true;
    settings.mouse.sensitivity = 3;
    settings.camera.fov = 90;
    settings.graphics.theme = 'dark-studio';
    expect(runProfile(settings).standard).toBe(true);
  });
});
