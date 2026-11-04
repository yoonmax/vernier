import { useCallback, useRef } from 'react';
import { MODES, getMode, isEndless, variantKey } from '../modes/modeCatalog.js';
import { runProfile } from '../settings/SettingsSchema.js';
import { Segmented } from './controls.jsx';
import { formatMetric } from './format.js';
import { useApp, useEntrance, useEscape, useGame, useModeOptions, useSettings, useUiSound } from './hooks.js';
import { VernierIndex, useVernierIndex } from './VernierIndex.jsx';

export function ModeSelection() {
  const game = useGame();
  const root = useRef(null);
  const list = useRef(null);
  const sound = useUiSound();
  const modeId = useApp((state) => state.modeId);
  const selectMode = useApp((state) => state.selectMode);
  const setOption = useApp((state) => state.setOption);
  const options = useModeOptions();
  const settings = useSettings((state) => state.settings);
  const mode = getMode(modeId);
  const { position, moveTo } = useVernierIndex(list);
  useEntrance(root);
  useEscape(useCallback(() => game.openMainMenu(), [game]));

  const metric = mode.metric(options);
  const best = game.statistics.getPersonalBest(variantKey(mode, options));
  const profile = runProfile(settings);

  return (
    <main ref={root} className="fixed inset-0 grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section
        className="flex flex-col justify-between p-8 lg:p-12"
        style={{ background: 'linear-gradient(to right, var(--paper) 30%, var(--veil))' }}
      >
        <button type="button" data-fade className="quiet-button self-start py-0 text-sm" onClick={() => game.openMainMenu()}>
          Back to menu
        </button>
        <nav aria-label="Training modes" className="relative my-8 pl-10 lg:pl-14" ref={list}>
          <VernierIndex position={position} />
          <ul className="flex flex-col gap-2 lg:gap-3">
            {MODES.map((entry) => (
              <li key={entry.id} className="reveal-mask">
                <button
                  type="button"
                  data-reveal
                  data-testid={`mode-${entry.id}`}
                  aria-current={entry.id === modeId ? 'true' : undefined}
                  className={`menu-item type-display text-4xl lg:text-5xl ${entry.id === modeId ? '' : 'text-ink-faint hover:text-ink'}`}
                  onMouseEnter={sound.hover}
                  onFocus={(event) => moveTo(event.currentTarget)}
                  onClick={(event) => {
                    selectMode(entry.id);
                    moveTo(event.currentTarget);
                  }}
                >
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <span />
      </section>

      <section className="scroll-area flex flex-col justify-center overflow-y-auto border-l border-rule bg-paper p-8 lg:p-12">
        <div key={mode.id} className="max-w-xl">
          <p data-fade className="text-2xl leading-snug">{mode.summary}</p>

          <div data-fade className="mt-10 flex flex-col gap-6">
            {mode.options.map((option) => (
              <div key={option.key}>
                <div className="mb-1.5 text-sm text-ink-soft">{option.label}</div>
                <Segmented
                  label={option.label}
                  size="large"
                  value={options[option.key]}
                  options={option.values}
                  onChange={(value) => setOption(mode.id, option.key, value)}
                />
              </div>
            ))}
          </div>

          <div data-fade className="mt-10 grid grid-cols-2 gap-6 border-t border-rule pt-5">
            <div>
              <div className="text-sm text-ink-soft">Personal best</div>
              <div className="type-readout mt-1 text-4xl">
                {best === null ? 'None yet' : formatMetric(best, metric.format)}
              </div>
              <div className="text-[13px] text-ink-soft">{metric.label}</div>
            </div>
            <div>
              <div className="text-sm text-ink-soft">Target size</div>
              <div className="type-readout mt-1 text-4xl">{`${(mode.targetDiameter(options) * settings.targets.size).toFixed(2)}°`}</div>
              <div className="text-[13px] text-ink-soft">Of your field of view, in degrees</div>
            </div>
          </div>

          {!profile.standard && (
            <p data-fade className="mt-5 max-w-prose text-sm text-ink-soft">
              Custom {profile.reasons.join(' and ')} is on, so this run won't count towards personal bests.
              Reset the Targets settings to return to the standard run.
            </p>
          )}
          {isEndless(mode, options) && (
            <p data-fade className="mt-5 text-sm text-ink-soft">
              No clock. Press Esc and choose End session to see your results.
            </p>
          )}

          <div data-fade className="mt-10 flex items-baseline gap-8">
            <button
              type="button"
              data-testid="start-mode"
              className="primary-button text-lg"
              onClick={() => {
                sound.confirm();
                game.openReady();
              }}
            >
              Start {mode.name}
            </button>
            <button type="button" className="quiet-button" onClick={() => game.openSettings()}>
              Settings
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
