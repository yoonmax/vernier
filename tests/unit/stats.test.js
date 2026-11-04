import { describe, expect, it } from 'vitest';
import { GridshotMode } from '../../src/modes/GridshotMode.js';
import { MISS_PENALTY, accuracy, binTimeline, hitPoints, hitsPerSecond, mean, median, reactionSummary, standardDeviation } from '../../src/stats/metrics.js';
import { SessionRecorder } from '../../src/stats/SessionRecorder.js';
import { StatisticsManager, emptyStatistics, sanitizeStatistics } from '../../src/stats/StatisticsManager.js';
import { memoryStorage, modeContext, shootMiss, shootTarget } from './helpers.js';

describe('accuracy calculation', () => {
  it('is hits over shots', () => {
    expect(accuracy(3, 4)).toBe(0.75);
    expect(accuracy(0, 10)).toBe(0);
    expect(accuracy(10, 10)).toBe(1);
  });

  it('is zero, not NaN, with no shots', () => {
    expect(accuracy(0, 0)).toBe(0);
  });

  it('is reported correctly from a real session', () => {
    const env = modeContext();
    const mode = new GridshotMode({ duration: 60, targetCount: 3 }, env.context);
    mode.initialize();
    mode.start();
    shootTarget(env, mode, env.targets.active[0]);
    shootTarget(env, mode, env.targets.active[0]);
    shootTarget(env, mode, env.targets.active[0]);
    shootMiss(env, mode);
    const stats = mode.getStatistics();
    expect(stats.shots).toBe(4);
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.accuracy).toBe(0.75);
    expect(mode.getLiveAccuracy()).toBe(0.75);
  });
});

describe('hits-per-second calculation', () => {
  it('is hits over seconds', () => {
    expect(hitsPerSecond(30, 15000)).toBe(2);
    expect(hitsPerSecond(1, 500)).toBe(2);
  });

  it('is zero, not infinite, with no time', () => {
    expect(hitsPerSecond(5, 0)).toBe(0);
  });

  it('excludes paused time in a real session', () => {
    const env = modeContext();
    const mode = new GridshotMode({ duration: 60, targetCount: 3 }, env.context);
    mode.initialize();
    mode.start();
    env.clock.advance(5000);
    shootTarget(env, mode, env.targets.active[0]);
    mode.pause();
    env.clock.advance(100000);
    mode.resume();
    env.clock.advance(5000);
    shootTarget(env, mode, env.targets.active[0]);
    mode.finish('manual');
    expect(mode.getStatistics().hitsPerSecond).toBeCloseTo(0.2, 6);
  });
});

describe('basic statistics', () => {
  it('computes mean, median and deviation', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('handles empty input', () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(standardDeviation([])).toBe(0);
    expect(reactionSummary([]).average).toBe(0);
  });

  it('does not reorder the caller\'s data', () => {
    const data = [3, 1, 2];
    median(data);
    expect(data).toEqual([3, 1, 2]);
  });

  it('rates identical reaction times as perfectly consistent', () => {
    expect(reactionSummary([250, 250, 250]).consistency).toBe(1);
    expect(reactionSummary([100, 900]).consistency).toBeLessThan(0.5);
  });
});

describe('session recorder', () => {
  it('tracks the longest hit streak, broken by misses', () => {
    const recorder = new SessionRecorder();
    for (let i = 0; i < 4; i += 1) recorder.recordHit(i * 100, 100, 0);
    recorder.recordMiss(1);
    recorder.recordHit(500, 100, 0);
    expect(recorder.bestStreak).toBe(4);
    expect(recorder.streak).toBe(1);
  });

  it('scores streaks, caps the bonus and never goes below zero', () => {
    expect(hitPoints(1)).toBe(100);
    expect(hitPoints(2)).toBe(102);
    expect(hitPoints(1000)).toBe(150);

    const recorder = new SessionRecorder();
    recorder.recordMiss(1);
    expect(recorder.score).toBe(0);
    recorder.recordHit(0, 0, 0);
    recorder.recordHit(0, 0, 0);
    recorder.recordMiss(1);
    expect(recorder.score).toBe(202 - MISS_PENALTY);
  });

  it('computes the average time between hits', () => {
    const recorder = new SessionRecorder();
    recorder.recordHit(1000, 0, 0);
    recorder.recordHit(1500, 0, 0);
    recorder.recordHit(3000, 0, 0);
    expect(recorder.summary(3000).averageHitIntervalMs).toBe(1000);
  });

  it('has no interval with fewer than two hits', () => {
    const recorder = new SessionRecorder();
    recorder.recordHit(1000, 0, 0);
    expect(recorder.summary(3000).averageHitIntervalMs).toBe(0);
  });

  it('bins hits into seconds for the results chart', () => {
    const recorder = new SessionRecorder();
    recorder.recordHit(100, 0, 0);
    recorder.recordHit(900, 0, 0);
    recorder.recordHit(2500, 0, 0);
    expect(recorder.summary(3000).timeline).toEqual([2, 0, 1]);
  });

  it('covers the whole session, including quiet seconds at the end', () => {
    const recorder = new SessionRecorder();
    recorder.recordHit(100, 0, 0);
    expect(recorder.summary(15000).timeline).toHaveLength(15);
    expect(recorder.summary(14200).timeline).toHaveLength(15);
  });

  it('keeps short sessions at one bar per second', () => {
    expect(binTimeline([1, 2, 3])).toEqual({ span: 1, bars: [1, 2, 3] });
    expect(binTimeline(new Array(120).fill(1)).span).toBe(1);
  });

  it('averages long sessions so they still fit a chart', () => {
    const { span, bars } = binTimeline(new Array(1200).fill(2));
    expect(span).toBe(10);
    expect(bars).toHaveLength(120);
    expect(bars.every((value) => value === 2)).toBe(true);
    const uneven = binTimeline([...new Array(120).fill(4), 2]);
    expect(uneven.span).toBe(2);
    expect(uneven.bars.at(-1)).toBe(2);
  });

  it('ignores unmeasurable misses in the average miss distance', () => {
    const recorder = new SessionRecorder();
    recorder.recordMiss(2);
    recorder.recordMiss(NaN);
    recorder.recordMiss(Infinity);
    expect(recorder.summary(1000).averageMissOffsetDegrees).toBe(2);
  });
});

const higher = { key: 'score', better: 'higher', format: 'points' };
const lower = { key: 'completionMs', better: 'lower', format: 'time' };
const stats = (overrides = {}) => ({
  shots: 10,
  hits: 8,
  accuracy: 0.8,
  durationMs: 15000,
  hitsPerSecond: 0.53,
  score: 800,
  completionMs: null,
  ...overrides,
});
const record = (manager, overrides = {}, statOverrides = {}) =>
  manager.recordSession({
    mode: 'gridshot',
    variant: 'gridshot|duration=15',
    label: '15 s',
    metric: higher,
    stats: stats(statOverrides),
    standard: true,
    date: 1000,
    ...overrides,
  });

describe('personal best persistence', () => {
  it('sets a first best, and survives a reload', () => {
    const storage = memoryStorage();
    const first = record(new StatisticsManager(storage));
    expect(first.isPersonalBest).toBe(true);
    expect(first.previousBest).toBeNull();
    const reloaded = new StatisticsManager(storage);
    expect(reloaded.getPersonalBest('gridshot|duration=15')).toBe(800);
  });

  it('only replaces a best with a better score', () => {
    const manager = new StatisticsManager(memoryStorage());
    record(manager);
    expect(record(manager, {}, { score: 700 }).isPersonalBest).toBe(false);
    expect(manager.getPersonalBest('gridshot|duration=15')).toBe(800);
    const better = record(manager, {}, { score: 900 });
    expect(better.isPersonalBest).toBe(true);
    expect(better.previousBest).toBe(800);
  });

  it('treats a lower value as better where the metric says so', () => {
    const manager = new StatisticsManager(memoryStorage());
    const options = { mode: 'speed', variant: 'speed|goal=25', metric: lower };
    record(manager, options, { completionMs: 20000 });
    expect(record(manager, options, { completionMs: 25000 }).isPersonalBest).toBe(false);
    expect(record(manager, options, { completionMs: 18000 }).isPersonalBest).toBe(true);
    expect(manager.getPersonalBest('speed|goal=25')).toBe(18000);
  });

  it('keeps variants separate', () => {
    const manager = new StatisticsManager(memoryStorage());
    record(manager);
    expect(record(manager, { variant: 'gridshot|duration=60' }, { score: 100 }).isPersonalBest).toBe(true);
    expect(manager.getPersonalBest('gridshot|duration=15')).toBe(800);
    expect(manager.getPersonalBest('gridshot|duration=60')).toBe(100);
  });

  it('never lets a customised run set a best, but counts it in totals', () => {
    const manager = new StatisticsManager(memoryStorage());
    const result = record(manager, { standard: false }, { score: 99999 });
    expect(result.isPersonalBest).toBe(false);
    expect(result.eligible).toBe(false);
    expect(manager.getPersonalBest('gridshot|duration=15')).toBeNull();
    expect(manager.data.totals.sessions).toBe(1);
    expect(manager.data.history[0].standard).toBe(false);
  });

  it('requires enough hits where the metric asks for it', () => {
    const manager = new StatisticsManager(memoryStorage());
    const metric = { key: 'hitsPerSecond', better: 'higher', minHits: 20 };
    expect(record(manager, { metric }, { hits: 5, hitsPerSecond: 9 }).isPersonalBest).toBe(false);
    expect(record(manager, { metric }, { hits: 25, hitsPerSecond: 2 }).isPersonalBest).toBe(true);
  });

  it('lets a metric with no hits at all set a best, as hold-to-track scores contact time', () => {
    const manager = new StatisticsManager(memoryStorage());
    expect(record(manager, {}, { hits: 0, shots: 0, score: 1234 }).isPersonalBest).toBe(true);
  });

  it('never treats a score of zero as a best', () => {
    const manager = new StatisticsManager(memoryStorage());
    expect(record(manager, {}, { hits: 0, score: 0 }).isPersonalBest).toBe(false);
    expect(manager.getPersonalBest('gridshot|duration=15')).toBeNull();
  });

  it('remembers how to format a best', () => {
    const storage = memoryStorage();
    record(new StatisticsManager(storage), { metric: lower }, { completionMs: 18000 });
    const reloaded = new StatisticsManager(storage);
    expect(reloaded.data.personalBests['gridshot|duration=15'].format).toBe('time');
    expect(reloaded.data.history[0].metricFormat).toBe('time');
  });

  it('cannot set a best from a missing value', () => {
    const manager = new StatisticsManager(memoryStorage());
    expect(record(manager, { metric: lower }, { completionMs: null }).isPersonalBest).toBe(false);
  });
});

describe('statistics storage', () => {
  it('adds up totals and per-mode figures', () => {
    const manager = new StatisticsManager(memoryStorage());
    record(manager);
    record(manager);
    expect(manager.data.totals).toEqual({ sessions: 2, timeMs: 30000, shots: 20, hits: 16 });
    expect(manager.data.byMode.gridshot.sessions).toBe(2);
    expect(manager.data.byMode.gridshot.accuracySum).toBeCloseTo(1.6, 8);
  });

  it('keeps the newest history first, and limits its length', () => {
    const manager = new StatisticsManager(memoryStorage());
    for (let i = 0; i < 210; i += 1) record(manager, { date: i });
    expect(manager.data.history).toHaveLength(200);
    expect(manager.data.history[0].date).toBe(209);
  });

  it('starts empty, with no invented history', () => {
    expect(new StatisticsManager(memoryStorage()).data).toEqual(emptyStatistics());
  });

  it('survives corrupted storage', () => {
    const storage = memoryStorage({ 'vernier.stats.v1': '{not json' });
    expect(new StatisticsManager(storage).data).toEqual(emptyStatistics());
  });

  it('drops malformed fields while keeping valid ones', () => {
    const clean = sanitizeStatistics({
      totals: { sessions: 3, shots: -1, hits: 'x', timeMs: 100 },
      byMode: { gridshot: { sessions: 1, shots: 2, hits: 1, timeMs: 5 }, bad: { sessions: 'no' } },
      personalBests: { good: { value: 5 }, bad: { value: 'NaN' } },
      history: [{ modeId: 'gridshot', date: 1, hits: 1, shots: 1 }, { nope: true }, null],
    });
    expect(clean.totals).toEqual({ sessions: 3, timeMs: 100, shots: 0, hits: 0 });
    expect(Object.keys(clean.byMode)).toEqual(['gridshot']);
    expect(Object.keys(clean.personalBests)).toEqual(['good']);
    expect(clean.history).toHaveLength(1);
  });

  it('clearing empties storage too', () => {
    const storage = memoryStorage();
    const manager = new StatisticsManager(storage);
    record(manager);
    manager.clear();
    expect(new StatisticsManager(storage).data).toEqual(emptyStatistics());
  });

  it('keeps working if storage throws', () => {
    const storage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('full');
      },
    };
    const manager = new StatisticsManager(storage);
    expect(() => record(manager)).not.toThrow();
    expect(manager.data.totals.sessions).toBe(1);
  });
});
