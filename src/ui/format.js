const wholeNumber = new Intl.NumberFormat('en-US');

export const formatPercent = (fraction) => `${(fraction * 100).toFixed(1)}%`;
export const formatInteger = (value) => wholeNumber.format(Math.round(value));
export const formatRate = (value) => value.toFixed(2);
export const formatMs = (value) => `${Math.round(value)} ms`;
export const formatSeconds = (ms) => `${(ms / 1000).toFixed(2)} s`;

/** m:ss, or h:mm:ss for long totals. */
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  return `${minutes}:${seconds}`;
}

/** Formats a mode's headline metric according to the catalogue's format name. */
export function formatMetric(value, format) {
  if (value === null || value === undefined) return 'None';
  switch (format) {
    case 'points':
      return formatInteger(value);
    case 'rate':
      return formatRate(value);
    case 'time':
      return formatSeconds(value);
    case 'ms':
      return formatMs(value);
    default:
      return String(value);
  }
}

/** Every line that can appear on a results screen. Modes list which ones they use. */
const RESULT_ROWS = {
  hitsPerSecond: (stats) => ['Hits per second', formatRate(stats.hitsPerSecond)],
  bestStreak: (stats) => ['Best streak', formatInteger(stats.bestStreak)],
  duration: (stats) => ['Session length', formatDuration(stats.durationMs)],
  averageHitInterval: (stats) => ['Average time between hits', formatMs(stats.averageHitIntervalMs)],
  completion: (stats) => [
    'Completion time',
    stats.completionMs === null ? 'Not finished' : formatSeconds(stats.completionMs),
  ],
  averageAcquisition: (stats) => ['Average time to target', formatMs(stats.averageAcquisitionMs)],
  averageHitOffset: (stats) => ['Average distance from centre', `${stats.averageHitOffsetDegrees.toFixed(2)}°`],
  averageMissOffset: (stats) => ['Average miss distance', `${stats.averageMissOffsetDegrees.toFixed(2)}°`],
  contact: (stats) =>
    stats.contactMs === undefined ? null : ['Time on target', formatSeconds(stats.contactMs)],
  reactionAverage: (stats) => ['Average', formatMs(stats.reaction.average)],
  reactionMedian: (stats) => ['Median', formatMs(stats.reaction.median)],
  reactionFastest: (stats) => ['Fastest', formatMs(stats.reaction.fastest)],
  reactionSlowest: (stats) => ['Slowest', formatMs(stats.reaction.slowest)],
  reactionConsistency: (stats) => ['Consistency', formatPercent(stats.reaction.consistency)],
  falseStarts: (stats) => ['False starts', formatInteger(stats.falseStarts)],
};

export function resultRow(key, stats) {
  return RESULT_ROWS[key]?.(stats) ?? null;
}
