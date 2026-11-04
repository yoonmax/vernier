import { expect, test } from '@playwright/test';

/**
 * Runs in Firefox and WebKit as well as Chromium. Headless WebKit can't take Pointer Lock, so
 * either result is acceptable there: play starts, or the player is told clearly why it can't.
 */
test('loads, renders, and either starts play or explains why not', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug');
  await expect(page.getByTestId('menu-play')).toBeVisible();
  await page.evaluate(() => window.__vernier.settingsStore.getState().applyGraphicsPreset('performance'));
  await page.getByTestId('menu-play').click();
  await page.getByTestId('ready-start').click();
  await page.waitForFunction(
    () => window.__vernier.machine.state !== 'READY' || window.__vernier.appStore.getState().lockError,
    null,
    { timeout: 10000 },
  );
  const state = await page.evaluate(() => window.__vernier.machine.state);
  if (state === 'READY') {
    await expect(page.getByRole('alert')).toBeVisible();
  } else {
    await page.waitForFunction(() => window.__vernier.machine.state === 'PLAYING', null, { timeout: 10000 });
    await page.evaluate(() => {
      const game = window.__vernier;
      const [target] = game.targets.active;
      game.view.setAngles(target.yaw, target.pitch);
    });
    await page.mouse.down();
    await page.mouse.up();
    expect(await page.evaluate(() => window.__vernier.mode.recorder.hits)).toBe(1);
  }
  expect(errors).toEqual([]);
});
