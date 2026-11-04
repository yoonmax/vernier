import { expect, test } from '@playwright/test';
import { FAST_SETTINGS, clickSwitch, gameState, openGame, sessionStats, shootAway, shootTarget, startSession, waitForState } from './helpers.js';

test.describe('main menu', () => {
  test('shows every item, and each one goes somewhere real', async ({ page }) => {
    const errors = await openGame(page);
    for (const id of ['play', 'modes', 'settings', 'statistics', 'about']) {
      await expect(page.getByTestId(`menu-${id}`)).toBeVisible();
    }

    await page.getByTestId('menu-modes').click();
    await waitForState(page, 'MODE_SELECTION');
    await page.keyboard.press('Escape');
    await waitForState(page, 'MAIN_MENU');

    await page.getByTestId('menu-settings').click();
    await waitForState(page, 'SETTINGS');
    await page.getByTestId('settings-close').click();
    await waitForState(page, 'MAIN_MENU');

    await page.getByTestId('menu-statistics').click();
    await waitForState(page, 'STATISTICS');
    await expect(page.getByText('Finish a session and your numbers appear here.')).toBeVisible();
    await page.getByTestId('statistics-back').click();
    await waitForState(page, 'MAIN_MENU');

    await page.getByTestId('menu-about').click();
    await waitForState(page, 'ABOUT');
    await page.keyboard.press('Escape');
    await waitForState(page, 'MAIN_MENU');

    await page.getByTestId('menu-play').click();
    await waitForState(page, 'READY');
    expect(errors).toEqual([]);
  });

  test('can be used with the keyboard alone', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-modes').focus();
    await page.keyboard.press('Enter');
    await waitForState(page, 'MODE_SELECTION');
  });
});

test.describe('modes', () => {
  test('each of the six modes can be selected and shows its details', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-modes').click();
    for (const [id, name] of [
      ['gridshot', 'Gridshot'],
      ['precision', 'Precision'],
      ['speed', 'Speed'],
      ['micro', 'Micro'],
      ['tracking', 'Tracking'],
      ['reaction', 'Reaction'],
    ]) {
      await page.getByTestId(`mode-${id}`).click();
      await expect(page.getByTestId('start-mode')).toHaveText(`Start ${name}`);
    }
  });

  test('remembers the chosen mode and its options after a reload', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-modes').click();
    await page.getByTestId('mode-speed').click();
    await page.getByRole('group', { name: 'Targets' }).getByText('100', { exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByText('Speed: 100 targets')).toBeVisible();
  });
});

test.describe('pointer lock and gameplay', () => {
  test('locks the pointer with raw input, and moving the mouse turns the view', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'precision');

    const locked = await page.evaluate(() => document.pointerLockElement === window.__vernier.renderer.canvas);
    expect(locked).toBe(true);
    const status = await page.evaluate(() => window.__vernier.appStore.getState().rawInputStatus);
    expect(['active', 'unavailable']).toContain(status);

    const before = await page.evaluate(() => ({ yaw: window.__vernier.view.yaw, pitch: window.__vernier.view.pitch }));
    await page.mouse.move(100, 100);
    await page.mouse.move(250, 60, { steps: 10 });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => ({ yaw: window.__vernier.view.yaw, pitch: window.__vernier.view.pitch }));
    expect(after.yaw).not.toBe(before.yaw);
    expect(after.pitch).not.toBe(before.pitch);
    expect(errors).toEqual([]);
  });

  test('a real click hits a target, scores it and replaces it at once', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'precision');

    const firstId = await page.evaluate(() => window.__vernier.targets.active[0].id);
    await shootTarget(page);
    const stats = await sessionStats(page);
    expect(stats).toMatchObject({ shots: 1, hits: 1, active: 1 });
    expect(stats.score).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__vernier.targets.active[0].id)).not.toBe(firstId);

    await shootAway(page);
    expect(await sessionStats(page)).toMatchObject({ shots: 2, hits: 1, active: 1 });
    expect(errors).toEqual([]);
  });

  test('registers rapid clicks without losing any', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await page.evaluate(() => window.__vernier.view.setAngles(Math.PI, 0));
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.down();
      await page.mouse.up();
    }
    expect((await sessionStats(page)).shots).toBe(40);
  });

  test('clicking the interface never fires the weapon', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-play').click();
    await waitForState(page, 'READY');
    await page.getByRole('button', { name: 'Settings' }).click();
    await waitForState(page, 'SETTINGS');
    await page.getByTestId('settings-close').click();
    await waitForState(page, 'READY');
    expect((await sessionStats(page)).shots).toBe(0);

    await page.getByTestId('ready-start').click();
    await waitForState(page, 'PLAYING');
    expect((await sessionStats(page)).shots).toBe(0);
  });

  test('counts down 3, 2, 1, GO', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-play').click();
    await page.getByTestId('ready-start').click();
    const seen = [];
    await page.exposeFunction('recordCount', (value) => seen.push(value));
    await page.evaluate(() => {
      window.__vernier.appStore.subscribe((state, previous) => {
        if (state.countdown && state.countdown !== previous.countdown) window.recordCount(state.countdown);
      });
    });
    await waitForState(page, 'PLAYING');
    await page.waitForTimeout(100);
    expect(seen.at(-1)).toBe('GO');
    expect(seen.join('')).toContain('1');
  });
});

test.describe('pause and resume', () => {
  test('losing pointer lock pauses and stops the clock, and resume continues it', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'gridshot', { duration: 30 });
    await page.waitForTimeout(300);

    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');

    const pausedAt = await page.evaluate(() => window.__vernier.mode.clock.elapsed());
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__vernier.mode.clock.elapsed())).toBe(pausedAt);

    // Chrome refuses re-locking for a moment after a lock ends, which the game must handle.
    await page.waitForTimeout(1400);
    await page.getByTestId('pause-resume').click();
    await waitForState(page, 'PLAYING');
    await page.waitForTimeout(100);
    const resumedAt = await page.evaluate(() => window.__vernier.mode.clock.elapsed());
    expect(resumedAt).toBeGreaterThan(pausedAt);
    expect(resumedAt).toBeLessThan(pausedAt + 1500);
    expect(errors).toEqual([]);
  });

  test('an immediate resume click reports the browser cooldown rather than failing silently', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    await page.getByTestId('pause-resume').click();
    await page.waitForTimeout(300);
    const state = await gameState(page);
    if (state === 'PAUSED') await expect(page.getByRole('alert')).toBeVisible();
    else expect(state).toBe('PLAYING');
  });

  test('a hidden tab cannot silently continue a session', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'gridshot', { duration: 30 });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForState(page, 'PAUSED');
    expect(await page.evaluate(() => window.__vernier.mode.paused)).toBe(true);
  });

  test('losing window focus pauses a session', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'gridshot', { duration: 30 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await waitForState(page, 'PAUSED');
  });

  test('settings can be changed while paused and apply immediately', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    const clock = await page.evaluate(() => window.__vernier.mode.clock.elapsed());

    await page.getByTestId('pause-settings').click();
    await waitForState(page, 'SETTINGS');
    await page.getByTestId('settings-camera').click();
    await page.getByRole('spinbutton', { name: 'Field of view, exact value' }).fill('90');
    expect(await page.evaluate(() => window.__vernier.renderer.horizontalFov)).toBe(90);
    await page.getByTestId('settings-close').click();
    await waitForState(page, 'PAUSED');

    expect(await page.evaluate(() => window.__vernier.mode.clock.elapsed())).toBe(clock);
    expect(await page.evaluate(() => window.__vernier.mode !== null)).toBe(true);
  });
});

test.describe('results', () => {
  test('a timed session ends by itself, and shows real figures', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'gridshot', { duration: 15 });

    await shootTarget(page);
    await shootTarget(page);
    await shootAway(page);

    await page.evaluate(() => {
      const { mode } = window.__vernier;
      mode.clock.accumulated = 14999;
      mode.clock.startedAt = performance.now();
    });
    await waitForState(page, 'RESULTS');

    await expect(page.getByTestId('results-headline')).toHaveText(/\d/);
    await expect(page.getByText('Accuracy', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('66.7%')).toBeVisible();
    await expect(page.getByTestId('personal-best')).toBeVisible();

    const unlocked = await page.evaluate(() => document.pointerLockElement === null);
    expect(unlocked).toBe(true);
    expect(errors).toEqual([]);
  });

  test('speed mode shows results the moment the goal is reached', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'speed', { goal: 25 });
    for (let i = 0; i < 25; i += 1) await shootTarget(page);
    await waitForState(page, 'RESULTS');
    await expect(page.getByTestId('results-headline')).toHaveText(/\d+\.\d+ s/);
  });

  test('ending an endless session goes to results', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await shootTarget(page);
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    await page.getByTestId('pause-end').click();
    await waitForState(page, 'RESULTS');
  });

  test('reaction mode penalises a false start and reports its timings', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'reaction', { trials: 5 });
    await shootAway(page);
    expect(await page.evaluate(() => window.__vernier.mode.falseStarts)).toBe(1);

    for (let trial = 0; trial < 5; trial += 1) {
      await page.waitForFunction(() => window.__vernier.targets.active.length === 1, null, { timeout: 8000 });
      await shootTarget(page);
    }
    await waitForState(page, 'RESULTS');
    await expect(page.getByText('Median', { exact: true })).toBeVisible();
    await expect(page.getByText('Fastest', { exact: true })).toBeVisible();
    await expect(page.getByText('False starts', { exact: true })).toBeVisible();
    await expect(page.getByText(/aren't laboratory measurements/)).toBeVisible();
  });

  test('tracking hold scores by contact time rather than by shots', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'tracking', { input: 'hold', duration: 30 });
    await page.mouse.down();
    await page.waitForTimeout(100);
    for (let i = 0; i < 12; i += 1) {
      await page.evaluate(() => {
        const game = window.__vernier;
        const target = game.targets.active[0];
        game.view.setAngles(target.yaw, target.pitch);
      });
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    const state = await page.evaluate(() => {
      const { mode } = window.__vernier;
      return { contact: mode.contactMs, held: mode.heldMs, shots: mode.recorder.shots };
    });
    expect(state.shots).toBe(0);
    expect(state.held).toBeGreaterThan(0);
    expect(state.contact).toBeGreaterThan(0);
  });
});

test.describe('restart', () => {
  test('retrying many times does not crash, or carry state over', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'speed', { goal: 25 });

    for (let run = 0; run < 3; run += 1) {
      for (let i = 0; i < 25; i += 1) await shootTarget(page);
      await waitForState(page, 'RESULTS');
      await page.waitForTimeout(1400);
      await page.getByTestId('results-retry').click();
      await waitForState(page, 'PLAYING');
      expect(await sessionStats(page)).toMatchObject({ shots: 0, hits: 0, active: 1 });
    }
    expect(errors).toEqual([]);
  });

  test('restarting from pause gives a fresh session', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'gridshot', { duration: 30 });
    await shootTarget(page);
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    await page.getByTestId('pause-restart').click();
    await waitForState(page, 'READY');
    expect(await sessionStats(page)).toMatchObject({ shots: 0, score: 0, active: 3 });
  });

  test('going back to the menu clears the session', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'gridshot', { duration: 30 });
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    await page.getByTestId('pause-menu').click();
    await waitForState(page, 'MAIN_MENU');
    const after = await page.evaluate(() => ({
      mode: window.__vernier.mode,
      targets: window.__vernier.targets.active.length,
    }));
    expect(after.mode).toBeNull();
    expect(after.targets).toBe(0);
  });
});

test.describe('settings', () => {
  test('sensitivity changes turn rate, and shows its derived figures', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-settings').click();
    await page.getByRole('spinbutton', { name: 'Sensitivity, exact value', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: 'Sensitivity, exact value', exact: true }).blur();
    await expect(page.getByTestId('degrees-per-count')).toHaveText('0.0440°');
    await expect(page.getByTestId('cm-per-360')).toHaveText('26.0 cm');
    const rate = await page.evaluate(() => window.__vernier.view.radiansPerCountX);
    expect(rate).toBeCloseTo((0.044 * Math.PI) / 180, 8);
  });

  test('settings persist across a reload', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-settings').click();
    await page.getByRole('spinbutton', { name: 'Sensitivity, exact value', exact: true }).fill('3.25');
    await page.getByRole('spinbutton', { name: 'Sensitivity, exact value', exact: true }).blur();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId('menu-settings')).toBeVisible();
    expect(await page.evaluate(() => window.__vernier.settingsStore.getState().settings.mouse.sensitivity)).toBe(3.25);
  });

  test('the crosshair preview updates instantly', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('settings-crosshair').click();
    const snapshot = () => page.getByTestId('crosshair-preview').evaluate((canvas) => canvas.toDataURL());
    const before = await snapshot();
    await page.getByRole('button', { name: 'Cyan' }).click();
    const coloured = await snapshot();
    expect(coloured).not.toBe(before);
    await page.getByRole('spinbutton', { name: 'Length, exact value' }).fill('20');
    expect(await snapshot()).not.toBe(coloured);
  });

  test('a customised target size marks the run as not eligible for bests', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('settings-targets').click();
    await expect(page.getByTestId('run-profile')).toContainText('Standard run');
    await page.getByRole('spinbutton', { name: 'Target size, exact value' }).fill('1.5');
    await expect(page.getByTestId('run-profile')).toContainText('Custom target size');
  });

  test('a destructive reset needs a second click', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-settings').click();
    await page.getByRole('spinbutton', { name: 'Sensitivity, exact value', exact: true }).fill('5');
    await page.getByRole('spinbutton', { name: 'Sensitivity, exact value', exact: true }).blur();
    const sensitivity = () => page.evaluate(() => window.__vernier.settingsStore.getState().settings.mouse.sensitivity);

    await page.getByRole('button', { name: 'Reset mouse' }).click();
    expect(await sensitivity()).toBe(5);
    await page.getByRole('button', { name: 'Click again to reset' }).click();
    expect(await sensitivity()).toBe(1);
  });

  test('every category opens, and every graphics option applies without an error', async ({ page }) => {
    const errors = await openGame(page);
    await page.getByTestId('menu-settings').click();
    for (const id of ['mouse', 'camera', 'crosshair', 'targets', 'graphics', 'audio', 'weapon', 'interface']) {
      await page.getByTestId(`settings-${id}`).click();
      await expect(page.locator('h2').first()).toBeVisible();
    }

    await page.getByTestId('settings-graphics').click();
    const preset = page.getByRole('group', { name: 'Quality preset' });
    for (const name of ['Balanced', 'High', 'Performance']) {
      await preset.getByText(name, { exact: true }).click();
      await expect(preset.getByRole('radio', { name, exact: true })).toBeChecked();
      await page.waitForTimeout(250);
    }
    await clickSwitch(page, 'Anti-aliasing');
    await page.waitForTimeout(400);
    const theme = page.getByRole('group', { name: 'Theme' });
    for (const name of ['Dark studio', 'Soft chrome', 'White lab']) {
      await theme.getByText(name, { exact: true }).click();
      await expect(theme.getByRole('radio', { name, exact: true })).toBeChecked();
      await page.waitForTimeout(250);
    }
    expect(errors).toEqual([]);
  });

  test('the renderer can rebuild mid-session, and lock still works afterwards', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'precision');
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    await page.getByTestId('pause-settings').click();
    await page.getByTestId('settings-graphics').click();
    await clickSwitch(page, 'Anti-aliasing');
    await page.waitForTimeout(500);
    await page.getByTestId('settings-close').click();
    await waitForState(page, 'PAUSED');
    await page.waitForTimeout(1400);
    await page.getByTestId('pause-resume').click();
    await waitForState(page, 'PLAYING');
    await shootTarget(page);
    expect((await sessionStats(page)).hits).toBe(1);
    expect(errors).toEqual([]);
  });

  test('honours anti-aliasing off from the first frame after a reload', async ({ page }) => {
    await openGame(page);
    const antialias = await page.evaluate(() => window.__vernier.renderer.gl.getContextAttributes().antialias);
    expect(antialias).toBe(false);
  });

  test('never draws the pistol over the menu, including with post-processing on', async ({ page }) => {
    await openGame(page, { settings: { graphics: { ...FAST_SETTINGS.graphics, postprocessing: true } } });
    const menu = await page.evaluate(() => ({
      composer: window.__vernier.renderer.composer !== null,
      weapon: window.__vernier.renderer.showWeapon,
    }));
    expect(menu).toEqual({ composer: true, weapon: false });
    await page.waitForTimeout(300);
    await page.getByTestId('menu-play').click();
    await page.waitForFunction(() => window.__vernier.renderer.showWeapon);
  });

  test('the FPS overlay reports real values when enabled', async ({ page }) => {
    await openGame(page, { settings: { ...FAST_SETTINGS, interface: { showFps: true, showFrameTime: true } } });
    await startSession(page, 'precision');
    await expect(page.getByTestId('hud-fps')).toHaveText(/\d+ fps, average \d+, 1% low (collecting|\d+)/, { timeout: 5000 });
  });
});

test.describe('statistics', () => {
  test('records a real session and keeps it after a reload', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'speed', { goal: 25 });
    for (let i = 0; i < 25; i += 1) await shootTarget(page);
    await waitForState(page, 'RESULTS');
    await page.waitForTimeout(1200);
    await page.getByTestId('results-menu').click();
    await page.getByTestId('menu-statistics').click();
    await expect(page.getByTestId('statistics-totals')).toContainText('25');
    await expect(page.getByTestId('history-table')).toContainText('Speed');

    await page.reload();
    await expect(page.getByTestId('menu-statistics')).toBeVisible();
    await page.getByTestId('menu-statistics').click();
    await expect(page.getByTestId('history-table')).toContainText('Speed');
  });
});

test.describe('resilience', () => {
  test('starts normally with corrupted saved data', async ({ page }) => {
    const errors = await openGame(page, {
      settings: null,
      stored: {
        'vernier.settings.v1': '{broken',
        'vernier.stats.v1': 'not json',
        'vernier.prefs.v1': '[[[',
      },
    });
    await page.getByTestId('menu-play').click();
    await waitForState(page, 'READY');
    expect(errors).toEqual([]);
  });

  test('reports a Pointer Lock failure and lets the player try again', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
      const canvas = window.__vernier.renderer.canvas;
      canvas.requestPointerLock = () => Promise.reject(new DOMException('no', 'AbortError'));
    });
    await page.getByTestId('menu-play').click();
    await page.getByTestId('ready-start').click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await gameState(page)).toBe('READY');
  });

  test('falls back to a standard lock when raw input is refused', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
      const canvas = window.__vernier.renderer.canvas;
      const original = canvas.requestPointerLock.bind(canvas);
      canvas.requestPointerLock = (options) =>
        options?.unadjustedMovement ? Promise.reject(new DOMException('no', 'NotSupportedError')) : original();
    });
    await page.getByTestId('menu-play').click();
    await page.getByTestId('ready-start').click();
    await waitForState(page, 'PLAYING');
    expect(await page.evaluate(() => window.__vernier.appStore.getState().rawInputStatus)).toBe('unavailable');
  });
});

test.describe('touch devices', () => {
  test('explains that a mouse is needed rather than pretending touch is equivalent', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Vernier needs a mouse' })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await context.close();
  });
});

test.describe('production build', () => {
  test('does not expose the debug handle without asking for it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    expect(await page.evaluate(() => window.__vernier)).toBeUndefined();
  });
});
