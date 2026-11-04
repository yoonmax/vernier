import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { FAST_SETTINGS, openGame, sessionStats, startSession, waitForState } from './helpers.js';

/** Reads the page as pixels, so these tests check what's really on screen. */
async function pixels(page) {
  const png = PNG.sync.read(await page.screenshot());
  return {
    width: png.width,
    height: png.height,
    luminance(x, y) {
      const i = (Math.round(y) * png.width + Math.round(x)) * 4;
      return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    },
  };
}

/** Clears the view of everything but the room and the targets placed by the test. */
async function bareView(page, placements, view) {
  await page.evaluate(({ placements: list, view: angles }) => {
    const game = window.__vernier;
    game.loop.stop();
    game.settingsStore.getState().update('weapon', 'visible', false);
    game.hud.setVisible(false);
    game.targets.clear();
    const d = Math.PI / 180;
    for (const [yaw, pitch, radius] of list) game.targets.spawn(yaw * d, pitch * d, radius, 0);
    game.view.setAngles(angles[0] * d, angles[1] * d);
    game.frame(0.016, performance.now(), 16);
  }, { placements, view });
}

test.describe('crosshair sharpness and position', () => {
  for (const deviceScaleFactor of [1, 1.25, 1.5, 2]) {
    test(`is drawn in solid whole pixels at ${deviceScaleFactor}x`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor });
      const page = await context.newPage();
      await openGame(page);
      await startSession(page, 'precision');
      const levels = await page.getByTestId('crosshair').evaluate((canvas) => {
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        const found = new Set();
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) found.add(data[i]);
        return [...found];
      });
      expect(levels).toEqual([255]);
      await context.close();
    });
  }

  for (const [width, height] of [[1280, 720], [1281, 721], [1920, 1080], [2560, 1080]]) {
    test(`sits on the camera's centre at ${width}×${height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await openGame(page);
      await startSession(page, 'precision');
      const centre = await page.getByTestId('crosshair').evaluate((canvas) => {
        const { data, width: w, height: h } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let minX = w, maxX = 0, minY = h, maxY = 0;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (data[(y * w + x) * 4 + 3] > 0) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x + 1);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y + 1);
            }
          }
        }
        const box = canvas.getBoundingClientRect();
        return { x: box.left + (minX + maxX) / 2, y: box.top + (minY + maxY) / 2 };
      });
      expect(Math.abs(centre.x - width / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(centre.y - height / 2)).toBeLessThanOrEqual(0.5);
      await context.close();
    });
  }
});

test.describe('what you see is what you hit', () => {
  for (const [fov, width, height] of [[103, 1280, 720], [70, 1280, 720], [120, 1600, 900], [103, 2200, 900]]) {
    test(`disc edges and hit edges agree at FOV ${fov}, ${width}×${height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      // Full render scale: upscaling a smaller image would smear the very edges being measured.
      await openGame(page, { settings: { graphics: { ...FAST_SETTINGS.graphics, renderScale: 1 }, camera: { fov } } });
      await startSession(page, 'precision');
      await bareView(page, [[-4, 14, 0.5]], [0, 10]);
      const image = await pixels(page);

      // Where the disc's centre should be on screen, from the camera's own matrices.
      const projected = await page.evaluate(() => {
        const game = window.__vernier;
        const [target] = game.targets.active;
        const { camera } = game.renderer;
        const clip = camera.matrixWorldInverse.elements;
        const p = camera.projectionMatrix.elements;
        const { x, y, z } = target;
        const vx = clip[0] * x + clip[4] * y + clip[8] * z + clip[12];
        const vy = clip[1] * x + clip[5] * y + clip[9] * z + clip[13];
        const vz = clip[2] * x + clip[6] * y + clip[10] * z + clip[14];
        const w = -vz;
        return { x: ((p[0] * vx) / w + 1) / 2 * innerWidth, y: (1 - (p[5] * vy) / w) / 2 * innerHeight };
      });
      // Walks in from the bare wall on each side to the disc's edge: a sharp step in brightness
      // between neighbouring pixels. The soft contact shadow only changes gradually.
      const row = projected.y;
      const search = Math.round(width / 12);
      let left = Math.round(projected.x) - search;
      while (image.luminance(left, row) - image.luminance(left + 1, row) < 25) left += 1;
      left += 1;
      let right = Math.round(projected.x) + search;
      while (image.luminance(right, row) - image.luminance(right - 1, row) < 25) right -= 1;
      right -= 1;

      // Fires the real shooting system along the ray through a given screen pixel.
      const hitAt = (x, y) =>
        page.evaluate(([px, py]) => {
          const game = window.__vernier;
          const { camera } = game.renderer;
          const ndcX = (px / innerWidth) * 2 - 1;
          const ndcY = 1 - (py / innerHeight) * 2;
          const inv = camera.projectionMatrixInverse.elements;
          const vx = inv[0] * ndcX;
          const vy = inv[5] * ndcY;
          const world = camera.matrixWorld.elements;
          const dx = world[0] * vx + world[4] * vy - world[8];
          const dy = world[1] * vx + world[5] * vy - world[9];
          const dz = world[2] * vx + world[6] * vy - world[10];
          const length = Math.hypot(dx, dy, dz);
          const saved = [game.view.yaw, game.view.pitch];
          game.view.setAngles(Math.atan2(-dx, -dz), Math.asin(dy / length));
          const { hit } = game.shooting.fire(0);
          game.view.setAngles(saved[0], saved[1]);
          return hit;
        }, [x, y]);

      expect(await hitAt(projected.x, projected.y)).toBe(true);
      // Screen pixel n covers n to n+1, so these test one full pixel either side of each edge.
      expect(await hitAt(left + 1.5, row)).toBe(true);
      expect(await hitAt(right - 0.5, row)).toBe(true);
      expect(await hitAt(left - 1, row)).toBe(false);
      expect(await hitAt(right + 2, row)).toBe(false);
      await context.close();
    });
  }

  test('a target at the crosshair renders exactly at the middle of the screen', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await bareView(page, [[7, 13, 0.5]], [7, 13]);
    const image = await pixels(page);
    const cx = image.width / 2;
    const cy = image.height / 2;
    expect(image.luminance(cx, cy)).toBeGreaterThan(150);
    let left = 0;
    while (image.luminance(cx - left, cy) > 110) left += 1;
    let right = 0;
    while (image.luminance(cx + right, cy) > 110) right += 1;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });
});

test.describe('input', () => {
  test('turns by exactly counts times rate, the same at any frame cap', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    const rate = await page.evaluate(() => window.__vernier.view.radiansPerCountX);

    const turn = async (cap) => {
      await page.evaluate((fps) => {
        const game = window.__vernier;
        game.loop.setCap(fps);
        game.view.setAngles(0, 0);
      }, cap);
      await page.mouse.move(100, 300);
      await page.waitForTimeout(100);
      const before = await page.evaluate(() => window.__vernier.view.yaw);
      for (let i = 1; i <= 40; i += 1) await page.mouse.move(100 + i * 5, 300);
      await page.waitForTimeout(100);
      return (await page.evaluate(() => window.__vernier.view.yaw)) - before;
    };

    for (const cap of [30, 60, 0]) expect(await turn(cap)).toBeCloseTo(-200 * rate, 8);
  });

  test('counts every click, even many inside a single frame', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    const stats = await page.evaluate(() => {
      const game = window.__vernier;
      game.view.setAngles(Math.PI, 0);
      for (let i = 0; i < 500; i += 1) {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
        document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      }
      return game.mode.recorder.shots;
    });
    expect(stats).toBe(500);
  });

  test('every shot shows on the very next frame', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    const result = await page.evaluate(async () => {
      const game = window.__vernier;
      const { weapon, effects } = game.renderer;
      let waiting = false;
      let shown = 0;
      let missed = 0;
      const render = game.renderer.render.bind(game.renderer);
      game.renderer.render = () => {
        if (waiting) {
          waiting = false;
          if (weapon.flash.visible && effects.time.value >= weapon.lastShot / 1000) shown += 1;
          else missed += 1;
        }
        render();
      };
      for (let i = 0; i < 60; i += 1) {
        await new Promise((settle) => setTimeout(settle, 5 + Math.random() * 30));
        const [target] = game.targets.active;
        game.view.setAngles(target.yaw, target.pitch);
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
        waiting = true;
      }
      return { shown, missed };
    });
    expect(result.missed).toBe(0);
    expect(result.shown).toBeGreaterThan(0);
  });

  test('times a shot from the click itself', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    const offset = await page.evaluate(async () => {
      const game = window.__vernier;
      const [target] = game.targets.active;
      game.view.setAngles(target.yaw, target.pitch);
      const event = new MouseEvent('mousedown', { button: 0 });
      const expected = game.mode.clock.elapsedAt(event.timeStamp);
      await new Promise((settle) => setTimeout(settle, 60));
      document.dispatchEvent(event);
      return game.mode.recorder.lastHitTime - expected;
    });
    expect(Math.abs(offset)).toBeLessThan(1);
  });

  test('recoil and animation never move the aim', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'gridshot', { duration: 60 });
    const drift = await page.evaluate(async () => {
      const game = window.__vernier;
      game.view.setAngles(0.4, 0.2);
      const { yaw, pitch } = game.view;
      for (let i = 0; i < 30; i += 1) {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
        document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
        await new Promise(requestAnimationFrame);
      }
      return { yaw: game.view.yaw - yaw, pitch: game.view.pitch - pitch };
    });
    expect(drift).toEqual({ yaw: 0, pitch: 0 });
  });

  test('other mouse buttons never fire, and the browser menu stays away during play', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.mouse.down({ button: 'middle' });
    await page.mouse.up({ button: 'middle' });
    expect((await sessionStats(page)).shots).toBe(0);
    const prevented = await page.evaluate(() => {
      const event = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });

  test('a menu click right after Esc still resumes, without clicking again', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    await page.evaluate(() => document.exitPointerLock());
    await waitForState(page, 'PAUSED');
    await page.getByTestId('pause-resume').click();
    await waitForState(page, 'PLAYING');
  });
});

test.describe('the whole picture', () => {
  test('the room and pistol stay on screen while targets are up', async ({ page }) => {
    await openGame(page, { settings: { graphics: { ...FAST_SETTINGS.graphics, renderScale: 1 } } });
    await startSession(page, 'gridshot', { duration: 60 });
    await page.evaluate(() => {
      const game = window.__vernier;
      game.loop.stop();
      game.hud.setVisible(false);
      game.frame(0.016, performance.now(), 16);
    });
    const image = await pixels(page);

    // Discs on a blank background score about 75 here, and the full room about 190.
    const levels = new Set();
    for (let y = 0; y < image.height; y += 3) {
      for (let x = 0; x < image.width; x += 3) levels.add(Math.round(image.luminance(x, y)));
    }
    expect(levels.size).toBeGreaterThan(120);

    // The pistol's dark parts are in the lower right, where no target is placed in this view.
    let dark = 0;
    for (let y = Math.round(image.height * 0.7); y < image.height; y += 2) {
      for (let x = Math.round(image.width * 0.6); x < image.width; x += 2) {
        if (image.luminance(x, y) < 60) dark += 1;
      }
    }
    expect(dark).toBeGreaterThan(30);
  });

  test('the room also survives the target pass with post-processing on', async ({ page }) => {
    await openGame(page, { settings: { graphics: { ...FAST_SETTINGS.graphics, renderScale: 1, postprocessing: true } } });
    await startSession(page, 'gridshot', { duration: 60 });
    await page.evaluate(() => {
      const game = window.__vernier;
      game.loop.stop();
      game.hud.setVisible(false);
      game.frame(0.016, performance.now(), 16);
    });
    const image = await pixels(page);
    const levels = new Set();
    for (let y = 0; y < image.height; y += 3) {
      for (let x = 0; x < image.width; x += 3) levels.add(Math.round(image.luminance(x, y)));
    }
    expect(levels.size).toBeGreaterThan(120);
  });

  test('targets still show in the floor reflection', async ({ page }) => {
    await openGame(page, { settings: { graphics: { ...FAST_SETTINGS.graphics, reflections: 'planar' } } });
    await startSession(page, 'precision');
    const inReflectionPass = await page.evaluate(() => {
      const { targets, reflection } = window.__vernier.renderer;
      return targets.mesh.layers.test(reflection.camera.layers);
    });
    expect(inReflectionPass).toBe(true);
  });
});

test.describe('target clarity', () => {
  test('the pistol can never hide a target', async ({ page }) => {
    await openGame(page);
    await startSession(page, 'precision');
    // Finds a dark part of the pistol on screen, then puts a target exactly behind it.
    await page.evaluate(() => {
      const game = window.__vernier;
      game.loop.stop();
      game.targets.clear();
      game.hud.setVisible(false);
      game.view.setAngles(0, 10 * Math.PI / 180);
      game.frame(0.016, performance.now(), 16);
    });
    const before = await pixels(page);
    let spot = null;
    for (let y = before.height - 20; y > before.height * 0.6 && !spot; y -= 4) {
      for (let x = before.width - 20; x > before.width * 0.6 && !spot; x -= 4) {
        if (before.luminance(x, y) < 50) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();

    await page.evaluate(({ x, y }) => {
      const game = window.__vernier;
      const { camera } = game.renderer;
      const inv = camera.projectionMatrixInverse.elements;
      const vx = inv[0] * ((x / innerWidth) * 2 - 1);
      const vy = inv[5] * (1 - (y / innerHeight) * 2);
      const w = camera.matrixWorld.elements;
      const dx = w[0] * vx + w[4] * vy - w[8];
      const dy = w[1] * vx + w[5] * vy - w[9];
      const dz = w[2] * vx + w[6] * vy - w[10];
      const length = Math.hypot(dx, dy, dz);
      game.targets.spawn(Math.atan2(-dx, -dz), Math.asin(dy / length), 0.8, 0);
      game.frame(0.016, performance.now(), 16);
    }, spot);
    const after = await pixels(page);
    expect(after.luminance(spot.x, spot.y)).toBeGreaterThan(150);
  });

  test('warns when the crosshair would disappear on the targets', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('settings-targets').click();
    await page.getByRole('button', { name: 'Black' }).click();
    await page.getByTestId('settings-crosshair').click();
    await expect(page.getByTestId('crosshair-contrast')).toBeVisible();
    await page.getByRole('button', { name: 'White' }).first().click();
    await expect(page.getByTestId('crosshair-contrast')).toBeHidden();
  });
});

test.describe('settings apply where they should', () => {
  test('a target size changed on the Ready screen applies to that session', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-play').click();
    await waitForState(page, 'READY');
    const before = await page.evaluate(() => window.__vernier.targets.active[0].radius);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('settings-targets').click();
    await page.getByRole('spinbutton', { name: 'Target size, exact value' }).fill('1.5');
    await page.getByTestId('settings-close').click();
    await waitForState(page, 'READY');
    const state = await page.evaluate(() => ({
      radius: window.__vernier.targets.active[0].radius,
      standard: window.__vernier.sessionProfile.standard,
    }));
    expect(state.radius).toBeGreaterThan(before * 1.4);
    expect(state.standard).toBe(false);
  });

  test('Esc on the Ready screen goes back to mode selection', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-play').click();
    await waitForState(page, 'READY');
    await page.keyboard.press('Escape');
    await waitForState(page, 'MODE_SELECTION');
  });
});

test.describe('first click', () => {
  test('has every sound prepared before any click happens', async ({ page }) => {
    await openGame(page);
    await page.waitForFunction(() => window.__vernier.audio.pending.length === 0, null, { timeout: 10000 });
    const state = await page.evaluate(() => ({
      prepared: Object.keys(window.__vernier.audio.samples).length,
      context: window.__vernier.audio.context,
    }));
    expect(state).toEqual({ prepared: 9, context: null });
  });

  test('sounds can still be made on demand if a click comes first', async ({ page }) => {
    await openGame(page);
    const names = await page.evaluate(() => {
      const { audio } = window.__vernier;
      // As if the click came straight after loading, with nothing made yet.
      clearTimeout(audio.prepareTimer);
      audio.samples = {};
      audio.pending = ['gunshot', 'hit', 'countdownTick', 'countdownGo', 'uiHover', 'uiConfirm', 'sessionComplete', 'personalBest', 'ambient'];
      audio.initialise();
      return { pending: audio.pending.length, buffers: Object.keys(audio.buffers).length };
    });
    expect(names.pending).toBe(0);
    expect(names.buffers).toBe(9);
  });

  test('sounds are ready to play after a click', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('menu-about').click();
    const names = await page.evaluate(() => Object.keys(window.__vernier.audio.buffers));
    expect(names).toEqual(expect.arrayContaining(['gunshot', 'hit', 'countdownTick', 'countdownGo', 'uiHover', 'uiConfirm', 'sessionComplete', 'personalBest', 'ambient']));
  });
});

test.describe('rendering robustness', () => {
  test('the canvas is opaque and nothing limits the frame rate by default', async ({ page }) => {
    await openGame(page, { settings: { graphics: FAST_SETTINGS.graphics } });
    const state = await page.evaluate(() => {
      const game = window.__vernier;
      return { alpha: game.renderer.gl.getContextAttributes().alpha, cap: game.loop.minimumInterval };
    });
    expect(state).toEqual({ alpha: false, cap: 0 });
  });

  test('survives a lost graphics context, pausing rather than continuing blind', async ({ page }) => {
    const errors = await openGame(page);
    await startSession(page, 'gridshot', { duration: 30 });
    await page.evaluate(() => {
      window.__loseContext = window.__vernier.renderer.gl.getContext().getExtension('WEBGL_lose_context');
      window.__loseContext.loseContext();
    });
    await waitForState(page, 'PAUSED');
    await page.evaluate(() => window.__loseContext.restoreContext());
    await page.waitForFunction(() => !window.__vernier.renderer.gl.getContext().isContextLost());
    await page.waitForTimeout(1600);
    await page.getByTestId('pause-resume').click();
    await waitForState(page, 'PLAYING');
    await page.waitForTimeout(200);
    // The browser logs its own note about the lost context. Only real failures count here.
    expect(errors.filter((message) => !/context lost|Context Lost/i.test(message))).toEqual([]);
  });

  test('explains the problem when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.goto('/?debug');
    await expect(page.getByRole('heading', { name: "Vernier couldn't start its graphics" })).toBeVisible();
  });

  for (const [name, width, height] of [['small', 1024, 600], ['ultrawide', 3440, 1440], ['narrow', 1000, 1100]]) {
    test(`keeps the pistol in the lower right, and menus on screen, at ${name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await openGame(page);
      const bottom = await page.evaluate(() =>
        Math.max(...[...document.querySelectorAll('[data-testid^=menu-]')].map((node) => node.getBoundingClientRect().bottom)));
      expect(bottom).toBeLessThan(height);

      await page.getByTestId('menu-play').click();
      await waitForState(page, 'READY');
      const screenX = await page.evaluate(() => {
        const { weapon } = window.__vernier.renderer;
        const { x, z } = weapon.root.position;
        const halfWidth = Math.tan((weapon.camera.fov * Math.PI) / 360) * weapon.camera.aspect;
        return x / -z / halfWidth;
      });
      // As a share of the half-width right of centre, whatever the window's shape.
      expect(screenX).toBeGreaterThan(0.45);
      expect(screenX).toBeLessThan(0.7);
      await context.close();
    });
  }
});

test.describe('floor', () => {
  test('targets stay above the floor at maximum spawn area and size in a real session', async ({ page }) => {
    await openGame(page, { settings: { ...FAST_SETTINGS, targets: { spawnArea: 1.5, size: 2 } } });
    await startSession(page, 'precision');
    const lowest = await page.evaluate(() => {
      const game = window.__vernier;
      let low = Infinity;
      for (let i = 0; i < 400; i += 1) {
        const [target] = game.targets.active;
        low = Math.min(low, target.y - target.radius);
        game.view.setAngles(target.yaw, target.pitch);
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      }
      return low;
    });
    expect(lowest).toBeGreaterThan(0.2);
  });
});
