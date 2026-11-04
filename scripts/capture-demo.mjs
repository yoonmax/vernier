/**
 * Records docs/demo.gif from the real game. A small script plays one Gridshot session through
 * the same mouse handler a player uses. Time is stepped by hand, so each frame can be captured
 * at leisure while the animation still plays at full speed in the finished file.
 *
 *   npm run build && npm run demo
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const { GIFEncoder, applyPalette, quantize } = gifenc;

const WIDTH = 880;
const HEIGHT = 495;
const FRAME_MS = 40;
const TOTAL_FRAMES = 130;

const server = await preview({ preview: { port: 4176, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })).newPage();
await page.goto('http://localhost:4176/?debug');
await page.waitForFunction(() => window.__vernier);

await page.evaluate(() => {
  const game = window.__vernier;
  game.settingsStore.getState().update('targets', 'seed', 'vernier-demo');
  game.settingsStore.getState().update('interface', 'skipCountdown', false);
  game.appStore.getState().selectMode('gridshot');
  game.appStore.getState().setOption('gridshot', 'duration', 60);
  game.openReady();
});
await page.waitForTimeout(700);
await page.getByTestId('ready-start').click();
await page.waitForFunction(() => window.__vernier.machine.state === 'PLAYING', null, { timeout: 8000 });

// From here on, this page runs on a clock the script controls.
await page.evaluate(() => {
  const game = window.__vernier;
  game.loop.stop();
  const start = performance.now();
  let virtual = start;
  performance.now = () => virtual;

  let target = null;
  let fromYaw = game.view.yaw;
  let fromPitch = game.view.pitch;
  let step = 0;
  let steps = 8;

  window.__step = (ms) => {
    virtual += ms;
    if (!target || !target.active) {
      // Pick the nearest target, as a player would.
      let best = Infinity;
      for (const candidate of game.targets.active) {
        const distance = Math.hypot(candidate.yaw - game.view.yaw, candidate.pitch - game.view.pitch);
        if (distance < best) {
          best = distance;
          target = candidate;
        }
      }
      fromYaw = game.view.yaw;
      fromPitch = game.view.pitch;
      step = 0;
      steps = Math.max(5, Math.round(best * 34));
    }
    step += 1;
    const t = Math.min(1, step / steps);
    const eased = 1 - (1 - t) ** 3;
    game.view.setAngles(
      fromYaw + (target.yaw - fromYaw) * eased,
      fromPitch + (target.pitch - fromPitch) * eased,
    );
    if (t >= 1 && step >= steps + 1) {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      target = null;
    }
    game.frame(ms / 1000, virtual, ms);
  };
});

const gif = GIFEncoder();
for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
  await page.evaluate((ms) => window.__step(ms), FRAME_MS);
  const png = PNG.sync.read(await page.screenshot());
  const palette = quantize(png.data, 128);
  gif.writeFrame(applyPalette(png.data, palette), WIDTH, HEIGHT, { palette, delay: FRAME_MS });
}
gif.finish();
writeFileSync('docs/demo.gif', gif.bytes());
console.log(`Saved docs/demo.gif, ${(gif.bytes().length / 1048576).toFixed(1)} MB`);

await browser.close();
await server.close();
process.exit(0);
