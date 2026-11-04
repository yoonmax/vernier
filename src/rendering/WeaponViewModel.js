import {
  AdditiveBlending,
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
} from 'three';
import { buildPistolGeometry } from './PistolModel.js';

const VIEW_FOV = 46;

/** Where the pistol sits in view space, for each weapon-position setting. */
const POSITIONS = Object.freeze({
  standard: { x: 0.122, y: -0.12, z: -0.292 },
  low: { x: 0.128, y: -0.142, z: -0.292 },
  compact: { x: 0.15, y: -0.14, z: -0.335 },
});

const REFERENCE_ASPECT = 16 / 9;
const MAX_ASPECT_SCALE = 2;
const SLIDE_TRAVEL = 0.024;
const FLASH_MS = 42;

/** Slide position over time: a very fast rearward stroke and a slightly slower return. */
export function slideCurve(ms) {
  if (ms < 0) return 0;
  if (ms < 22) return ms / 22;
  if (ms < 105) {
    const t = (ms - 22) / 83;
    return 1 - t * t * (3 - 2 * t);
  }
  return 0;
}

/** Visual kick over time: instant onset, smooth return. Never touches the aim direction. */
export function kickCurve(ms) {
  if (ms < 0) return 0;
  if (ms < 16) return ms / 16;
  return Math.exp(-(ms - 16) / 62);
}

function createFlashTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(255,214,160,0.9)');
  gradient.addColorStop(0.42, 'rgba(255,146,70,0.28)');
  gradient.addColorStop(1, 'rgba(255,120,40,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * The first-person pistol has its own scene and camera, drawn after the world with a clean
 * depth buffer. It can't clip into the room, and its look doesn't change with the player's
 * FOV. It only ever reads gameplay state, so it has no influence on aim or hit detection.
 */
export class WeaponViewModel {
  constructor() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(VIEW_FOV, 16 / 9, 0.02, 3);

    this.ceramic = new MeshPhysicalMaterial({
      color: '#dfe1e3',
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.32,
    });
    this.dark = new MeshStandardMaterial({ color: '#2a2d31', roughness: 0.68, metalness: 0.12 });
    this.shade = new MeshStandardMaterial({ color: '#868c91', roughness: 0.6, metalness: 0.1 });
    this.metal = new MeshStandardMaterial({ color: '#a2a9ae', roughness: 0.34, metalness: 1 });
    this.accent = new MeshBasicMaterial({ color: '#ff3a24' });

    const parts = buildPistolGeometry();

    this.root = new Group();
    this.frame = new Group();
    this.slide = new Group();
    this.parts = parts;
    this.frame.add(...this.createFrameMeshes());
    this.slide.add(...this.createSlideMeshes());
    this.root.add(this.frame, this.slide);

    this.flash = new Sprite(
      new SpriteMaterial({
        map: createFlashTexture(),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.flash.position.set(0, 0.0104, -0.205);
    this.flash.visible = false;
    this.root.add(this.flash);

    this.scene.add(this.root);

    this.fill = new HemisphereLight('#ffffff', '#767c82', 0.5);
    this.keyLight = new DirectionalLight('#ffffff', 1.2);
    this.keyLight.position.set(-0.7, 1, 0.25);
    this.rimLight = new DirectionalLight('#ffffff', 0.35);
    this.rimLight.position.set(1, 0.1, -0.6);
    this.scene.add(this.fill, this.keyLight, this.rimLight);

    this.position = POSITIONS.standard;
    this.aspectScale = 1;
    this.visible = true;
    this.recoil = true;
    this.intensity = 1;
    this.idle = false;
    this.lastShot = -Infinity;
    this.applyPose(0, 0);
  }

  createFrameMeshes() {
    const { parts } = this;
    return [
      new Mesh(parts.frameCeramic, this.ceramic),
      new Mesh(parts.frameDark, this.dark),
      new Mesh(parts.frameShade, this.shade),
      new Mesh(parts.frameMetal, this.metal),
    ];
  }

  createSlideMeshes() {
    const { parts } = this;
    return [
      new Mesh(parts.slideCeramic, this.ceramic),
      new Mesh(parts.slideDark, this.dark),
      new Mesh(parts.slideShade, this.shade),
      new Mesh(parts.slideMetal, this.metal),
      new Mesh(parts.accent, this.accent),
    ];
  }

  configure({ visible, recoil, animationIntensity, position, idle }) {
    this.visible = visible;
    this.recoil = recoil;
    this.intensity = animationIntensity;
    this.position = POSITIONS[position] ?? POSITIONS.standard;
    this.idle = idle;
    this.applyPose(0, 0);
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // The view's width follows the aspect ratio, so the sideways offset must too, or the pistol
    // drifts towards the middle of an ultrawide and off the edge of a narrow window.
    this.aspectScale = Math.min(MAX_ASPECT_SCALE, aspect / REFERENCE_ASPECT);
    this.applyPose(0, 0);
  }

  setTheme(theme) {
    this.scene.environmentIntensity = theme.weaponEnvironment;
    this.fill.intensity = theme.weaponFill;
    this.keyLight.intensity = theme.weaponKey;
  }

  /** Called from the shot handler, so the animation's start time is the input's time. */
  fire(now) {
    this.lastShot = now;
  }

  applyPose(kick, idlePhase) {
    const p = this.position;
    const swayY = this.idle ? Math.sin(idlePhase * 1.1) * 0.0011 : 0;
    const swayX = this.idle ? Math.sin(idlePhase * 0.7) * 0.0008 : 0;
    this.root.position.set(p.x * this.aspectScale + swayX, p.y + swayY + kick * 0.0016, p.z + kick * 0.0085);
    // Angled in towards the crosshair, with a slight cant, plus a small muzzle rise.
    this.root.rotation.set(0.075 + kick * 0.055, 0.1 + kick * 0.004, -0.03 - kick * 0.004);
  }

  /**
   * @param {number} now milliseconds on the same clock as fire()
   * @param {number} yaw view yaw, so reflections in the gun turn with the room
   * @param {number} pitch view pitch
   */
  update(now, yaw, pitch) {
    if (!this.visible) return;
    const sinceShot = now - this.lastShot;
    const slide = slideCurve(sinceShot) * Math.min(1, this.intensity);
    this.slide.position.z = slide * SLIDE_TRAVEL;
    const kick = this.recoil ? kickCurve(sinceShot) * this.intensity : 0;
    this.applyPose(kick, now * 0.001);

    const flashing = sinceShot >= 0 && sinceShot < FLASH_MS && this.intensity > 0;
    this.flash.visible = flashing;
    if (flashing) {
      const fade = 1 - sinceShot / FLASH_MS;
      this.flash.material.opacity = fade * 0.85;
      const size = (0.034 + 0.014 * (sinceShot / FLASH_MS)) * Math.min(1.2, this.intensity);
      this.flash.scale.set(size, size, size);
    }

    // The gun's environment turns opposite to the view, so reflections stay world-locked.
    this.scene.environmentRotation.set(-pitch, -yaw, 0, 'ZXY');
  }

  /** Reflections on the pistol come from the same captured environment as the room. */
  setEnvironment(texture) {
    this.scene.environment = texture;
  }
}
