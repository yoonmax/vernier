import { useRef } from 'react';
import { getMode } from '../modes/modeCatalog.js';
import { SessionTimeline } from './charts.jsx';
import { formatDuration, formatInteger, formatMetric, formatPercent, resultRow } from './format.js';
import { useApp, useEntrance, useGame, useUiSound } from './hooks.js';

function Readout({ label, value }) {
  return (
    <div>
      <div className="text-sm text-ink-soft">{label}</div>
      <div className="type-readout mt-0.5 text-3xl">{value}</div>
    </div>
  );
}

export function ResultsScreen() {
  const game = useGame();
  const root = useRef(null);
  const sound = useUiSound();
  const results = useApp((state) => state.results);
  useEntrance(root);

  if (!results) return null;
  const { stats, metric, record, profile, modeName, label, modeId, seed } = results;
  const mode = getMode(modeId);
  const headline = stats[metric.key] ?? null;
  const rows = mode.resultRows.map((key) => resultRow(key, stats)).filter(Boolean);
  const hold = stats.contactMs !== undefined;
  const showsTimeline = modeId !== 'reaction' && !hold && stats.timeline.length > 1;

  let bestLine;
  if (!profile.standard) {
    bestLine = `Custom ${profile.reasons.join(' and ')}, so this run doesn't count towards personal bests.`;
  } else if (record.isPersonalBest) {
    bestLine =
      record.previousBest === null
        ? 'Your first score for this setup.'
        : `Personal best. Previous: ${formatMetric(record.previousBest, metric.format)}.`;
  } else if (record.previousBest !== null) {
    bestLine = `Personal best: ${formatMetric(record.previousBest, metric.format)}.`;
  } else if (!record.eligible) {
    bestLine =
      metric.minHits && stats.hits < metric.minHits
        ? `Land at least ${metric.minHits} hits to set a personal best here.`
        : 'No personal best set.';
  }

  return (
    <main ref={root} className="scroll-area fixed inset-0 overflow-y-auto" style={{ background: 'linear-gradient(to right, var(--paper) 45%, var(--veil))' }}>
      <div className="flex min-h-full max-w-6xl flex-col justify-center p-8 lg:p-12">
        <div data-fade className="type-readout text-xl text-ink-soft">
          {label ? `${modeName}: ${label}` : modeName}
        </div>

        <div className="reveal-mask mt-2">
          <div data-reveal data-testid="results-headline" className="type-display text-8xl lg:text-9xl">
            {formatMetric(headline, metric.format)}
          </div>
        </div>

        <div data-fade className="mt-3 flex flex-wrap items-center gap-x-3 text-base">
          <span className="text-ink-soft">{metric.label}.</span>
          {record.isPersonalBest ? (
            <span className="inline-flex items-center gap-2 font-medium" data-testid="personal-best">
              <span aria-hidden="true" className="inline-block h-4 w-0.5 bg-index" />
              {bestLine}
            </span>
          ) : (
            <span className="text-ink-soft">{bestLine}</span>
          )}
        </div>

        <div data-rule className="mt-8 h-px bg-rule" />

        <div data-fade className="mt-6 grid grid-cols-3 gap-x-8 gap-y-6 lg:grid-cols-6">
          <Readout label="Accuracy" value={formatPercent(stats.accuracy)} />
          {hold ? (
            <>
              <Readout label="Trigger held" value={`${(stats.heldMs / 1000).toFixed(1)} s`} />
              <Readout label="Session length" value={formatDuration(stats.durationMs)} />
            </>
          ) : (
            <>
              <Readout label="Hits" value={formatInteger(stats.hits)} />
              <Readout label="Misses" value={formatInteger(stats.misses)} />
            </>
          )}
          {rows
            .filter(([rowLabel]) => !(hold && (rowLabel === 'Hits per second' || rowLabel === 'Best streak' || rowLabel === 'Session length')))
            .map(([rowLabel, value]) => (
              <Readout key={rowLabel} label={rowLabel} value={value} />
            ))}
        </div>

        {showsTimeline && (
          <div data-fade className="mt-8">
            <SessionTimeline timeline={stats.timeline} title="Hits per second through the session" />
          </div>
        )}

        {modeId === 'reaction' && (
          <p data-fade className="mt-6 max-w-prose text-sm text-ink-soft">
            Browser timings include your display, input device and system latency, so treat these as a
            way to compare your own sessions. They aren't laboratory measurements.
          </p>
        )}

        <div data-fade className="mt-8 flex flex-wrap items-baseline gap-8">
          <button
            type="button"
            autoFocus
            data-testid="results-retry"
            className="primary-button text-lg"
            onClick={() => {
              sound.confirm();
              game.retry();
            }}
          >
            Retry
          </button>
          <button type="button" data-testid="results-change-mode" className="quiet-button" onClick={() => game.openModeSelection()}>
            Change mode
          </button>
          <button type="button" className="quiet-button" onClick={() => game.openStatistics()}>
            Statistics
          </button>
          <button type="button" data-testid="results-menu" className="quiet-button" onClick={() => game.openMainMenu()}>
            Main menu
          </button>
          <span className="type-readout ml-auto text-[13px] text-ink-soft">Scenario seed {seed}</span>
        </div>
      </div>
    </main>
  );
}
