/** Pure statistics helpers. Every number the game shows comes through these. */

export function accuracy(hits, shots) {
  return shots > 0 ? hits / shots : 0;
}

export function hitsPerSecond(hits, durationMs) {
  return durationMs > 0 ? hits / (durationMs / 1000) : 0;
}

export function mean(values) {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Population standard deviation: the spread of the trials that actually happened. */
export function standardDeviation(values) {
  if (values.length === 0) return 0;
  const average = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - average) ** 2;
  return Math.sqrt(sum / values.length);
}

/**
 * Summarises reaction trials. Consistency is the coefficient of variation mapped to 0–1,
 * where 1 means every trial took identical time.
 */
export function reactionSummary(times) {
  if (times.length === 0) {
    return { average: 0, fastest: 0, slowest: 0, median: 0, deviation: 0, consistency: 0 };
  }
  const average = mean(times);
  const deviation = standardDeviation(times);
  return {
    average,
    fastest: Math.min(...times),
    slowest: Math.max(...times),
    median: median(times),
    deviation,
    consistency: average > 0 ? Math.max(0, 1 - deviation / average) : 0,
  };
}

/**
 * Combines per-second counts so a long session still fits a chart, as the average hits per
 * second across each span. Returns the span length in seconds and the resulting values.
 */
export function binTimeline(timeline, maximumBars = 120) {
  const span = Math.max(1, Math.ceil(timeline.length / maximumBars));
  const bars = [];
  for (let i = 0; i < timeline.length; i += span) {
    const slice = timeline.slice(i, i + span);
    bars.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  }
  return { span, bars };
}

/** Points for a hit: a flat 100 plus a small streak bonus capped at +50. */
export function hitPoints(streak) {
  return 100 + Math.min(50, Math.max(0, streak - 1) * 2);
}

export const MISS_PENALTY = 50;
