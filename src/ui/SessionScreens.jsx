import { useCallback, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { getMode, isEndless, variantLabel } from '../modes/modeCatalog.js';
import { useApp, useEntrance, useEscape, useGame, useModeOptions, useUiSound } from './hooks.js';

const LOCK_MESSAGES = {
  cooldown: "The browser wouldn't capture the mouse yet. Click again in a moment.",
  unsupported: "This browser doesn't support Pointer Lock, which first-person aiming requires. Try a current version of Chrome, Edge or Firefox.",
  failed: "The browser didn't allow mouse capture. Click again, and check that this page isn't in a restricted frame.",
};

/** The whole screen is the button, because the next click captures the mouse. */
export function ReadyOverlay() {
  const game = useGame();
  const root = useRef(null);
  const modeId = useApp((state) => state.modeId);
  const options = useModeOptions();
  const lockError = useApp((state) => state.lockError);
  const mode = getMode(modeId);
  const sound = useUiSound();
  const label = variantLabel(mode, options);
  const shutter = useRef(null);
  useEntrance(root);
  useEscape(useCallback(() => game.openModeSelection(), [game]));

  // A quick wash hides the cut from the menu's camera to the player's position.
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(shutter.current, { autoAlpha: 0 });
      return;
    }
    gsap.fromTo(shutter.current, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.5, ease: 'power2.out' });
  }, []);

  return (
    <div ref={root} className="fixed inset-0">
      <div ref={shutter} className="pointer-events-none absolute inset-0 bg-paper" aria-hidden="true" />
      <button
        type="button"
        autoFocus
        data-testid="ready-start"
        aria-label={`Click to start ${mode.name}`}
        className="absolute inset-0 flex cursor-pointer flex-col items-start justify-end px-8 pb-24 text-left focus-visible:outline-none lg:px-12 lg:pb-28"
        onClick={() => {
          sound.confirm();
          game.beginSession();
        }}
      >
        <span className="reveal-mask">
          <span data-reveal className="type-display text-4xl lg:text-5xl">Click to start</span>
        </span>
        <span data-fade className="type-readout mt-3 text-lg text-ink-soft">
          {label ? `${mode.name}: ${label}` : mode.name}
        </span>
        <span data-fade className="mt-1 text-sm text-ink-soft">Press Esc at any time to pause and free your mouse.</span>
        {lockError && (
          <span role="alert" className="mt-4 max-w-md text-sm font-medium text-index">
            {LOCK_MESSAGES[lockError] ?? LOCK_MESSAGES.failed}
          </span>
        )}
      </button>
      <div className="absolute bottom-8 left-8 flex gap-6 lg:bottom-12 lg:left-12">
        <button type="button" data-fade className="quiet-button text-sm" onClick={() => game.openModeSelection()}>
          Change mode
        </button>
        <button type="button" data-fade className="quiet-button text-sm" onClick={() => game.openSettings()}>
          Settings
        </button>
      </div>
    </div>
  );
}

/** 3, 2, 1, GO. Placed above the crosshair and fast enough to never get in the way. */
export function CountdownOverlay() {
  const value = useApp((state) => state.countdown);
  const node = useRef(null);

  useLayoutEffect(() => {
    if (!node.current || !value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(
      node.current,
      { autoAlpha: 1, scale: value === 'GO' ? 0.94 : 1.08 },
      { autoAlpha: value === 'GO' ? 0 : 0.92, scale: 1, duration: value === 'GO' ? 0.26 : 0.42, ease: 'expo.out', overwrite: true },
    );
  }, [value]);

  if (!value) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[24vh] text-center" role="status">
      <span ref={node} data-testid="countdown" className="type-display inline-block text-8xl text-ink">
        {value}
      </span>
    </div>
  );
}

export function PauseMenu() {
  const game = useGame();
  const root = useRef(null);
  const sound = useUiSound();
  const lockError = useApp((state) => state.lockError);
  const fullscreen = useApp((state) => state.fullscreen);
  const mode = game.mode;
  useEntrance(root);

  const stats = mode?.getStatistics();
  const definition = game.modeDefinition;
  const endless = definition ? isEndless(definition, game.modeOptions) : false;
  const canEnd = mode?.started && endless;
  const elapsed = stats ? Math.round(stats.durationMs / 100) / 10 : 0;

  const items = [
    { id: 'resume', label: 'Resume', big: true, action: () => game.resume() },
    { id: 'restart', label: 'Restart', action: () => game.restartFromPause() },
    ...(canEnd ? [{ id: 'end', label: 'End session', action: () => game.endSession() }] : []),
    { id: 'settings', label: 'Settings', action: () => game.openSettings() },
    { id: 'modes', label: 'Change mode', action: () => game.openModeSelection() },
    { id: 'menu', label: 'Main menu', action: () => game.openMainMenu() },
  ];

  return (
    <main ref={root} className="fixed inset-0 flex flex-col justify-center p-8 lg:p-12" style={{ background: 'var(--veil)' }}>
      <h1 className="sr-only">Paused</h1>
      <nav aria-label="Pause menu">
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id} className="reveal-mask">
              <button
                type="button"
                autoFocus={item.big}
                data-reveal
                data-testid={`pause-${item.id}`}
                className={`menu-item type-display ${item.big ? 'text-6xl lg:text-7xl' : 'text-2xl lg:text-3xl'}`}
                onMouseEnter={sound.hover}
                onClick={() => {
                  sound.confirm();
                  item.action();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {lockError && (
        <p role="alert" className="mt-5 max-w-md text-sm font-medium text-index">
          {LOCK_MESSAGES[lockError] ?? LOCK_MESSAGES.failed}
        </p>
      )}
      {stats && mode.started && (
        <p data-fade className="type-readout mt-8 text-base text-ink-soft">
          {definition.name}, paused at {elapsed.toFixed(1)} s. {stats.hits} of {stats.shots} {stats.shots === 1 ? 'shot' : 'shots'} hit.
        </p>
      )}
      <button
        type="button"
        data-fade
        className="quiet-button mt-3 self-start text-sm"
        onClick={() => game.requestFullscreen()}
      >
        {fullscreen ? 'Exit fullscreen' : 'Go fullscreen'}
      </button>
    </main>
  );
}
