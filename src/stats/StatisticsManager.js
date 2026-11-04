const STORAGE_KEY = 'vernier.stats.v1';
const HISTORY_LIMIT = 200;

export function emptyStatistics() {
  return {
    totals: { sessions: 0, timeMs: 0, shots: 0, hits: 0 },
    byMode: {},
    personalBests: {},
    history: [],
  };
}

const isCount = (value) => Number.isFinite(value) && value >= 0;

/** Rebuilds saved statistics field by field, dropping anything malformed. */
export function sanitizeStatistics(raw) {
  const clean = emptyStatistics();
  if (!raw || typeof raw !== 'object') return clean;

  const { totals, byMode, personalBests, history } = raw;
  if (totals && typeof totals === 'object') {
    for (const key of Object.keys(clean.totals)) {
      if (isCount(totals[key])) clean.totals[key] = totals[key];
    }
  }
  if (byMode && typeof byMode === 'object') {
    for (const [id, entry] of Object.entries(byMode)) {
      if (entry && isCount(entry.sessions) && isCount(entry.shots) && isCount(entry.hits) && isCount(entry.timeMs)) {
        clean.byMode[id] = {
          sessions: entry.sessions,
          shots: entry.shots,
          hits: entry.hits,
          timeMs: entry.timeMs,
          accuracySum: isCount(entry.accuracySum) ? entry.accuracySum : 0,
        };
      }
    }
  }
  if (personalBests && typeof personalBests === 'object') {
    for (const [key, entry] of Object.entries(personalBests)) {
      if (entry && Number.isFinite(entry.value)) {
        clean.personalBests[key] = {
          value: entry.value,
          date: isCount(entry.date) ? entry.date : 0,
          modeId: typeof entry.modeId === 'string' ? entry.modeId : key.split('|')[0],
          label: typeof entry.label === 'string' ? entry.label : '',
          format: typeof entry.format === 'string' ? entry.format : 'points',
        };
      }
    }
  }
  if (Array.isArray(history)) {
    clean.history = history
      .filter((entry) => entry && typeof entry.modeId === 'string' && isCount(entry.date) && isCount(entry.hits) && isCount(entry.shots))
      .slice(0, HISTORY_LIMIT);
  }
  return clean;
}

/** Long-term progress, stored only in this browser. Nothing is ever sent anywhere. */
export class StatisticsManager {
  /** @param {Storage|null} storage */
  constructor(storage) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      return text ? sanitizeStatistics(JSON.parse(text)) : emptyStatistics();
    } catch {
      return emptyStatistics();
    }
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Private browsing or a full quota: the session still works, it just isn't remembered.
    }
  }

  /**
   * Adds a finished session. Customised runs count towards training totals but can never
   * set a personal best.
   *
   * @returns {{ isPersonalBest:boolean, previousBest:number|null, metricValue:number|null, eligible:boolean }}
   */
  recordSession({ mode, variant, label, metric, stats, standard, date = Date.now() }) {
    const { totals, byMode, personalBests, history } = this.data;
    totals.sessions += 1;
    totals.timeMs += stats.durationMs;
    totals.shots += stats.shots;
    totals.hits += stats.hits;

    const entry = byMode[mode] ?? { sessions: 0, shots: 0, hits: 0, timeMs: 0, accuracySum: 0 };
    entry.sessions += 1;
    entry.shots += stats.shots;
    entry.hits += stats.hits;
    entry.timeMs += stats.durationMs;
    entry.accuracySum += stats.accuracy;
    byMode[mode] = entry;

    const metricValue = stats[metric.key] ?? null;
    // A score of zero isn't an achievement. Rate metrics also need enough hits to mean anything.
    const eligible =
      standard &&
      metricValue !== null &&
      metricValue > 0 &&
      (metric.minHits === undefined || stats.hits >= metric.minHits);
    const previous = personalBests[variant]?.value ?? null;
    const isPersonalBest =
      eligible &&
      (previous === null ||
        (metric.better === 'lower' ? metricValue < previous : metricValue > previous));
    if (isPersonalBest) {
      personalBests[variant] = { value: metricValue, date, modeId: mode, label, format: metric.format };
    }

    history.unshift({
      modeId: mode,
      variant,
      label,
      date,
      standard,
      hits: stats.hits,
      shots: stats.shots,
      accuracy: stats.accuracy,
      hitsPerSecond: stats.hitsPerSecond,
      durationMs: stats.durationMs,
      metricValue,
      metricFormat: metric.format,
      score: stats.score ?? null,
      completionMs: stats.completionMs ?? null,
      reactionMedian: stats.reaction?.median ?? null,
      reactionFastest: stats.reaction?.fastest ?? null,
    });
    history.length = Math.min(history.length, HISTORY_LIMIT);

    this.save();
    return { isPersonalBest, previousBest: previous, metricValue, eligible };
  }

  getPersonalBest(variant) {
    return this.data.personalBests[variant]?.value ?? null;
  }

  clear() {
    this.data = emptyStatistics();
    this.save();
  }
}
