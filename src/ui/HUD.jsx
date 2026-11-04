import { useEffect, useRef } from 'react';
import { drawCrosshair } from './crosshairGeometry.js';
import { formatInteger, formatPercent } from './format.js';
import { useGame } from './hooks.js';

const CROSSHAIR_BOX = 128;

function formatClock({ elapsedMs, remainingMs }) {
  if (remainingMs !== null) {
    // Round up, so the display reaches 0 at the instant the session ends.
    const seconds = Math.ceil(remainingMs / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  const seconds = elapsedMs / 1000;
  if (seconds < 60) return seconds.toFixed(1);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** Writes to a node only when its text changes, so an idle readout costs nothing. */
function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

/**
 * The in-game overlay. It renders once and is then driven imperatively: during play, React
 * does nothing per frame or per shot. The game calls these methods, and each writes straight
 * to the DOM node it owns.
 */
export function HUD() {
  const game = useGame();
  const root = useRef(null);
  const canvas = useRef(null);
  const marker = useRef(null);
  const timer = useRef(null);
  const progress = useRef(null);
  const score = useRef(null);
  const accuracy = useRef(null);
  const notice = useRef(null);
  const fpsLine = useRef(null);
  const frameLine = useRef(null);

  useEffect(() => {
    let crosshairSettings = null;
    let hitMarkerEnabled = true;
    let showFps = false;
    let showFrameTime = false;

    const drawCurrentCrosshair = () => {
      if (!crosshairSettings || !canvas.current) return;
      const dpr = window.devicePixelRatio || 1;
      const size = Math.round(CROSSHAIR_BOX * dpr);
      const node = canvas.current;
      if (node.width !== size) {
        node.width = size;
        node.height = size;
      }
      node.style.width = `${size / dpr}px`;
      node.style.height = `${size / dpr}px`;
      // Snap to whole device pixels, so the canvas is never resampled and blurred.
      const left = Math.floor((Math.round(window.innerWidth * dpr) - size) / 2) / dpr;
      const top = Math.floor((Math.round(window.innerHeight * dpr) - size) / 2) / dpr;
      node.style.transform = `translate(${left}px, ${top}px)`;
      drawCrosshair(node.getContext('2d'), crosshairSettings, dpr, size);
    };
    window.addEventListener('resize', drawCurrentCrosshair);

    const hud = {
      setVisible(visible) {
        if (root.current) root.current.style.display = visible ? 'block' : 'none';
      },
      applyCrosshair(settings) {
        crosshairSettings = settings;
        drawCurrentCrosshair();
      },
      applyInterface(settings) {
        hitMarkerEnabled = settings.hitMarker;
        showFps = settings.showFps;
        showFrameTime = settings.showFrameTime;
        const { minimalHud } = settings;
        const display = (node, visible) => {
          if (node.current) node.current.style.display = visible ? '' : 'none';
        };
        display(timer, settings.showTimer);
        display(score, settings.showScore && !minimalHud);
        display(accuracy, settings.showAccuracy && !minimalHud);
        display(fpsLine, showFps);
        display(frameLine, showFrameTime);
      },
      reset() {
        setText(timer.current, '');
        setText(progress.current, '');
        setText(score.current, '');
        setText(accuracy.current, '');
        setText(notice.current, '');
      },
      update({ clock, score: scoreValue, accuracy: accuracyValue, progress: progressValue }) {
        setText(timer.current, formatClock(clock));
        setText(progress.current, progressValue ? `${progressValue.current}/${progressValue.total}` : '');
        if (scoreValue === null) setText(score.current, '');
        else setText(score.current, typeof scoreValue === 'string' ? scoreValue : formatInteger(scoreValue));
        setText(accuracy.current, accuracyValue === null ? '' : formatPercent(accuracyValue));
      },
      flashHit() {
        const crosshairFeedback = crosshairSettings?.hitFeedback;
        if (hitMarkerEnabled && marker.current) {
          marker.current.animate(
            [
              { opacity: 1, transform: 'scale(0.82)' },
              { opacity: 0, transform: 'scale(1.08)' },
            ],
            { duration: 130, easing: 'cubic-bezier(0.2,0.7,0.2,1)' },
          );
        }
        if (crosshairFeedback && canvas.current) {
          const base = canvas.current.style.transform;
          canvas.current.animate(
            [{ transform: `${base} scale(1.35)` }, { transform: `${base} scale(1)` }],
            { duration: 110, easing: 'ease-out' },
          );
        }
      },
      showNotice(text) {
        if (!notice.current) return;
        setText(notice.current, text);
        notice.current.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], {
          duration: 900,
          fill: 'forwards',
        });
      },
      updatePerformance(stats) {
        if (showFps && fpsLine.current) {
          const low = stats.onePercentLowFps();
          const lowText = low === null ? 'collecting' : low.toFixed(0);
          setText(
            fpsLine.current,
            `${stats.currentFps().toFixed(0)} fps, average ${stats.averageFps().toFixed(0)}, 1% low ${lowText}`,
          );
        }
        if (showFrameTime && frameLine.current) {
          setText(frameLine.current, `${stats.lastFrameMs().toFixed(2)} ms frame time`);
        }
      },
    };

    game.attachHud(hud);
    hud.setVisible(false);
    return () => {
      window.removeEventListener('resize', drawCurrentCrosshair);
      game.attachHud(null);
    };
  }, [game]);

  return (
    <div ref={root} className="hud-root pointer-events-none fixed inset-0 z-10" data-testid="hud" aria-hidden="true">
      <div className="absolute inset-x-0 top-5 flex items-baseline justify-center gap-6">
        <span ref={accuracy} data-testid="hud-accuracy" className="hud-readout type-readout w-20 text-right text-lg" />
        <span ref={timer} data-testid="hud-timer" className="hud-readout type-readout min-w-16 text-center text-3xl" />
        <span ref={score} data-testid="hud-score" className="hud-readout type-readout w-20 text-left text-lg" />
      </div>
      <div ref={progress} data-testid="hud-progress" className="hud-readout type-readout absolute inset-x-0 top-14 text-center text-base" />
      <div ref={notice} className="hud-readout type-display absolute inset-x-0 top-[34vh] text-center text-2xl" />
      <div className="hud-readout type-readout absolute left-4 top-4 text-[13px] leading-tight">
        <div ref={fpsLine} data-testid="hud-fps" />
        <div ref={frameLine} />
      </div>
      <canvas ref={canvas} data-testid="crosshair" className="fixed left-0 top-0" />
      <svg ref={marker} className="hit-marker" viewBox="0 0 26 26" fill="none" stroke="var(--ink)" strokeWidth="1.5">
        <path d="M4 4l5 5M22 4l-5 5M4 22l5-5M22 22l-5-5" />
      </svg>
    </div>
  );
}
