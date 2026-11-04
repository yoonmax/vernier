import { useRef } from 'react';
import { getMode, variantLabel } from '../modes/modeCatalog.js';
import { useApp, useEntrance, useGame, useModeOptions, useUiSound } from './hooks.js';
import { Wordmark } from './Wordmark.jsx';
import { VernierIndex, useVernierIndex } from './VernierIndex.jsx';

export function MainMenu() {
  const game = useGame();
  const root = useRef(null);
  const list = useRef(null);
  const sound = useUiSound();
  const modeId = useApp((state) => state.modeId);
  const options = useModeOptions();
  const mode = getMode(modeId);
  const { position, moveTo } = useVernierIndex(list);
  useEntrance(root);

  const variant = variantLabel(mode, options);
  const items = [
    {
      id: 'play',
      label: 'Play',
      className: 'text-6xl lg:text-7xl xl:text-8xl',
      detail: variant ? `${mode.name}: ${variant}` : mode.name,
      action: () => game.openReady(),
    },
    { id: 'modes', label: 'Training modes', action: () => game.openModeSelection() },
    { id: 'settings', label: 'Settings', action: () => game.openSettings() },
    { id: 'statistics', label: 'Statistics', action: () => game.openStatistics() },
    { id: 'about', label: 'About', action: () => game.openAbout() },
  ];

  return (
    <main ref={root} className="fixed inset-0 flex flex-col justify-between p-8 lg:p-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[52%]"
        style={{ background: 'linear-gradient(to right, var(--paper) 18%, transparent)' }}
      />
      <div data-fade className="relative">
        <Wordmark size="large" />
      </div>

      <nav aria-label="Main menu" className="relative pl-10 lg:pl-14" ref={list}>
        <VernierIndex position={position} />
        <ul className="flex flex-col gap-3 lg:gap-4">
          {items.map((item) => (
            <li key={item.id} className="reveal-mask">
              <button
                type="button"
                data-reveal
                data-testid={`menu-${item.id}`}
                className={`menu-item type-display ${item.className ?? 'text-3xl lg:text-4xl'}`}
                onMouseEnter={(event) => {
                  moveTo(event.currentTarget);
                  sound.hover();
                }}
                onFocus={(event) => moveTo(event.currentTarget)}
                onClick={() => {
                  sound.confirm();
                  item.action();
                }}
              >
                {item.label}
              </button>
              {item.detail && (
                <span data-fade className="type-readout mt-2 block text-base text-ink-soft">
                  {item.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <p data-fade className="relative max-w-sm text-sm text-ink-soft">
        First-person aim training that runs in your browser.
      </p>
    </main>
  );
}
