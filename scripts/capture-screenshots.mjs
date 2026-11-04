/**
 * Plays through the production build in Chromium on the real GPU and saves screenshots to
 * docs/screenshots. Pass names as arguments to capture only those views.
 *
 *   npm run build && npm run screenshots
 *   npm run screenshots -- menu gameplay
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const outputDir = resolve('docs/screenshots');
mkdirSync(outputDir, { recursive: true });

const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'error' });
const url = 'http://localhost:4179/?debug';

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit'],
});

const wanted = new Set(process.argv.slice(2));
const shouldCapture = (name) => wanted.size === 0 || wanted.has(name);

async function newPage(settings = {}) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('Page error:', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') console.log(`[${message.type()}]`, message.text());
  });
  await page.addInitScript((value) => {
    if (Object.keys(value).length > 0) localStorage.setItem('vernier.settings.v1', JSON.stringify(value));
  }, settings);
  await page.goto(url);
  await page.waitForFunction(() => window.__vernier !== undefined);
  return page;
}

async function shot(page, name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outputDir, `${name}.png`) });
  console.log('Saved', name);
}

/** Starts the selected mode and waits until play has begun. */
async function startMode(page, modeId, options = {}) {
  await page.evaluate(
    ({ modeId, options }) => {
      const game = window.__vernier;
      const app = game.appStore.getState();
      app.selectMode(modeId);
      for (const [key, value] of Object.entries(options)) app.setOption(modeId, key, value);
      game.openReady();
    },
    { modeId, options },
  );
  await page.waitForTimeout(650);
}

async function play(page) {
  await page.getByTestId('ready-start').click();
  await page.waitForFunction(() => window.__vernier.machine.state === 'PLAYING', null, { timeout: 8000 });
}

/** Turns the view onto a target and shoots, through the real mouse path. */
async function aimAt(page, index = 0) {
  return page.evaluate((i) => {
    const game = window.__vernier;
    const target = game.targets.active[i];
    if (!target) return false;
    game.view.setAngles(target.yaw, target.pitch);
    return true;
  }, index);
}

async function shootOnce(page) {
  await aimAt(page);
  await page.mouse.down();
  await page.mouse.up();
}

if (shouldCapture('menu')) {
  const page = await newPage();
  await page.waitForTimeout(1600);
  await shot(page, 'menu');
  await page.context().close();
}

if (shouldCapture('modes')) {
  const page = await newPage();
  await page.getByTestId('menu-modes').click();
  await page.waitForTimeout(1200);
  await shot(page, 'modes');
  await page.context().close();
}

if (shouldCapture('ready')) {
  const page = await newPage();
  await startMode(page, 'gridshot');
  await page.waitForTimeout(800);
  await shot(page, 'ready');
  await page.context().close();
}

if (shouldCapture('gameplay')) {
  const page = await newPage();
  await startMode(page, 'gridshot');
  await play(page);
  await page.waitForTimeout(600);
  await shot(page, 'gameplay');
  await aimAt(page);
  await page.waitForTimeout(100);
  // Hold the frame just after the shot, so the short-lived hit effect can be photographed.
  await page.evaluate(() => {
    document.addEventListener('mousedown', () => {
      const game = window.__vernier;
      const shotTime = performance.now();
      setTimeout(() => {
        game.loop.stop();
        game.renderer.effects.update(shotTime / 1000 + 0.075);
        game.renderer.weapon.update(shotTime + 26, game.view.yaw, game.view.pitch);
        game.renderer.render();
      }, 0);
    }, { once: true });
  });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(outputDir, 'hit.png') });
  console.log('Saved hit');
  await page.evaluate(() => window.__vernier.loop.start());
  await page.context().close();
}

// Extra views for checking the room. Only captured when asked for by name.
if (wanted.has('look')) {
  const page = await newPage();
  await startMode(page, 'precision');
  await play(page);
  const views = {
    'look-left': [1.3, 0.12],
    'look-right': [-1.6, 0.2],
    'look-behind': [3.1, 0.1],
    'look-up': [0.4, 1.1],
    'look-down': [0.2, -0.75],
  };
  for (const [name, [yaw, pitch]] of Object.entries(views)) {
    await page.evaluate(([y, p]) => window.__vernier.view.setAngles(y, p), [yaw, pitch]);
    await page.waitForTimeout(80);
    await shot(page, name);
  }
  await page.context().close();
}

for (const theme of ['dark-studio', 'soft-chrome']) {
  if (!shouldCapture(theme)) continue;
  const page = await newPage();
  await page.evaluate((id) => window.__vernier.settingsStore.getState().setTheme(id), theme);
  await startMode(page, 'gridshot');
  await play(page);
  await page.waitForTimeout(600);
  await shot(page, `theme-${theme}`);
  await page.context().close();
}

if (wanted.has('ultra')) {
  const page = await newPage();
  await page.evaluate(() => window.__vernier.settingsStore.getState().applyGraphicsPreset('ultra'));
  await startMode(page, 'gridshot');
  await play(page);
  await page.waitForTimeout(600);
  await shot(page, 'preset-ultra');
  await page.context().close();
}

if (shouldCapture('pause')) {
  const page = await newPage();
  await startMode(page, 'precision');
  await play(page);
  await shootOnce(page);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__vernier.machine.state === 'PAUSED');
  await page.waitForTimeout(900);
  await shot(page, 'pause');
  await page.context().close();
}

if (shouldCapture('settings')) {
  const page = await newPage();
  await page.getByTestId('menu-settings').click();
  await page.waitForTimeout(900);
  await shot(page, 'settings-mouse');
  await page.getByTestId('settings-crosshair').click();
  await page.waitForTimeout(300);
  await shot(page, 'settings-crosshair');
  await page.getByTestId('settings-graphics').click();
  await page.waitForTimeout(300);
  await shot(page, 'settings-graphics');
  await page.context().close();
}

if (shouldCapture('results')) {
  const page = await newPage();
  await startMode(page, 'gridshot', { duration: 15 });
  await play(page);
  // Plays a real session by aiming at live targets and clicking through the input path.
  const started = Date.now();
  while (Date.now() - started < 15200) {
    const state = await page.evaluate(() => window.__vernier.machine.state);
    if (state !== 'PLAYING') break;
    const onTarget = Math.random() > 0.12;
    if (onTarget) await aimAt(page);
    else await page.evaluate(() => window.__vernier.view.setAngles(0.9, 0.4));
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(130 + Math.random() * 180);
  }
  await page.waitForFunction(() => window.__vernier.machine.state === 'RESULTS');
  await page.waitForTimeout(1300);
  await shot(page, 'results');
  await page.getByRole('button', { name: 'Statistics' }).click();
  await page.waitForTimeout(1000);
  await shot(page, 'statistics');
  await page.context().close();
}

await browser.close();
await server.close();
process.exit(0);
