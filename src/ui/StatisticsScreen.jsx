import { useCallback, useRef, useState } from 'react';
import { GameState } from '../core/GameStateMachine.js';
import { MODES, getMode } from '../modes/modeCatalog.js';
import { accuracy } from '../stats/metrics.js';
import { AccuracyTrend } from './charts.jsx';
import { ConfirmButton } from './controls.jsx';
import { formatDuration, formatInteger, formatMetric, formatPercent } from './format.js';
import { useEntrance, useEscape, useGame } from './hooks.js';

function Figure({ label, value }) {
  return (
    <div>
      <div className="text-sm text-ink-soft">{label}</div>
      <div className="type-readout mt-0.5 text-4xl">{value}</div>
    </div>
  );
}

/** Personal-best lookup keeps a mode's bests together, whichever variants were played. */
function bestsFor(personalBests, modeId) {
  return Object.values(personalBests).filter((entry) => entry.modeId === modeId);
}

export function StatisticsScreen() {
  const game = useGame();
  const root = useRef(null);
  const [, setRevision] = useState(0);
  useEntrance(root);

  const { totals, byMode, personalBests, history } = game.statistics.data;
  const empty = totals.sessions === 0;
  const [fromResults] = useState(() => game.machine.previous === GameState.RESULTS);
  const goBack = useCallback(
    () => game.goTo(fromResults ? GameState.RESULTS : GameState.MAIN_MENU),
    [game, fromResults],
  );
  useEscape(goBack);

  const trend = history
    .slice(0, 30)
    .reverse()
    .map((entry) => ({ ...entry, modeName: getMode(entry.modeId).name }));

  return (
    <main ref={root} className="scroll-area fixed inset-0 overflow-y-auto bg-paper">
      <div className="max-w-6xl p-8 lg:p-12">
        <button
          type="button"
          data-fade
          data-testid="statistics-back"
          className="quiet-button py-0 text-sm"
          onClick={goBack}
        >
          {fromResults ? 'Back to results' : 'Back to menu'}
        </button>
        <div className="reveal-mask mt-6">
          <h1 data-reveal className="type-display text-5xl lg:text-6xl">Statistics</h1>
        </div>

        {empty ? (
          <div data-fade className="mt-10 max-w-md">
            <p className="text-lg">Finish a session and your numbers appear here.</p>
            <p className="mt-2 text-sm text-ink-soft">
              Everything comes from your own sessions and stays in this browser. Nothing is uploaded.
            </p>
            <button type="button" className="primary-button mt-6" onClick={() => game.goTo(GameState.MAIN_MENU)}>
              Back to menu
            </button>
          </div>
        ) : (
          <>
            <div data-fade className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-5" data-testid="statistics-totals">
              <Figure label="Sessions" value={formatInteger(totals.sessions)} />
              <Figure label="Training time" value={formatDuration(totals.timeMs)} />
              <Figure label="Shots" value={formatInteger(totals.shots)} />
              <Figure label="Hits" value={formatInteger(totals.hits)} />
              <Figure label="Overall accuracy" value={formatPercent(accuracy(totals.hits, totals.shots))} />
            </div>

            <div data-fade className="mt-10 max-w-4xl">
              <AccuracyTrend sessions={trend} />
            </div>

            <section data-fade className="mt-12">
              <h2 className="type-display text-2xl">By mode</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-ink text-sm text-ink-soft">
                      <th scope="col" className="py-2 pr-6 font-normal">Mode</th>
                      <th scope="col" className="py-2 pr-6 text-right font-normal">Sessions</th>
                      <th scope="col" className="py-2 pr-6 text-right font-normal">Average accuracy</th>
                      <th scope="col" className="py-2 pr-6 text-right font-normal">Hits per second</th>
                      <th scope="col" className="py-2 font-normal">Personal bests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODES.filter((mode) => byMode[mode.id]).map((mode) => {
                      const entry = byMode[mode.id];
                      const bests = bestsFor(personalBests, mode.id);
                      return (
                        <tr key={mode.id} className="border-b border-rule align-top">
                          <th scope="row" className="py-2.5 pr-6 font-medium">{mode.name}</th>
                          <td className="type-readout py-2.5 pr-6 text-right text-base">{entry.sessions}</td>
                          <td className="type-readout py-2.5 pr-6 text-right text-base">
                            {formatPercent(entry.accuracySum / entry.sessions)}
                          </td>
                          <td className="type-readout py-2.5 pr-6 text-right text-base">
                            {(entry.hits / Math.max(1, entry.timeMs / 1000)).toFixed(2)}
                          </td>
                          <td className="py-2.5 text-sm">
                            {bests.length === 0 && <span className="text-ink-soft">None yet</span>}
                            {bests.map((best) => (
                              <div key={`${best.modeId}${best.label}`}>
                                <span className="type-readout text-base">{formatMetric(best.value, best.format)}</span>
                                {best.label && <span className="text-ink-soft"> {best.label}</span>}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section data-fade className="mt-12">
              <h2 className="type-display text-2xl">Recent sessions</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[15px]" data-testid="history-table">
                  <thead>
                    <tr className="border-b border-ink text-sm text-ink-soft">
                      <th scope="col" className="py-2 pr-6 font-normal">Date</th>
                      <th scope="col" className="py-2 pr-6 font-normal">Mode</th>
                      <th scope="col" className="py-2 pr-6 text-right font-normal">Result</th>
                      <th scope="col" className="py-2 pr-6 text-right font-normal">Accuracy</th>
                      <th scope="col" className="py-2 pr-6 text-right font-normal">Hits</th>
                      <th scope="col" className="py-2 text-right font-normal">Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((entry, index) => {
                      const mode = getMode(entry.modeId);
                      return (
                        <tr key={`${entry.date}${index}`} className="border-b border-rule">
                          <td className="py-2 pr-6 text-sm text-ink-soft">{new Date(entry.date).toLocaleString()}</td>
                          <td className="py-2 pr-6">
                            {mode.name}
                            {entry.label && <span className="text-sm text-ink-soft"> {entry.label}</span>}
                            {!entry.standard && <span className="text-sm text-ink-soft"> (custom)</span>}
                          </td>
                          <td className="type-readout py-2 pr-6 text-right text-base">{formatMetric(entry.metricValue, entry.metricFormat)}</td>
                          <td className="type-readout py-2 pr-6 text-right text-base">{formatPercent(entry.accuracy)}</td>
                          <td className="type-readout py-2 pr-6 text-right text-base">{entry.hits}</td>
                          <td className="type-readout py-2 text-right text-base">{formatDuration(entry.durationMs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div data-fade className="mt-10">
              <ConfirmButton
                label="Clear all statistics"
                confirmLabel="Click again to delete all statistics permanently"
                onConfirm={() => {
                  game.statistics.clear();
                  setRevision((value) => value + 1);
                }}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
