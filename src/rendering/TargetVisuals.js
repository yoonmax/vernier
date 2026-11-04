import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  LatheGeometry,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';
import { ARENA_RADIUS, EYE } from '../core/constants.js';

const CAPACITY = 32;
const WALL_GAP = 0.03;
const MINIMUM_SHADOW_HEIGHT = 0.05;
const scratch = new Object3D();
const shadowPlacement = { x: 0, y: 0, z: 0, size: 0 };

/**
 * A unit disc with a soft dome, turned into 3D around its axis. Its widest ring lies in the
 * local plane z = 0, which is the plane the hit test uses, so the silhouette the player
 * sees is the hit area: no hidden margin and no shortfall.
 */
function createDiscGeometry() {
  const profile = [
    [0, 0.07],
    [0.45, 0.068],
    [0.74, 0.056],
    [0.84, 0.05],
    [0.93, 0.038],
    [0.98, 0.018],
    [1, 0],
    [0.985, -0.024],
    [0.93, -0.05],
    [0, -0.06],
  ].map(([radius, depth]) => new Vector2(radius, depth));
  const geometry = new LatheGeometry(profile, 64);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** How far below the target its shadow's centre looks, and how wide it is, in target radii. */
const SHADOW_DROP = 0.5;
const SHADOW_DIAMETER = 3.3;

/**
 * Places a target's soft contact shadow on the wall behind it.
 *
 * The wall is further away than the target, so a shadow at the target's own height would look
 * further below it the higher the target is, until it reads as a detached dark spot. Working
 * along the line of sight instead keeps the shadow close beneath the disc at every height:
 * follow the ray from the eye through the target to the wall, then step down a fixed share of
 * the target's apparent size. Sizes are multiplied up by the same ratio, because the wall is
 * further away than the disc.
 */
export function contactShadowPlacement(target, out) {
  const dx = target.x - EYE.x;
  const dy = target.y - EYE.y;
  const dz = target.z - EYE.z;
  const toWall = (ARENA_RADIUS - WALL_GAP) / (Math.hypot(dx, dz) || 1);
  out.x = EYE.x + dx * toWall;
  out.y = Math.max(MINIMUM_SHADOW_HEIGHT, EYE.y + dy * toWall - target.radius * toWall * SHADOW_DROP);
  out.z = EYE.z + dz * toWall;
  out.size = target.radius * toWall * SHADOW_DIAMETER;
  return out;
}

/** All targets drawn as instances of one mesh: a single draw call however many are up. */
export class TargetVisuals {
  constructor(scene) {
    this.uniforms = {
      uBorderColor: { value: new Color('#14181c') },
      uBorderStart: { value: 0.84 },
      uMarker: { value: 0 },
      uHighlight: { value: 0 },
    };

    this.material = new MeshStandardMaterial({
      color: '#f7f8f8',
      roughness: 0.3,
      metalness: 0,
      envMapIntensity: 1.15,
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec2 vDisc;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvDisc = position.xy;`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying vec2 vDisc;
          uniform vec3 uBorderColor;
          uniform float uBorderStart;
          uniform float uMarker;
          uniform float uHighlight;`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          float discRadius = length(vDisc);
          float aa = max(fwidth(discRadius), 1e-4);
          float border = smoothstep(uBorderStart - aa, uBorderStart + aa, discRadius);
          diffuseColor.rgb = mix(diffuseColor.rgb, uBorderColor, border);
          float marker = (1.0 - smoothstep(0.1 - aa, 0.1 + aa, discRadius)) * uMarker;
          diffuseColor.rgb = mix(diffuseColor.rgb, uBorderColor, marker);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          totalEmissiveRadiance *= 1.0 - border;
          totalEmissiveRadiance += vec3(0.25, 0.9, 0.62) * uHighlight * 0.6;`,
        );
    };
    this.material.customProgramCacheKey = () => 'target-disc';

    this.mesh = new InstancedMesh(createDiscGeometry(), this.material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.shadows = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uStrength: { value: 0.3 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform float uStrength;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float a = 1.0 - smoothstep(0.1, 1.0, d);
            gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uStrength);
          }`,
      }),
      CAPACITY,
    );
    this.shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    scene.add(this.shadows);

    this.lastRevision = -1;
    this.shadowsEnabled = true;
  }

  configure({ color, border, borderThickness, opacity, centerMarker, glow }) {
    this.material.color.set(color);
    this.material.emissive.set(color);
    this.material.emissiveIntensity = glow;
    this.uniforms.uBorderColor.value.set(border);
    this.uniforms.uBorderStart.value = 1 - borderThickness;
    this.uniforms.uMarker.value = centerMarker ? 1 : 0;
    const transparent = opacity < 1;
    if (this.material.transparent !== transparent) {
      this.material.transparent = transparent;
      this.material.needsUpdate = true;
    }
    this.material.opacity = opacity;
  }

  setShadow(strength, enabled) {
    this.shadows.material.uniforms.uStrength.value = strength;
    this.shadowsEnabled = enabled;
    this.shadows.visible = enabled;
  }

  /** Lights the target while the player is on it in hold-to-track mode. */
  setHighlight(active) {
    this.uniforms.uHighlight.value = active ? 1 : 0;
  }

  /** Copies simulation positions into instance matrices, only when something changed. */
  sync(manager) {
    const { active, revision } = manager;
    const moving = active.length > 0 && active[0].motion !== null;
    if (revision === this.lastRevision && !moving) return;
    this.lastRevision = revision;

    const count = Math.min(active.length, CAPACITY);
    for (let i = 0; i < count; i += 1) {
      const target = active[i];
      scratch.position.set(target.x, target.y, target.z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.setScalar(target.radius);
      scratch.lookAt(EYE.x, EYE.y, EYE.z);
      scratch.updateMatrix();
      this.mesh.setMatrixAt(i, scratch.matrix);
      if (this.shadowsEnabled) this.placeShadow(i, target);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.shadowsEnabled) {
      this.shadows.count = count;
      this.shadows.instanceMatrix.needsUpdate = true;
    }
  }

  placeShadow(index, target) {
    const { x, y, z, size } = contactShadowPlacement(target, shadowPlacement);
    scratch.position.set(x, y, z);
    scratch.rotation.set(0, 0, 0);
    scratch.scale.setScalar(size);
    scratch.lookAt(0, y, 0);
    scratch.updateMatrix();
    this.shadows.setMatrixAt(index, scratch.matrix);
  }
}
