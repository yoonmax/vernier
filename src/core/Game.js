import { AudioManager } from '../audio/AudioManager.js';
import { MouseInput } from '../input/MouseInput.js';
import { PointerLockManager } from '../input/PointerLockManager.js';
import { getMode, isEndless, variantKey, variantLabel } from '../modes/modeCatalog.js';
import { CameraController } from '../rendering/CameraController.js';
import { Renderer } from '../rendering/Renderer.js';
import { runProfile } from '../settings/SettingsSchema.js';
import { intersectRoom } from '../shooting/RaycastManager.js';
import { ShootingSystem } from '../shooting/ShootingSystem.js';
import { StatisticsManager } from '../stats/StatisticsManager.js';
import { browserStorage } from '../settings/SettingsStorage.js';
import { TargetManager } from '../targets/TargetManager.js';
import { SeededRandom, parseSeed, randomSeed } from '../utils/rng.js';
import { ARENA_HEIGHT, ARENA_RADIUS, EYE, ZONE_CENTER_PITCH } from './constants.js';
import { FrameStats } from './FrameStats.js';
import { GameLoop } from './GameLoop.js';
import { GameState, GameStateMachine } from './GameStateMachine.js';

const COUNTDOWN_STEP_MS = 520;
const COUNTDOWN_VALUES = ['3', '2', '1'];
const HUD_INTERVAL_MS = 80;
const FPS_INTERVAL_MS = 250;
const LOCK_RETRIES = 6;
const LOCK_RETRY_MS = 300;

const GAMEPLAY_STATES = new Set([GameState.READY, GameState.COUNTDOWN, GameState.PLAYING, GameState.PAUSED]);

/**
 * Connects the systems. Modes hold the rules, ShootingSystem resolves shots, Renderer draws,
 * React draws the menus, and this class routes between them. It holds no game rules itself.
 */
export class Game {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {import('zustand/vanilla').StoreApi<any>} options.settingsStore
   * @param {import('zustand/vanilla').StoreApi<any>} options.appStore
   */
  constructor({ container, settingsStore, appStore }) {
    this.settingsStore = settingsStore;
    this.appStore = appStore;
    this.machine = new GameStateMachine();
    this.statistics = new StatisticsManager(browserStorage());
    this.frameStats = new FrameStats();
    this.audio = new AudioManager();

    this.view = new CameraController();
    this.targets = new TargetManager();
    this.shooting = new ShootingSystem(this.view, this.targets);
    this.renderer = new Renderer(container, settingsStore.getState().settings.graphics);

    this.renderer.onContextLost = () => this.pause();
    this.lock = new PointerLockManager(this.renderer.canvas);
    this.lock.onChange = (locked) => this.handleLockChange(locked);

    this.input = new MouseInput({
      onMove: (dx, dy) => this.view.applyMouseDelta(dx, dy),
      onTriggerDown: (eventTime) => this.handleTriggerDown(eventTime),
      onTriggerUp: () => this.handleTriggerUp(),
    });

    /** @type {import('../modes/GameMode.js').GameMode|null} */
    this.mode = null;
    this.modeDefinition = null;
    this.modeOptions = null;
    this.sessionProfile = null;
    this.sessionSeed = 0;
    this.triggerHeld = false;
    this.countdownStartedAt = 0;
    this.countdownIndex = -1;
    this.goUntil = 0;
    this.lastHudUpdate = 0;
    this.lastFpsUpdate = 0;
    this.hud = null;
    this.menuTime = 0;
    this.impact = { x: 0, y: 0, z: 0, surface: 'wall' };
    this.direction = { x: 0, y: 0, z: -1 };
    this.previousSettings = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.loop = new GameLoop((delta, now, frameMs) => this.frame(delta, now, frameMs));

    this.applySettings(settingsStore.getState().settings);
    this.unsubscribeSettings = settingsStore.subscribe((state) => this.applySettings(state.settings));
    this.unsubscribeMachine = this.machine.subscribe((next) => this.handleStateChange(next));

    this.handleVisibility = () => {
      if (document.hidden) this.pauseForFocusLoss();
    };
    this.handleBlur = () => this.pauseForFocusLoss();
    this.handleFullscreen = () => {
      this.appStore.setState({ fullscreen: Boolean(document.fullscreenElement) });
    };
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('fullscreenchange', this.handleFullscreen);

    this.renderer.precompile();
    this.enterMenuView();
    this.handleStateChange(this.machine.state);
    this.loop.start();
    this.appStore.setState({ ready: true });
  }

  // Settings ---------------------------------------------------------------------------

  /** Applies only what changed, so settings can update live, even during a paused session. */
  applySettings(settings) {
    const previous = this.previousSettings;
    this.previousSettings = settings;
    const changed = (category) => !previous || previous[category] !== settings[category];

    if (changed('mouse') || changed('camera')) {
      this.view.configure({
        sensitivity: settings.mouse.sensitivity,
        verticalMultiplier: settings.mouse.verticalMultiplier,
        invertY: settings.mouse.invertY,
        pitchLimitDegrees: settings.camera.pitchLimit,
      });
      this.renderer.setFov(settings.camera.fov);
    }
    if (changed('graphics')) {
      const { graphics } = settings;
      const canvasBefore = this.renderer.canvas;
      this.renderer.applyTheme(graphics.theme);
      this.renderer.applyGraphics(graphics);
      if (this.renderer.canvas !== canvasBefore) this.lock.setElement(this.renderer.canvas);
      this.loop.setCap(graphics.fpsCap);
      document.documentElement.dataset.theme = graphics.theme;
    }
    if (changed('targets') || changed('graphics')) {
      this.renderer.applyTargetSettings(settings.targets);
      this.renderer.effects.configure({
        intensity: settings.targets.hitEffects,
        particles: settings.graphics.particles,
      });
    }
    if (changed('weapon')) this.renderer.weapon.configure(settings.weapon);
    if (changed('audio')) this.audio.configure(settings.audio);
    if (changed('interface')) this.hud?.applyInterface(settings.interface);
    if (changed('crosshair')) this.hud?.applyCrosshair(settings.crosshair);
  }

  /** The HUD registers itself on mount. Game writes to it directly, without going through React. */
  attachHud(hud) {
    this.hud = hud;
    if (hud) {
      const { settings } = this.settingsStore.getState();
      hud.applyInterface(settings.interface);
      hud.applyCrosshair(settings.crosshair);
    }
  }

  // State ------------------------------------------------------------------------------

  handleStateChange(state) {
    this.appStore.setState({ screen: state });
    const { previous } = this.machine;
    const settingsOverSession =
      state === GameState.SETTINGS && (previous === GameState.PAUSED || previous === GameState.READY);
    const firstPerson = GAMEPLAY_STATES.has(state) || state === GameState.RESULTS || settingsOverSession;

    this.renderer.showWeapon = firstPerson && state !== GameState.RESULTS;
    this.renderer.setMenuLens(!firstPerson);
    this.input.setActive(state === GameState.PLAYING || state === GameState.COUNTDOWN);
    this.hud?.setVisible(state === GameState.PLAYING || state === GameState.COUNTDOWN || state === GameState.PAUSED);
    if (firstPerson) this.renderer.display.visible = false;
    else this.enterMenuView();
  }

  enterMenuView() {
    this.targets.clear();
    this.renderer.targets.sync(this.targets);
    this.renderer.display.visible = true;
    this.renderer.showWeapon = false;
  }

  goTo(state) {
    return this.machine.transition(state);
  }

  openModeSelection() {
    this.discardSession();
    this.goTo(GameState.MODE_SELECTION);
  }

  openMainMenu() {
    this.discardSession();
    this.goTo(GameState.MAIN_MENU);
  }

  openStatistics() {
    this.goTo(GameState.STATISTICS);
  }

  openAbout() {
    this.goTo(GameState.ABOUT);
  }

  openSettings() {
    this.appStore.setState({ settingsReturn: this.machine.state });
    this.goTo(GameState.SETTINGS);
  }

  closeSettings() {
    const destination = this.appStore.getState().settingsReturn;
    // A session waiting on Ready hasn't begun, so it should pick up the new target settings.
    if (destination === GameState.READY) this.prepareSession();
    this.goTo(destination);
  }

  // Session ----------------------------------------------------------------------------

  /** Builds a fresh session for the selected mode and places the player at the eye point. */
  prepareSession() {
    this.discardSession();
    const app = this.appStore.getState();
    const definition = getMode(app.modeId);
    const options = app.currentOptions();
    const { settings } = this.settingsStore.getState();

    this.modeDefinition = definition;
    this.modeOptions = options;
    this.sessionProfile = runProfile(settings);
    this.sessionSeed = parseSeed(settings.targets.seed) ?? randomSeed();

    this.mode = definition.create(options, {
      targets: this.targets,
      rng: new SeededRandom(this.sessionSeed),
      shooting: this.shooting,
      sizeScale: settings.targets.size,
      areaScale: settings.targets.spawnArea,
      isTriggerHeld: () => this.triggerHeld,
      onFinish: () => this.handleSessionFinished(),
    });
    this.mode.initialize();

    this.frameStats.reset();
    this.placeCameraAtEye();
    this.renderer.targets.setHighlight(false);
    this.renderer.targets.sync(this.targets);
    this.hud?.reset(definition);
    this.updateHud();
  }

  placeCameraAtEye() {
    this.view.setAngles(0, ZONE_CENTER_PITCH);
    const { camera } = this.renderer;
    camera.position.set(EYE.x, EYE.y, EYE.z);
    this.view.applyTo(camera);
  }

  discardSession() {
    this.mode = null;
    this.triggerHeld = false;
    this.audio.setContact(false);
    this.targets.clear();
    this.renderer.targets.sync(this.targets);
  }

  /** Called from the mode screen's Start button. The next click takes pointer lock. */
  openReady() {
    this.prepareSession();
    this.renderer.display.visible = false;
    this.appStore.setState({ lockError: null, countdown: null });
    this.goTo(GameState.READY);
  }

  /** Must run inside a click handler: browsers require a gesture for pointer lock. */
  async beginSession() {
    if (this.machine.state !== GameState.READY || !this.mode) return;
    const locked = await this.acquireLock();
    if (!locked || this.machine.state !== GameState.READY) return;
    this.startCountdownOrPlay();
  }

  /** Retry from Results: the button click is itself a valid gesture. */
  async retry() {
    this.openReady();
    await this.beginSession();
  }

  restartFromPause() {
    this.openReady();
  }

  startCountdownOrPlay() {
    const { settings } = this.settingsStore.getState();
    const endless = isEndless(this.modeDefinition, this.modeOptions);
    if (settings.interface.skipCountdown && endless) {
      this.startPlaying();
      return;
    }
    this.countdownIndex = -1;
    this.countdownStartedAt = performance.now();
    this.goTo(GameState.COUNTDOWN);
  }

  startPlaying() {
    this.appStore.setState({ countdown: 'GO' });
    this.goUntil = performance.now() + 260;
    this.mode.start();
    this.goTo(GameState.PLAYING);
    this.audio.play('countdownGo', 'ui');
    this.updateHud();
  }

  updateCountdown(now) {
    const index = Math.floor((now - this.countdownStartedAt) / COUNTDOWN_STEP_MS);
    if (index >= COUNTDOWN_VALUES.length) {
      this.startPlaying();
      return;
    }
    if (index !== this.countdownIndex) {
      this.countdownIndex = index;
      this.appStore.setState({ countdown: COUNTDOWN_VALUES[index] });
      this.audio.play('countdownTick', 'ui');
    }
  }

  pause() {
    const { state } = this.machine;
    if (state !== GameState.PLAYING && state !== GameState.COUNTDOWN) return;
    this.mode?.pause();
    this.triggerHeld = false;
    this.audio.setContact(false);
    this.appStore.setState({ countdown: null });
    this.goTo(GameState.PAUSED);
    this.lock.exit();
  }

  pauseForFocusLoss() {
    this.pause();
  }

  /** Must run inside a click handler. */
  async resume() {
    if (this.machine.state !== GameState.PAUSED) return;
    const locked = await this.acquireLock();
    if (!locked || this.machine.state !== GameState.PAUSED || !this.mode) return;
    if (!this.mode.started) {
      // Paused during the countdown: nothing had begun, so run the countdown again.
      this.startCountdownOrPlay();
      return;
    }
    this.mode.resume();
    this.goTo(GameState.PLAYING);
    this.updateHud();
  }

  /** Ends an endless session on purpose and goes to results. */
  endSession() {
    if (this.machine.state !== GameState.PAUSED || !this.mode?.started) return;
    this.mode.finish('manual');
  }

  async acquireLock() {
    const { settings } = this.settingsStore.getState();
    const stateAtRequest = this.machine.state;
    let outcome = await this.lock.request(settings.mouse.rawInput);
    // Browsers refuse to lock again for about a second after Esc. The click still counts as a
    // gesture for a few seconds, so keep trying rather than making the player click again.
    for (let attempt = 0; attempt < LOCK_RETRIES && outcome.reason === 'cooldown'; attempt += 1) {
      await new Promise((settle) => setTimeout(settle, LOCK_RETRY_MS));
      if (this.machine.state !== stateAtRequest) return false;
      outcome = await this.lock.request(settings.mouse.rawInput);
    }
    if (outcome.ok) {
      this.appStore.setState({ lockError: null, rawInputStatus: this.lock.rawStatus });
      return true;
    }
    this.appStore.setState({ lockError: outcome.reason ?? 'failed' });
    return false;
  }

  handleLockChange(locked) {
    if (locked) return;
    // Lock lost during play (Escape, or the OS taking focus) always pauses, and the clock stops.
    this.pause();
  }

  handleSessionFinished() {
    const { mode, modeDefinition, modeOptions, sessionProfile } = this;
    const stats = mode.getStatistics();
    const metric = modeDefinition.metric(modeOptions);
    const variant = variantKey(modeDefinition, modeOptions);
    const label = variantLabel(modeDefinition, modeOptions);
    const previousBest = this.statistics.getPersonalBest(variant);

    const record = stats.shots > 0 || stats.contactMs > 0
      ? this.statistics.recordSession({
          mode: modeDefinition.id,
          variant,
          label,
          metric,
          stats,
          standard: sessionProfile.standard,
        })
      : { isPersonalBest: false, previousBest, metricValue: null, eligible: false };

    this.triggerHeld = false;
    this.audio.setContact(false);
    this.renderer.targets.setHighlight(false);
    this.renderer.targets.sync(this.targets);

    this.appStore.setState({
      countdown: null,
      results: {
        modeId: modeDefinition.id,
        modeName: modeDefinition.name,
        options: modeOptions,
        label,
        stats,
        metric,
        record,
        profile: sessionProfile,
        seed: this.sessionSeed,
      },
    });
    this.goTo(GameState.RESULTS);
    this.audio.play(record.isPersonalBest ? 'personalBest' : 'sessionComplete', 'ui');
    this.lock.exit();
  }

  // Input ------------------------------------------------------------------------------

  handleTriggerDown(eventTime) {
    if (this.machine.state !== GameState.PLAYING || !this.mode || !this.lock.isLocked()) return;
    if (this.mode.usesTriggerHold) {
      this.triggerHeld = true;
      return;
    }
    this.fire(eventTime);
  }

  handleTriggerUp() {
    this.triggerHeld = false;
  }

  /**
   * Runs synchronously inside the mouse event. Audio and hit detection happen here; the
   * pistol and effects only record a start time for the next frame to draw.
   */
  fire(eventTime = performance.now()) {
    const now = performance.now();
    // Timed from when the button went down, not from when the browser got round to telling us.
    const result = this.shooting.fire(this.mode.clock.elapsedAt(eventTime));

    this.audio.play('gunshot', 'gunshot');
    this.renderer.weapon.fire(now);

    if (result.hit) {
      // Read these now: the mode releases the target back to the pool below.
      const { target, point } = result;
      this.renderer.effects.hit(now / 1000, point.x, point.y, point.z, target.nx, target.ny, target.nz, target.radius);
      this.audio.play('hit', 'hit');
      this.hud?.flashHit();
    } else {
      this.markMiss(now);
    }

    this.mode.onShot(result);
    const notice = this.mode.takeNotice?.();
    if (notice) this.hud?.showNotice(notice);
    if (!this.mode.finished) this.updateHud();
  }

  markMiss(now) {
    this.view.getDirection(this.direction);
    if (intersectRoom(EYE, this.direction, ARENA_RADIUS, ARENA_HEIGHT, this.impact)) {
      const { x, y, z } = this.impact;
      // Lift the mark slightly toward the eye so it never sinks into the surface.
      const pull = 0.985;
      this.renderer.effects.miss(
        now / 1000,
        EYE.x + (x - EYE.x) * pull,
        EYE.y + (y - EYE.y) * pull,
        EYE.z + (z - EYE.z) * pull,
      );
    }
  }

  // Frame ------------------------------------------------------------------------------

  frame(deltaSeconds, now, frameMs) {
    const { state } = this.machine;
    this.frameStats.add(frameMs);

    if (state === GameState.COUNTDOWN) this.updateCountdown(now);
    if (state === GameState.PLAYING) this.updateSession(deltaSeconds, now);

    if (this.goUntil && now >= this.goUntil) {
      this.goUntil = 0;
      this.appStore.setState({ countdown: null });
    }

    const { renderer } = this;
    if (this.renderer.display.visible) {
      this.updateMenuCamera(deltaSeconds);
    } else {
        renderer.camera.position.set(EYE.x, EYE.y, EYE.z);
      this.view.applyTo(renderer.camera);
    }
    renderer.targets.sync(this.targets);
    // Animations read the current time, not the frame's timestamp. That timestamp is when the
    // frame began, usually earlier than input handled just before it, which would hold a
    // shot's feedback back for a whole frame.
    const animationTime = performance.now();
    renderer.weapon.update(animationTime, this.view.yaw, this.view.pitch);
    renderer.effects.update(animationTime / 1000);
    renderer.render();

    if (now - this.lastFpsUpdate >= FPS_INTERVAL_MS) {
      this.lastFpsUpdate = now;
      this.hud?.updatePerformance(this.frameStats);
    }
  }

  updateSession(deltaSeconds, now) {
    const { mode } = this;
    if (!mode) return;
    mode.update(deltaSeconds);
    if (!this.mode || mode.finished) return;

    if (mode.usesTriggerHold) {
      const onTarget = mode.onTarget;
      this.audio.setContact(onTarget);
      this.renderer.targets.setHighlight(onTarget);
    }
    if (now - this.lastHudUpdate >= HUD_INTERVAL_MS) this.updateHud();
  }

  /** Writes changed values straight to the HUD's DOM nodes. No React render is involved. */
  updateHud() {
    if (!this.hud || !this.mode) return;
    this.lastHudUpdate = performance.now();
    this.hud.update({
      clock: this.mode.getClock(),
      score: this.mode.getLiveScore(),
      accuracy: this.mode.getLiveAccuracy(),
      progress: this.mode.getProgress(),
    });
  }

  /** The menu's slow orbit around the display pistol. Purely decorative. */
  updateMenuCamera(deltaSeconds) {
    const { camera, displayPistol } = this.renderer;
    this.menuTime += deltaSeconds;
    const t = this.menuTime;
    const reduced = this.reducedMotion.matches;
    const drift = reduced ? 0 : 1;
    camera.position.set(
      -1.5 + Math.sin(t * 0.09) * 0.35 * drift,
      1.25 + Math.sin(t * 0.13) * 0.07 * drift,
      6.5 + Math.cos(t * 0.07) * 0.25 * drift,
    );
    // Frames the pistol right of centre, moving it in as a narrow window loses that room.
    const framing = Math.min(1, camera.aspect / (16 / 9));
    camera.lookAt(0.72 - 1.27 * framing, 2.45, -6);
    displayPistol.position.set(0.72, 2.95, -6.2);
    displayPistol.rotation.set(0.02, -1.14 + (reduced ? 0 : Math.sin(t * 0.14) * 0.12), 0.05);
  }

  requestFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
  }

  dispose() {
    this.loop.stop();
    this.unsubscribeSettings();
    this.unsubscribeMachine();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('fullscreenchange', this.handleFullscreen);
    this.input.dispose();
    this.lock.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
