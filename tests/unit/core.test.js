import { describe, expect, it, vi } from 'vitest';
import * as synth from '../../src/audio/synth.js';
import { FrameStats } from '../../src/core/FrameStats.js';
import { GameLoop } from '../../src/core/GameLoop.js';
import { GameState, GameStateMachine } from '../../src/core/GameStateMachine.js';
import { TimeManager } from '../../src/core/TimeManager.js';
import { kickCurve, slideCurve } from '../../src/rendering/WeaponViewModel.js';
import { THEMES, coloursAreSimilar, targetPalette } from '../../src/rendering/themes.js';
import { crosshairRects } from '../../src/ui/crosshairGeometry.js';
import { clamp, wrapAngle } from '../../src/utils/math.js';
import { SeededRandom } from '../../src/utils/rng.js';
import { defaultSettings } from '../../src/settings/SettingsSchema.js';
import { fakeClock } from './helpers.js';

const S = GameState;

describe('mode state transitions', () => {
  const play = (machine, ...states) => {
    for (const state of states) expect(machine.transition(state), `to ${state}`).toBe(true);
  };

  it('runs a full session', () => {
    const machine = new GameStateMachine();
    play(machine, S.MODE_SELECTION, S.READY, S.COUNTDOWN, S.PLAYING, S.RESULTS, S.READY);
    expect(machine.state).toBe(S.READY);
  });

  it('allows pause and resume from play and from the countdown', () => {
    const machine = new GameStateMachine();
    play(machine, S.READY, S.COUNTDOWN, S.PAUSED, S.COUNTDOWN, S.PLAYING, S.PAUSED, S.PLAYING);
  });

  it('can skip the countdown', () => {
    const machine = new GameStateMachine();
    play(machine, S.READY, S.PLAYING);
  });

  it('can open settings from the menu, the mode screen, ready and pause', () => {
    for (const path of [[], [S.MODE_SELECTION], [S.READY], [S.READY, S.PLAYING, S.PAUSED]]) {
      const machine = new GameStateMachine();
      play(machine, ...path);
      const before = machine.state;
      play(machine, S.SETTINGS, before);
    }
  });

  it('can leave a paused session for the menu, mode selection or results', () => {
    for (const exit of [S.MAIN_MENU, S.MODE_SELECTION, S.RESULTS, S.READY]) {
      const machine = new GameStateMachine();
      play(machine, S.READY, S.PLAYING, S.PAUSED, exit);
    }
  });

  it('rejects illegal transitions and stays put', () => {
    const machine = new GameStateMachine();
    expect(machine.transition(S.PLAYING)).toBe(false);
    expect(machine.transition(S.RESULTS)).toBe(false);
    expect(machine.state).toBe(S.MAIN_MENU);
    play(machine, S.READY, S.COUNTDOWN);
    expect(machine.transition(S.SETTINGS)).toBe(false);
    expect(machine.transition(S.MAIN_MENU)).toBe(false);
  });

  it('notifies listeners, with the previous state, until unsubscribed', () => {
    const machine = new GameStateMachine();
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);
    machine.transition(S.ABOUT);
    expect(listener).toHaveBeenCalledWith(S.ABOUT, S.MAIN_MENU);
    expect(machine.previous).toBe(S.MAIN_MENU);
    unsubscribe();
    machine.transition(S.MAIN_MENU);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never notifies on a rejected transition', () => {
    const machine = new GameStateMachine();
    const listener = vi.fn();
    machine.subscribe(listener);
    machine.transition(S.PLAYING);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('time manager', () => {
  it('counts active time only', () => {
    const clock = fakeClock();
    const time = new TimeManager(clock.now);
    time.start();
    clock.advance(100);
    expect(time.elapsed()).toBe(100);
    time.pause();
    clock.advance(1000);
    expect(time.elapsed()).toBe(100);
    time.resume();
    clock.advance(50);
    expect(time.elapsed()).toBe(150);
  });

  it('handles repeated pause and resume without drifting', () => {
    const clock = fakeClock();
    const time = new TimeManager(clock.now);
    time.start();
    for (let i = 0; i < 100; i += 1) {
      clock.advance(10);
      time.pause();
      time.pause();
      clock.advance(1000);
      time.resume();
      time.resume();
    }
    expect(time.elapsed()).toBe(1000);
  });

  it('places an input timestamp on the session clock, excluding paused time', () => {
    const clock = fakeClock(1000);
    const time = new TimeManager(clock.now);
    time.start();
    clock.advance(500);
    expect(time.elapsedAt(1300)).toBe(300);
    time.pause();
    clock.advance(5000);
    time.resume();
    clock.advance(100);
    expect(time.elapsedAt(clock.time - 40)).toBe(560);
  });

  it('never places an input before this stretch of play, or in the future', () => {
    const clock = fakeClock(1000);
    const time = new TimeManager(clock.now);
    time.start();
    clock.advance(100);
    expect(time.elapsedAt(500)).toBe(0);
    expect(time.elapsedAt(99999)).toBe(100);
  });

  it('restarts from zero, and reset stops it', () => {
    const clock = fakeClock();
    const time = new TimeManager(clock.now);
    time.start();
    clock.advance(500);
    time.start();
    clock.advance(10);
    expect(time.elapsed()).toBe(10);
    time.reset();
    clock.advance(10);
    expect(time.elapsed()).toBe(0);
  });
});

describe('frame statistics', () => {
  it('computes FPS from frame times', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 60; i += 1) stats.add(10);
    expect(stats.currentFps()).toBeCloseTo(100, 6);
    expect(stats.averageFps()).toBeCloseTo(100, 6);
    expect(stats.lastFrameMs()).toBe(10);
  });

  it('averages over total time rather than averaging FPS values', () => {
    const stats = new FrameStats();
    stats.add(10);
    stats.add(30);
    expect(stats.averageFps()).toBe(50);
  });

  it('withholds the 1% low until it has enough samples', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 199; i += 1) stats.add(10);
    expect(stats.onePercentLowFps()).toBeNull();
    stats.add(10);
    expect(stats.onePercentLowFps()).toBeCloseTo(100, 4);
  });

  it('reports the 1% low from the slowest frames', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 990; i += 1) stats.add(5);
    for (let i = 0; i < 10; i += 1) stats.add(50);
    expect(stats.onePercentLowFps()).toBeCloseTo(20, 4);
    expect(stats.averageFps()).toBeGreaterThan(150);
  });

  it('forgets samples older than its window', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 1000; i += 1) stats.add(100);
    for (let i = 0; i < 1000; i += 1) stats.add(10);
    expect(stats.averageFps()).toBeCloseTo(100, 3);
    expect(stats.onePercentLowFps()).toBeCloseTo(100, 3);
  });

  it('reports zero rather than dividing by zero when empty', () => {
    const stats = new FrameStats();
    expect(stats.currentFps()).toBe(0);
    expect(stats.averageFps()).toBe(0);
    expect(stats.lastFrameMs()).toBe(0);
  });
});

describe('game loop', () => {
  function runLoop(cap, frameTimes) {
    const callbacks = [];
    vi.stubGlobal('requestAnimationFrame', (callback) => callbacks.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('performance', { now: () => 0 });
    const frames = [];
    const loop = new GameLoop((delta, now, frameMs) => frames.push({ delta, now, frameMs }));
    loop.setCap(cap);
    loop.start();
    for (const time of frameTimes) callbacks.shift()(time);
    loop.stop();
    vi.unstubAllGlobals();
    return frames;
  }

  const display = (hz, seconds) => Array.from({ length: hz * seconds }, (_, i) => ((i + 1) * 1000) / hz);

  it('runs every display frame when uncapped', () => {
    expect(runLoop(0, display(240, 1))).toHaveLength(240);
  });

  it('adds no limit of its own at a cap above the display rate', () => {
    expect(runLoop(360, display(144, 1))).toHaveLength(144);
  });

  it('holds a cap on average on a faster display', () => {
    const frames = runLoop(60, display(240, 2));
    expect(frames.length).toBeGreaterThanOrEqual(115);
    expect(frames.length).toBeLessThanOrEqual(122);
  });

  it('does not drop frames when the cap equals the display rate', () => {
    expect(runLoop(60, display(60, 1)).length).toBeGreaterThanOrEqual(59);
  });

  it('limits the simulation step after a stall, but reports the real frame time', () => {
    const [frame] = runLoop(0, [5000]);
    expect(frame.delta).toBeCloseTo(0.1, 8);
    expect(frame.frameMs).toBe(5000);
  });
});

describe('crosshair geometry', () => {
  const crosshair = () => defaultSettings().crosshair;

  it('draws a small thin cross by default, within half a pixel of the true centre', () => {
    const { core, outline } = crosshairRects(crosshair(), 1, 128);
    expect(core).toHaveLength(4);
    expect(outline).toHaveLength(0);
    const xs = core.flatMap(([x, , w]) => [x, x + w]);
    const ys = core.flatMap(([, y, , h]) => [y, y + h]);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 64)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 64)).toBeLessThanOrEqual(0.5);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(15);
    expect(Math.min(...core.map(([, , w, h]) => Math.min(w, h)))).toBe(1);
  });

  it('only ever draws on whole device pixels, so lines are never blurred', () => {
    for (const style of ['cross', 'dot', 'cross-dot']) {
      for (const thickness of [1, 1.5, 2, 2.5, 3, 6]) {
        for (const dotSize of [1, 2, 3, 4]) {
          for (const dpr of [1, 1.25, 1.5, 2, 3]) {
            for (const size of [128, 129, 160, 192, 256]) {
              const { core, outline } = crosshairRects({ ...crosshair(), style, thickness, dotSize, outline: true }, dpr, size);
              for (const rect of [...core, ...outline]) {
                for (const value of rect) expect(Number.isInteger(value)).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('keeps opposite arms the same distance from the centre, at any thickness', () => {
    for (const thickness of [1, 2, 3, 4, 5]) {
      const { core } = crosshairRects({ ...crosshair(), thickness, gap: 3, length: 6 }, 1, 128);
      const [up, down, left, right] = core;
      const centre = up[0] + thickness / 2;
      expect(centre - (up[1] + up[3])).toBe(down[1] - centre);
      expect(centre - (left[0] + left[2])).toBe(right[0] - centre);
    }
  });

  it('centres a dot exactly on the lines, whatever their sizes', () => {
    for (const thickness of [1, 2, 3, 4]) {
      for (const dotSize of [1, 2, 3, 4, 5]) {
        const { core } = crosshairRects({ ...crosshair(), style: 'cross-dot', thickness, dotSize }, 1, 128);
        const dot = core.at(-1);
        expect(dot[0] + dot[2] / 2).toBe(core[0][0] + thickness / 2);
        expect(dot[1]).toBe(dot[0]);
      }
    }
  });

  it('leaves no hole in the middle of a cross with no gap', () => {
    const { core } = crosshairRects({ ...crosshair(), gap: 0, thickness: 2 }, 1, 128);
    const covered = (x, y) => core.some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h);
    for (let x = 63; x < 65; x += 1) for (let y = 63; y < 65; y += 1) expect(covered(x, y)).toBe(true);
  });

  it('keeps the same visual size at any pixel ratio', () => {
    const base = crosshairRects(crosshair(), 1, 128).core;
    const doubled = crosshairRects(crosshair(), 2, 256).core;
    base.forEach((rect, index) => {
      expect(doubled[index][2]).toBe(rect[2] * 2);
      expect(doubled[index][3]).toBe(rect[3] * 2);
    });
  });

  it('never draws a line thinner than one device pixel', () => {
    const { core } = crosshairRects({ ...crosshair(), thickness: 1 }, 0.5, 64);
    for (const [, , w, h] of core) expect(Math.min(w, h)).toBeGreaterThanOrEqual(1);
  });

  it('supports each style', () => {
    const count = (style) => crosshairRects({ ...crosshair(), style }, 1, 128).core.length;
    expect(crosshairRects({ ...crosshair(), gap: 0 }, 1, 128).core).toHaveLength(5);
    expect(count('cross')).toBe(4);
    expect(count('dot')).toBe(1);
    expect(count('cross-dot')).toBe(5);
    expect(count('hidden')).toBe(0);
  });

  it('applies gap and length', () => {
    const { core } = crosshairRects({ ...crosshair(), gap: 6, length: 10, thickness: 2 }, 1, 128);
    const [top] = core;
    expect(top).toEqual([63, 64 - 6 - 10, 2, 10]);
  });

  it('adds an outline around each part when enabled', () => {
    const { core, outline } = crosshairRects({ ...crosshair(), outline: true, outlineThickness: 2 }, 1, 128);
    expect(outline).toHaveLength(4);
    expect(outline[0][2]).toBe(core[0][2] + 4);
    expect(outline[0][0]).toBe(core[0][0] - 2);
  });

  it('joins lines cleanly with no gap', () => {
    const { core } = crosshairRects({ ...crosshair(), gap: 0, thickness: 2 }, 1, 128);
    expect(core[0][1] + core[0][3]).toBe(63);
    expect(core[1][1]).toBe(65);
  });
});

describe('weapon animation', () => {
  it('starts immediately and returns fully to rest', () => {
    expect(slideCurve(-1)).toBe(0);
    expect(slideCurve(22)).toBeCloseTo(1, 2);
    expect(slideCurve(200)).toBe(0);
    expect(kickCurve(16)).toBeCloseTo(1, 2);
    expect(kickCurve(1000)).toBeLessThan(0.001);
  });
});

describe('sound synthesis', () => {
  const rate = 44100;

  it.each(['gunshot', 'hit', 'countdownTick', 'countdownGo', 'uiHover', 'uiConfirm', 'sessionComplete', 'personalBest', 'ambientBed'])(
    '%s produces finite, unclipped audio',
    (name) => {
      const samples = synth[name](rate);
      expect(samples.length).toBeGreaterThan(0);
      let peak = 0;
      for (const value of samples) {
        expect(Number.isFinite(value)).toBe(true);
        peak = Math.max(peak, Math.abs(value));
      }
      expect(peak).toBeLessThanOrEqual(1);
      expect(peak).toBeGreaterThan(0.1);
    },
  );

  it('keeps the shot and hit sounds short, so rapid fire stays clean', () => {
    expect(synth.gunshot(rate).length / rate).toBeLessThan(0.3);
    expect(synth.hit(rate).length / rate).toBeLessThan(0.2);
  });

  it('peaks in the first few milliseconds, so feedback feels immediate', () => {
    for (const name of ['gunshot', 'hit']) {
      const samples = synth[name](rate);
      const early = samples.subarray(0, Math.floor(rate * 0.012));
      let peak = 0;
      for (const value of early) peak = Math.max(peak, Math.abs(value));
      expect(peak).toBeGreaterThan(0.5);
    }
  });
});

describe('colour contrast', () => {
  it('flags colours too close in brightness to show up against each other', () => {
    expect(coloursAreSimilar('#000000', '#14181c')).toBe(true);
    expect(coloursAreSimilar('#ffffff', '#f7f8f8')).toBe(true);
    expect(coloursAreSimilar('#000000', '#f7f8f8')).toBe(false);
    expect(coloursAreSimilar('#000000', '#18c5d8')).toBe(false);
  });
});

describe('themes', () => {
  it('offers the three themes, with White lab first', () => {
    expect(Object.keys(THEMES)).toEqual(['white-lab', 'dark-studio', 'soft-chrome']);
  });

  it('always gives targets a contrasting border', () => {
    expect(targetPalette('#f7f8f8').border).toBe('#14181c');
    expect(targetPalette('#14181c').border).toBe('#f7f8f8');
    expect(targetPalette('#ff8a1f').border).toBe('#14181c');
  });
});

describe('utilities', () => {
  it('clamps and wraps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 8);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 8);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 8);
  });

  it('generates reproducible numbers in range', () => {
    const a = new SeededRandom(4);
    const b = new SeededRandom(4);
    for (let i = 0; i < 1000; i += 1) {
      const value = a.next();
      expect(value).toBe(b.next());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const integers = new SeededRandom(9);
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) seen.add(integers.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});
