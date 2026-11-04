import { useCallback, useRef } from 'react';
import { GameState } from '../core/GameStateMachine.js';
import { useEntrance, useEscape, useGame } from './hooks.js';

const SECTIONS = [
  {
    title: 'What it measures',
    body: 'Every target sits the same distance from you, so its size is a true angle: a 3° target is 3° wherever it appears. Scores from different sessions stay comparable, because no target gets easier by being closer.',
  },
  {
    title: 'How your aim is handled',
    body: 'Mouse movement goes straight to the camera, with no smoothing, no acceleration added by the game, and no scaling by frame rate. A shot is resolved inside the click itself, with no bullet spread and no travel time. Recoil moves only the pistol model.',
  },
  {
    title: "What a browser can't do",
    body: "Browsers pace rendering to your display, so frame rates can't exceed its refresh rate. Raw input isn't available everywhere, and OS settings can then affect movement. Browser input also isn't identical to a native game's, and reaction times include your hardware's latency. These figures are useful for tracking your own progress, not as lab measurements.",
  },
  {
    title: 'Your data',
    body: 'Settings and statistics are stored only in this browser. There are no accounts and nothing is uploaded. The pistol, the room and every sound are generated in code as the game loads.',
  },
];

export function AboutScreen() {
  const game = useGame();
  const root = useRef(null);
  const goBack = useCallback(() => game.goTo(GameState.MAIN_MENU), [game]);
  useEntrance(root);
  useEscape(goBack);

  return (
    <main ref={root} className="scroll-area fixed inset-0 overflow-y-auto" style={{ background: 'var(--veil)' }}>
      <div className="max-w-2xl p-8 lg:p-12">
        <button type="button" data-fade className="quiet-button py-0 text-sm" onClick={goBack}>
          Back to menu
        </button>
        <div className="reveal-mask mt-6">
          <h1 data-reveal className="type-display text-5xl lg:text-6xl">About Vernier</h1>
        </div>
        <p data-fade className="mt-6 text-xl leading-snug">
          A vernier is the small sliding scale on a precision instrument that lets you read a measurement
          finer than its main marks. This is a trainer built on the same idea: small, exact, and measured.
        </p>
        <div className="mt-10 flex flex-col gap-7">
          {SECTIONS.map((section) => (
            <section key={section.title} data-fade>
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="mt-1 max-w-prose text-[15px] text-ink-soft">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
