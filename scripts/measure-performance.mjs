/**
 * Plays a real session in Chromium with the display frame limit removed, and reports frame
 * time, draw calls and memory growth at each graphics preset. Numbers apply to this machine
 * and this browser; run it on your own hardware for your own figures.
 *
 *   npm run build && npm run measure
 */
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4177, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info'],
});

const SECONDS = 6;
const rows = [];

const RUNS = [
  ['performance', 1],
  ['balanced', 1],
  ['high', 1],
  ['ultra', 1],
  ['high', 2],
];

for (const [preset, deviceScaleFactor] of RUNS) {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor })).newPage();
  await page.goto('http://localhost:4177/?debug');
  await page.waitForFunction(() => window.__vernier);
  await page.evaluate((id) => {
    const game = window.__vernier;
    game.settingsStore.getState().applyGraphicsPreset(id);
    game.appStore.getState().selectMode('gridshot');
    game.appStore.getState().setOption('gridshot', 'duration', 120);
    game.openReady();
  }, preset);
  await page.waitForTimeout(700);
  await page.getByTestId('ready-start').click();
  await page.waitForFunction(() => window.__vernier.machine.state === 'PLAYING');
  await page.waitForTimeout(500);

  // Shooting runs inside the page, through the real mouse handler, at 10 shots a second.
  // Driving it from outside would measure the test tool's round trips rather than the game.
  const started = await page.evaluate(async (seconds) => {
    const game = window.__vernier;
    await new Promise((settle) => setTimeout(settle, 1000));
    game.frameStats.reset();
    const heap = performance.memory?.usedJSHeapSize ?? 0;
    const timer = setInterval(() => {
      const target = game.targets.active[0];
      game.view.setAngles(target.yaw, target.pitch);
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    }, 100);
    await new Promise((settle) => setTimeout(settle, seconds * 1000));
    clearInterval(timer);
    return { heap };
  }, SECONDS);

  const result = await page.evaluate(() => {
    const game = window.__vernier;
    const { gl } = game.renderer;
    // Times the CPU cost of one full frame, including the pass that writes the reflection.
    const samples = [];
    gl.info.autoReset = false;
    for (let i = 0; i < 60; i += 1) {
      gl.info.reset();
      const start = performance.now();
      game.renderer.render();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return {
      fps: game.frameStats.averageFps(),
      low: game.frameStats.onePercentLowFps(),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      cpuMs: samples[30],
      hits: game.mode.recorder.hits,
      heap: performance.memory?.usedJSHeapSize ?? 0,
      gpu: (() => {
        const context = gl.getContext();
        const info = context.getExtension('WEBGL_debug_renderer_info');
        return info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    };
  });
  rows.push({
    preset: deviceScaleFactor === 1 ? preset : `${preset} at ${deviceScaleFactor}x`,
    'avg fps': Math.round(result.fps),
    '1% low': result.low === null ? 'n/a' : Math.round(result.low),
    'frame ms': (1000 / result.fps).toFixed(2),
    'draw calls': result.calls,
    'render js ms': result.cpuMs.toFixed(2),
    hits: result.hits,
    'heap growth KB': Math.round((result.heap - started.heap) / 1024),
  });
  if (rows.length === 1) console.log('GPU:', result.gpu);
  await page.context().close();
}

console.table(rows);
await browser.close();
await server.close();
process.exit(0);
