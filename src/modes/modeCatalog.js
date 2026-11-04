import { GRIDSHOT_DIAMETER, GridshotMode } from './GridshotMode.js';
import { MICRO_DIAMETERS, MicroMode } from './MicroMode.js';
import { PRECISION_DIAMETER, PrecisionMode } from './PrecisionMode.js';
import { REACTION_DIAMETER, ReactionMode } from './ReactionMode.js';
import { SPEED_DIAMETER, SpeedMode } from './SpeedMode.js';
import { TRACKING_DIAMETER, TrackingMode } from './TrackingMode.js';

const seconds = (value) => ({ value, label: `${value} s` });
const score = { key: 'score', label: 'Score', better: 'higher', format: 'points' };
const hps = { key: 'hitsPerSecond', label: 'Hits per second', better: 'higher', format: 'rate', minHits: 20 };

/**
 * The single list of modes. Menus, personal bests and results all read from it, so adding a
 * mode means adding one entry and one small class.
 */
export const MODES = Object.freeze([
  {
    id: 'gridshot',
    name: 'Gridshot',
    summary: 'Three targets on a grid, replaced the moment you hit one. Clear as many as you can.',
    create: (options, context) => new GridshotMode(options, context),
    targetDiameter: () => GRIDSHOT_DIAMETER,
    options: [
      { key: 'duration', label: 'Length', default: 60, values: [15, 30, 60, 120].map(seconds) },
      {
        key: 'targetCount',
        label: 'Targets',
        unit: 'targets',
        default: 3,
        values: [3, 4, 5].map((value) => ({ value, label: String(value) })),
      },
    ],
    metric: () => score,
    resultRows: ['hitsPerSecond', 'bestStreak', 'duration'],
  },
  {
    id: 'precision',
    name: 'Precision',
    summary: 'One target at a time, with no clock. Settle in and end the session when you are ready.',
    create: (options, context) => new PrecisionMode(options, context),
    targetDiameter: () => PRECISION_DIAMETER,
    options: [],
    endless: true,
    metric: () => hps,
    resultRows: ['hitsPerSecond', 'averageHitInterval', 'bestStreak', 'duration'],
  },
  {
    id: 'speed',
    name: 'Speed',
    summary: 'A fixed number of targets, and the clock stops on the last hit. Finish fast.',
    create: (options, context) => new SpeedMode(options, context),
    targetDiameter: () => SPEED_DIAMETER,
    options: [
      {
        key: 'goal',
        label: 'Targets',
        unit: 'targets',
        default: 50,
        values: [25, 50, 100].map((value) => ({ value, label: String(value) })),
      },
    ],
    metric: () => ({ key: 'completionMs', label: 'Time', better: 'lower', format: 'time' }),
    resultRows: ['completion', 'averageAcquisition', 'hitsPerSecond', 'bestStreak'],
  },
  {
    id: 'micro',
    name: 'Micro',
    summary: 'Very small targets in a tight region. Slow down and be exact.',
    create: (options, context) => new MicroMode(options, context),
    targetDiameter: (options) => MICRO_DIAMETERS[options.difficulty],
    options: [
      {
        key: 'duration',
        label: 'Length',
        default: 60,
        values: [...[30, 60].map(seconds), { value: 0, label: 'Endless' }],
      },
      {
        key: 'difficulty',
        label: 'Target size',
        default: 'normal',
        values: [
          { value: 'easy', label: 'Small' },
          { value: 'normal', label: 'Smaller' },
          { value: 'hard', label: 'Smallest' },
        ],
      },
    ],
    isEndless: (options) => options.duration === 0,
    metric: (options) => (options.duration === 0 ? hps : score),
    resultRows: ['hitsPerSecond', 'averageHitOffset', 'averageMissOffset', 'bestStreak'],
  },
  {
    id: 'tracking',
    name: 'Tracking',
    summary: 'Targets that keep moving. Click to hit them, or hold the trigger and stay on them.',
    create: (options, context) => new TrackingMode(options, context),
    targetDiameter: () => TRACKING_DIAMETER,
    options: [
      {
        key: 'input',
        label: 'Input',
        default: 'click',
        values: [
          { value: 'click', label: 'Click' },
          { value: 'hold', label: 'Hold to track' },
        ],
      },
      {
        key: 'pattern',
        label: 'Path',
        default: 'horizontal',
        values: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'circular', label: 'Circular' },
          { value: 'random', label: 'Random' },
        ],
      },
      {
        key: 'speed',
        label: 'Speed',
        default: 'medium',
        values: [
          { value: 'slow', label: 'Slow' },
          { value: 'medium', label: 'Medium' },
          { value: 'fast', label: 'Fast' },
        ],
      },
      {
        key: 'targetCount',
        label: 'Targets',
        unit: 'targets',
        default: 1,
        values: [1, 2, 3].map((value) => ({ value, label: String(value) })),
      },
      { key: 'duration', label: 'Length', default: 30, values: [30, 60].map(seconds) },
    ],
    metric: () => score,
    resultRows: ['hitsPerSecond', 'contact', 'bestStreak', 'duration'],
  },
  {
    id: 'reaction',
    name: 'Reaction',
    summary: 'Wait for the target, then shoot it. Firing early restarts the trial and costs 50 ms.',
    create: (options, context) => new ReactionMode(options, context),
    targetDiameter: () => REACTION_DIAMETER,
    options: [
      {
        key: 'trials',
        label: 'Trials',
        unit: 'trials',
        default: 10,
        values: [5, 10, 20].map((value) => ({ value, label: String(value) })),
      },
    ],
    metric: () => ({ key: 'score', label: 'Adjusted median', better: 'lower', format: 'ms' }),
    resultRows: ['reactionAverage', 'reactionMedian', 'reactionFastest', 'reactionSlowest', 'reactionConsistency', 'falseStarts'],
  },
]);

export function getMode(id) {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

/** Fills in defaults and drops values the mode doesn't offer, so stale saved options can't break a run. */
export function resolveOptions(mode, saved = {}) {
  const resolved = {};
  for (const option of mode.options) {
    const valid = option.values.some((entry) => entry.value === saved[option.key]);
    resolved[option.key] = valid ? saved[option.key] : option.default;
  }
  return resolved;
}

export function isEndless(mode, options) {
  return mode.endless === true || mode.isEndless?.(options) === true;
}

/** Stable key for personal bests. Different variants never compete with one another. */
export function variantKey(mode, options) {
  const parts = mode.options.map((option) => `${option.key}=${options[option.key]}`);
  return [mode.id, ...parts].join('|');
}

/** Human-readable description of the chosen options, for lists and results. */
export function variantLabel(mode, options) {
  return mode.options
    .map((option) => {
      const label = option.values.find((entry) => entry.value === options[option.key])?.label;
      return label && option.unit ? `${label} ${option.unit}` : label;
    })
    .filter(Boolean)
    .join(', ');
}
