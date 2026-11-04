import { DirectionalLight, HemisphereLight } from 'three';

const SHADOW_MAP_SIZES = Object.freeze({ medium: 2048, high: 4096 });

/**
 * One hemisphere fill and one key light. The key's shadow map contains only the room's
 * static structure, so it renders once and is then reused every frame at no cost. Targets
 * get cheap contact shadows from TargetVisuals instead.
 */
export class Lighting {
  constructor(scene) {
    this.hemisphere = new HemisphereLight('#ffffff', '#bbbbbb', 1);
    scene.add(this.hemisphere);

    this.key = new DirectionalLight('#ffffff', 1);
    this.key.position.set(5, 22, 13);
    this.key.target.position.set(0, 0, -6);
    this.key.shadow.camera.left = -24;
    this.key.shadow.camera.right = 24;
    this.key.shadow.camera.top = 24;
    this.key.shadow.camera.bottom = -24;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 60;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 5;
    scene.add(this.key, this.key.target);
  }

  applyTheme(theme) {
    this.hemisphere.color.set(theme.hemiSky);
    this.hemisphere.groundColor.set(theme.hemiGround);
    this.hemisphere.intensity = theme.hemiStrength;
    this.key.color.set(theme.keyColor);
    this.key.intensity = theme.keyStrength;
  }

  /** @returns {boolean} whether the room's static shadow map must be re-rendered */
  applyShadowQuality(quality) {
    const size = SHADOW_MAP_SIZES[quality] ?? 0;
    const enabled = size > 0;
    const changed = this.key.castShadow !== enabled || this.key.shadow.mapSize.x !== size;
    this.key.castShadow = enabled;
    if (enabled && changed) {
      this.key.shadow.mapSize.set(size, size);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    return changed;
  }
}
