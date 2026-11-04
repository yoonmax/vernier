import {
  Group,
  HalfFloatType,
  NeutralToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ARENA_HEIGHT, EYE } from '../core/constants.js';
import { HitEffects } from '../shooting/HitEffects.js';
import { Arena } from './Arena.js';
import { verticalFovDegrees } from './CameraController.js';
import { Lighting } from './Lighting.js';
import { PlanarReflection } from './PlanarReflection.js';
import { TargetVisuals } from './TargetVisuals.js';
import { THEMES, targetPalette } from './themes.js';
import { WeaponViewModel } from './WeaponViewModel.js';

const MAX_DEVICE_PIXEL_RATIO = 2;
/** The menu shoots the room through a longer lens, like product photography. Never used in play. */
const MENU_LENS_FOV = 30;
/** Targets draw in their own pass after the pistol, so the pistol can never hide one. */
const TARGET_LAYER = 1;
/** The far edge of the floor as seen from the eye: arctan(eye height / room radius). */
const FLOOR_HORIZON_DEGREES = 5.4;

const usesPostProcessing = (graphics) => graphics.postprocessing || graphics.ambientOcclusion === 'full';

/** With post-processing, anti-aliasing happens in the render target rather than the context. */
const wantsContextAntialias = (graphics) => graphics.antialiasing && !usesPostProcessing(graphics);

/** Draws the first-person pistol over the world inside a post-processing chain. */
class WeaponPass extends Pass {
  /** @param {Renderer} owner */
  constructor(owner) {
    super();
    this.owner = owner;
    this.weapon = owner.weapon;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.owner.showWeapon && this.weapon.visible) {
      renderer.clearDepth();
      renderer.render(this.weapon.scene, this.weapon.camera);
    }
    this.owner.renderTargetPass();
    renderer.autoClear = autoClear;
  }
}

/**
 * Owns the WebGL context and draws the frame.
 *
 * Default path: reflection pass, world, weapon, straight to the screen, with no intermediate
 * full-screen buffers between the game and the display. Post-processing is an opt-in path
 * that only runs when the player turns on an effect that requires it.
 */
export class Renderer {
  /**
   * @param {HTMLElement} container
   * @param {object} graphics initial graphics settings, which decide how the context is made
   */
  constructor(container, graphics) {
    this.container = container;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(70, 16 / 9, 0.1, 80);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(EYE.x, EYE.y, EYE.z);

    this.arena = new Arena();
    this.scene.add(this.arena.group);
    this.lighting = new Lighting(this.scene);
    this.targets = new TargetVisuals(this.scene);
    this.targets.mesh.layers.set(TARGET_LAYER);
    this.lighting.hemisphere.layers.enable(TARGET_LAYER);
    this.lighting.key.layers.enable(TARGET_LAYER);
    this.effects = new HitEffects(this.scene);
    this.reflection = new PlanarReflection(this.arena.reflectionUniforms);
    this.weapon = new WeaponViewModel();

    // A display copy of the pistol for the main menu. Shares the first-person geometry.
    this.display = new Group();
    this.displayPistol = new Group();
    this.displayPistol.add(...this.weapon.createFrameMeshes(), ...this.weapon.createSlideMeshes());
    this.displayPistol.scale.setScalar(15);
    this.display.add(this.displayPistol);
    this.display.visible = false;
    this.scene.add(this.display);

    this.showWeapon = false;
    this.menuLens = false;
    this.horizontalFov = 103;
    this.theme = null;
    this.graphics = null;
    this.environment = null;
    this.gl = null;
    this.composer = null;
    this.size = new Vector2();
    this.drawingSize = new Vector2();

    this.createContext(wantsContextAntialias(graphics));
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  /** Antialiasing on the default framebuffer can only be chosen when a context is created. */
  createContext(antialias) {
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    // Made by hand because Three.js otherwise asks for an alpha channel. An opaque canvas
    // tells the browser that nothing behind it needs compositing.
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!context) throw new Error('WebGL 2 is not available');
    const gl = new WebGLRenderer({ canvas, context, antialias });
    canvas.addEventListener('webglcontextlost', () => this.onContextLost?.());
    canvas.addEventListener('webglcontextrestored', () => this.handleContextRestored());
    gl.toneMapping = NeutralToneMapping;
    // Set as the clear colour rather than scene.background, because Three.js clears the whole
    // screen when it renders a scene with a colour background, and the target pass draws last.
    if (this.theme) gl.setClearColor(this.theme.background);
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFShadowMap;
    // The room's shadows never change once rendered. Only re-render them on request.
    gl.shadowMap.autoUpdate = false;
    gl.autoClear = false;
    this.contextAntialias = antialias;

    if (this.gl) {
      this.gl.domElement.remove();
      this.gl.dispose();
      this.gl.forceContextLoss();
    }
    this.gl = gl;
    this.container.prepend(canvas);
  }

  get canvas() {
    return this.gl.domElement;
  }

  /** After a GPU reset, everything drawn only once has to be drawn again. */
  handleContextRestored() {
    if (this.theme) this.captureEnvironment(this.theme);
    this.gl.shadowMap.needsUpdate = true;
  }

  /**
   * Draws the targets last, over a clean depth buffer. They are in front of the room from the
   * fixed eye anyway, so this only changes one thing: the pistol can never cover a target.
   */
  renderTargetPass() {
    if (this.targets.mesh.count === 0) return;
    const { gl, camera, scene } = this;
    gl.clearDepth();
    camera.layers.set(TARGET_LAYER);
    gl.render(scene, camera);
    camera.layers.set(0);
  }

  /** The reflection only needs drawing when some of the floor is in view. */
  floorInView() {
    const lowestViewDegrees = (this.camera.rotation.x * 180) / Math.PI - this.camera.fov / 2;
    return this.menuLens || lowestViewDegrees < -FLOOR_HORIZON_DEGREES;
  }

  /** Applies graphics settings, doing only the work each change actually needs. */
  applyGraphics(graphics) {
    const previous = this.graphics;
    this.graphics = graphics;

    const contextAntialias = wantsContextAntialias(graphics);
    const contextChanged = contextAntialias !== this.contextAntialias;
    if (contextChanged) {
      this.disposeComposer();
      this.reflection.dispose();
      this.createContext(contextAntialias);
    }

    this.updateSize();

    const shadowChanged = this.lighting.applyShadowQuality(graphics.shadows);
    this.targets.setShadow(this.theme?.shadowStrength ?? 0.3, graphics.shadows !== 'off');
    if (shadowChanged || contextChanged) this.gl.shadowMap.needsUpdate = true;
    // The environment map belonged to the old context, so a new context must capture its own.
    if (contextChanged && this.theme) this.captureEnvironment(this.theme);

    this.arena.setOcclusionEnabled(graphics.ambientOcclusion !== 'off');

    const wantsReflection = graphics.reflections === 'planar';
    this.reflection.setEnabled(wantsReflection, this.drawingSize.x, this.drawingSize.y);
    this.applyReflectionStrength();

    this.configureComposer(graphics, previous);
  }

  applyReflectionStrength() {
    const uniforms = this.arena.reflectionUniforms;
    const enabled = this.graphics?.reflections === 'planar' && this.theme;
    uniforms.uReflectionBase.value = enabled ? this.theme.reflectionBase : 0;
    uniforms.uReflectionEdge.value = enabled ? this.theme.reflectionEdge : 0;
  }

  configureComposer(graphics, previous) {
    const usesComposer = usesPostProcessing(graphics);
    const unchanged =
      this.composer &&
      previous &&
      previous.postprocessing === graphics.postprocessing &&
      previous.ambientOcclusion === graphics.ambientOcclusion &&
      previous.antialiasing === graphics.antialiasing;
    if (!usesComposer) {
      this.disposeComposer();
      return;
    }
    if (unchanged) return;
    this.disposeComposer();

    const { x, y } = this.drawingSize;
    const target = new WebGLRenderTarget(x, y, {
      type: HalfFloatType,
      samples: graphics.antialiasing ? 4 : 0,
    });
    const composer = new EffectComposer(this.gl, target);
    composer.setPixelRatio(this.gl.getPixelRatio());
    composer.setSize(this.size.x, this.size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (graphics.ambientOcclusion === 'full') {
      const gtao = new GTAOPass(this.scene, this.camera, x, y);
      gtao.blendIntensity = 0.85;
      // More denoising samples than the default, or the bright room shows the AO's grain.
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, radiusExponent: 1.5, rings: 2, samples: 16 });
      composer.addPass(gtao);
    }
    composer.addPass(new WeaponPass(this));
    if (graphics.postprocessing) {
      // Restrained on purpose: only the actual light sources should bloom.
      composer.addPass(new UnrealBloomPass(new Vector2(x, y), 0.14, 0.5, 1.15));
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  disposeComposer() {
    if (!this.composer) return;
    this.composer.passes.forEach((pass) => pass.dispose?.());
    this.composer.dispose();
    this.composer = null;
  }

  applyTheme(themeId) {
    if (this.themeId === themeId) return;
    this.themeId = themeId;
    const theme = THEMES[themeId] ?? THEMES['white-lab'];
    this.theme = theme;

    this.gl.setClearColor(theme.background);
    this.arena.applyTheme(theme);
    this.lighting.applyTheme(theme);
    this.effects.applyTheme(theme);
    this.weapon.setTheme(theme);
    this.targets.setShadow(theme.shadowStrength, this.graphics?.shadows !== 'off');
    this.gl.toneMappingExposure = theme.exposure;
    this.applyReflectionStrength();
    this.captureEnvironment(theme);
    this.gl.shadowMap.needsUpdate = true;
  }

  /**
   * Renders the room into a pre-filtered environment map once. Every glossy surface then
   * reflects this exact room, at no per-frame cost.
   */
  captureEnvironment(theme) {
    this.scene.environment = null;
    const targetsVisible = this.targets.mesh.visible;
    const displayVisible = this.display.visible;
    this.targets.mesh.visible = false;
    this.targets.shadows.visible = false;
    this.display.visible = false;
    this.effects.shards.visible = false;
    this.effects.pulses.visible = false;

    const generator = new PMREMGenerator(this.gl);
    const renderTarget = generator.fromScene(this.scene, 0.02, 0.1, 60, {
      size: 256,
      position: new Vector3(0, ARENA_HEIGHT * 0.42, 0),
    });
    generator.dispose();
    this.environment?.dispose();
    this.environment = renderTarget;

    this.scene.environment = renderTarget.texture;
    this.scene.environmentIntensity = theme.environmentStrength;
    this.weapon.setEnvironment(renderTarget.texture);

    this.targets.mesh.visible = targetsVisible;
    this.targets.shadows.visible = this.graphics?.shadows !== 'off';
    this.display.visible = displayVisible;
    this.effects.shards.visible = true;
    this.effects.pulses.visible = true;
  }

  setMenuLens(enabled) {
    if (this.menuLens === enabled) return;
    this.menuLens = enabled;
    this.updateProjection();
  }

  setFov(horizontalDegrees) {
    this.horizontalFov = horizontalDegrees;
    this.updateProjection();
  }

  updateProjection() {
    const aspect = this.size.y > 0 ? this.size.x / this.size.y : 16 / 9;
    this.camera.aspect = aspect;
    this.camera.fov = this.menuLens ? MENU_LENS_FOV : verticalFovDegrees(this.horizontalFov, aspect);
    this.camera.updateProjectionMatrix();
    this.weapon.setAspect(aspect);
  }

  handleResize() {
    this.updateSize();
  }

  updateSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.size.set(width, height);
    // Re-read the ratio every time: a window can move to a display with a different one.
    const scale = this.graphics?.renderScale ?? 1;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO) * scale);
    this.gl.setSize(width, height, false);
    this.gl.getDrawingBufferSize(this.drawingSize);
    this.updateProjection();
    this.reflection.setSize(this.drawingSize.x, this.drawingSize.y);
    this.composer?.setPixelRatio(this.gl.getPixelRatio());
    this.composer?.setSize(width, height);
  }

  /** Compiles every shader in advance, so the first shot of a session can't hitch. */
  precompile() {
    this.gl.compile(this.scene, this.camera);
    this.gl.compile(this.weapon.scene, this.weapon.camera);
  }

  render() {
    const { gl, scene, camera, weapon } = this;

    if (this.graphics?.reflections === 'planar' && this.floorInView()) {
      this.reflection.render(gl, scene, camera, this.arena.floor);
    }

    if (this.composer) {
      this.composer.render();
      return;
    }

    gl.setRenderTarget(null);
    gl.clear();
    gl.render(scene, camera);
    if (this.showWeapon && weapon.visible) {
      gl.clearDepth();
      gl.render(weapon.scene, weapon.camera);
    }
    this.renderTargetPass();
  }

  /** Passes the player's target settings to the target and effect renderers. */
  applyTargetSettings(targets) {
    const palette = targetPalette(targets.color);
    this.targets.configure({
      color: palette.face,
      border: palette.border,
      borderThickness: targets.borderThickness,
      opacity: targets.opacity,
      centerMarker: targets.centerMarker,
      glow: this.theme?.targetGlow ?? 0.1,
    });
    this.effects.setTargetColors(palette.face, palette.border);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.disposeComposer();
    this.reflection.dispose();
    this.environment?.dispose();
    this.gl.dispose();
    this.gl.domElement.remove();
  }
}
