import { expect } from '@playwright/test';

/** The lightest graphics, so tests run quickly on software rendering. */
export const FAST_SETTINGS = {
  graphics: {
    preset: 'performance',
    renderScale: 0.5,
    antialiasing: false,
    shadows: 'off',
    ambientOcclusion: 'baked',
    reflections: 'off',
    particles: 'low',
    postprocessing: false,
  },
};

/**
 * Opens the game. Every test collects page errors and fails on them, so a crash anywhere in
 * a flow can't go unnoticed.
 */
export async function openGame(page, { settings = FAST_SETTINGS, stored = {}, query = '?debug' } = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(
    ({ settings: s, stored: extra }) => {
      if (sessionStorage.getItem('vernier-test-seeded')) return;
      sessionStorage.setItem('vernier-test-seeded', '1');
      if (s) localStorage.setItem('vernier.settings.v1', JSON.stringify(s));
      for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
    },
    { settings, stored },
  );
  await page.goto(`/${query}`);
  await expect(page.getByTestId('menu-play')).toBeVisible();
  return errors;
}

export const gameState = (page) => page.evaluate(() => window.__vernier.machine.state);

export async function waitForState(page, state, timeout = 15000) {
  await page.waitForFunction((s) => window.__vernier.machine.state === s, state, { timeout });
}

/** Selects a mode and options, then goes through READY with a real click and Pointer Lock. */
export async function startSession(page, modeId, options = {}) {
  await page.getByTestId('menu-modes').click();
  await page.getByTestId(`mode-${modeId}`).click();
  await page.evaluate(
    ({ id, opts }) => {
      const app = window.__vernier.appStore.getState();
      for (const [key, value] of Object.entries(opts)) app.setOption(id, key, value);
    },
    { id: modeId, opts: options },
  );
  await page.getByTestId('start-mode').click();
  await page.getByTestId('ready-start').click();
  await waitForState(page, 'PLAYING');
}

/** Points the authoritative camera at a live target, then fires a real mouse click. */
export async function shootTarget(page, index = 0) {
  await page.evaluate((i) => {
    const game = window.__vernier;
    const target = game.targets.active[i];
    game.view.setAngles(target.yaw, target.pitch);
  }, index);
  await page.mouse.down();
  await page.mouse.up();
}

export async function shootAway(page) {
  await page.evaluate(() => window.__vernier.view.setAngles(Math.PI, 0));
  await page.mouse.down();
  await page.mouse.up();
}

export const sessionStats = (page) => page.evaluate(() => {
  const { shots, hits, score } = window.__vernier.mode.recorder;
  return { shots, hits, score, active: window.__vernier.targets.active.length };
});

/** Clicks a switch's visible label, as a player would, and checks that it changed state. */
export async function clickSwitch(page, name) {
  const control = page.getByRole('switch', { name, exact: true });
  const before = await control.isChecked();
  await control.locator('..').click();
  await expect(control).toBeChecked({ checked: !before });
}
