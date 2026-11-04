import { clamp } from '../utils/math.js';

const number = (fallback, min, max, step) => ({ type: 'number', default: fallback, min, max, step });
const boolean = (fallback) => ({ type: 'boolean', default: fallback });
const choice = (fallback, values) => ({ type: 'choice', default: fallback, values });
const color = (fallback) => ({ type: 'color', default: fallback });
const text = (fallback, maxLength) => ({ type: 'text', default: fallback, maxLength });

/** Source of truth for every setting: its default, its legal values and how it validates. */
export const SCHEMA = Object.freeze({
  mouse: {
    sensitivity: number(1, 0.02, 20, 0.001),
    verticalMultiplier: number(1, 0.2, 3, 0.01),
    invertY: boolean(false),
    rawInput: boolean(true),
    dpi: number(800, 100, 32000, 50),
  },
  camera: {
    fov: number(103, 60, 120, 1),
    pitchLimit: number(89, 45, 89, 1),
  },
  crosshair: {
    style: choice('cross', ['cross', 'dot', 'cross-dot', 'hidden']),
    color: color('#000000'),
    thickness: number(1, 1, 6, 0.5),
    length: number(5, 1, 24, 1),
    gap: number(2, 0, 16, 1),
    dotSize: number(2, 1, 10, 1),
    opacity: number(1, 0.1, 1, 0.05),
    outline: boolean(false),
    outlineThickness: number(1, 1, 3, 1),
    outlineColor: color('#ffffff'),
    hitFeedback: boolean(false),
  },
  targets: {
    color: color('#f7f8f8'),
    size: number(1, 0.5, 2, 0.05),
    opacity: number(1, 0.4, 1, 0.05),
    borderThickness: number(0.16, 0.04, 0.4, 0.01),
    centerMarker: boolean(false),
    hitEffects: number(1, 0, 1, 0.05),
    spawnArea: number(1, 0.5, 1.5, 0.05),
    seed: text('', 32),
  },
  graphics: {
    theme: choice('white-lab', ['white-lab', 'dark-studio', 'soft-chrome']),
    preset: choice('high', ['performance', 'balanced', 'high', 'ultra', 'custom']),
    renderScale: number(1, 0.5, 1, 0.05),
    antialiasing: boolean(true),
    shadows: choice('medium', ['off', 'low', 'medium', 'high']),
    ambientOcclusion: choice('baked', ['off', 'baked', 'full']),
    reflections: choice('planar', ['off', 'planar']),
    particles: choice('high', ['off', 'low', 'high']),
    postprocessing: boolean(false),
    fpsCap: choice(0, [60, 120, 144, 165, 240, 360, 0]),
  },
  audio: {
    master: number(0.8, 0, 1, 0.01),
    gunshot: number(0.6, 0, 1, 0.01),
    hit: number(0.8, 0, 1, 0.01),
    ui: number(0.5, 0, 1, 0.01),
    ambient: boolean(false),
  },
  weapon: {
    visible: boolean(true),
    recoil: boolean(true),
    animationIntensity: number(1, 0, 1.5, 0.05),
    position: choice('standard', ['standard', 'low', 'compact']),
    idle: boolean(false),
  },
  interface: {
    showFps: boolean(false),
    showFrameTime: boolean(false),
    showTimer: boolean(true),
    showAccuracy: boolean(true),
    showScore: boolean(true),
    minimalHud: boolean(false),
    hitMarker: boolean(true),
    skipCountdown: boolean(false),
  },
});

export const CATEGORIES = Object.freeze(Object.keys(SCHEMA));

/** Graphics values for each preset. "Custom" is what any manual change turns the preset into. */
export const GRAPHICS_PRESETS = Object.freeze({
  performance: {
    renderScale: 0.75,
    antialiasing: false,
    shadows: 'off',
    ambientOcclusion: 'baked',
    reflections: 'off',
    particles: 'low',
    postprocessing: false,
  },
  balanced: {
    renderScale: 1,
    antialiasing: true,
    shadows: 'low',
    ambientOcclusion: 'baked',
    reflections: 'off',
    particles: 'high',
    postprocessing: false,
  },
  high: {
    renderScale: 1,
    antialiasing: true,
    shadows: 'medium',
    ambientOcclusion: 'baked',
    reflections: 'planar',
    particles: 'high',
    postprocessing: false,
  },
  ultra: {
    renderScale: 1,
    antialiasing: true,
    shadows: 'high',
    ambientOcclusion: 'full',
    reflections: 'planar',
    particles: 'high',
    postprocessing: true,
  },
});

export function defaultsFor(category) {
  const defaults = {};
  for (const [key, spec] of Object.entries(SCHEMA[category])) defaults[key] = spec.default;
  return defaults;
}

export function defaultSettings() {
  const settings = {};
  for (const category of CATEGORIES) settings[category] = defaultsFor(category);
  return settings;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Returns a legal value for a setting, falling back to the default if it can't be salvaged. */
export function sanitizeValue(spec, value) {
  switch (spec.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, spec.min, spec.max)
        : spec.default;
    case 'boolean':
      return typeof value === 'boolean' ? value : spec.default;
    case 'choice':
      return spec.values.includes(value) ? value : spec.default;
    case 'color':
      return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : spec.default;
    case 'text':
      return typeof value === 'string' ? value.slice(0, spec.maxLength) : spec.default;
    default:
      return spec.default;
  }
}

/** Builds a complete, valid settings object from any input. Unknown keys are dropped. */
export function sanitizeSettings(raw) {
  const clean = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  for (const category of CATEGORIES) {
    clean[category] = {};
    const group = source[category] && typeof source[category] === 'object' ? source[category] : {};
    for (const [key, spec] of Object.entries(SCHEMA[category])) {
      clean[category][key] = key in group ? sanitizeValue(spec, group[key]) : spec.default;
    }
  }
  return clean;
}

/**
 * Whether current settings still match the standard difficulty. Personal bests stay
 * comparable only if every run faces the same targets, so anything that changes that
 * marks the run as customised.
 */
export function runProfile(settings) {
  const reasons = [];
  if (settings.targets.size !== SCHEMA.targets.size.default) reasons.push('target size');
  if (settings.targets.spawnArea !== SCHEMA.targets.spawnArea.default) reasons.push('spawn area');
  if (settings.targets.opacity !== SCHEMA.targets.opacity.default) reasons.push('target opacity');
  return { standard: reasons.length === 0, reasons };
}
