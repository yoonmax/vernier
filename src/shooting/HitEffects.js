import {
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { EYE } from '../core/constants.js';

const SHARD_CAPACITY = 256;
const PULSE_CAPACITY = 48;
const SHARDS_PER_HIT = { off: 0, low: 6, high: 14 };

/**
 * Hit effects, driven entirely by the GPU. A burst writes each particle's start state once,
 * and the vertex shader computes its position from elapsed time. There is no per-particle
 * CPU work and no allocation, however fast the player hits.
 *
 * Effects never hold up gameplay. The target is gone and its replacement placed before a
 * burst even starts.
 */
export class HitEffects {
  constructor(scene) {
    this.time = { value: 0 };
    this.intensity = 1;
    this.shardsPerHit = SHARDS_PER_HIT.high;
    this.buildShards(scene);
    this.buildPulses(scene);
    this.shardCursor = 0;
    this.pulseCursor = 0;
    this.effectColor = new Color('#1a1f24');
    this.flashColor = new Color('#ffffff');
    this.missColor = new Color('#20262b');
    this.shardColor = new Color('#f7f8f8');
    this.shardAccent = new Color('#14181c');
  }

  buildShards(scene) {
    const base = new ConeGeometry(0.5, 1, 3, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('normal', base.getAttribute('normal'));
    geometry.instanceCount = SHARD_CAPACITY;

    const instanced = (size) => {
      const attribute = new InstancedBufferAttribute(new Float32Array(SHARD_CAPACITY * size), size);
      attribute.setUsage(DynamicDrawUsage);
      return attribute;
    };
    this.shardOrigin = instanced(4); // xyz, start time
    this.shardVelocity = instanced(4); // xyz, size
    this.shardSpin = instanced(4); // axis xyz, spin rate
    this.shardTint = instanced(3);
    geometry.setAttribute('aOrigin', this.shardOrigin);
    geometry.setAttribute('aVelocity', this.shardVelocity);
    geometry.setAttribute('aSpin', this.shardSpin);
    geometry.setAttribute('aTint', this.shardTint);
    // All start time slots begin in the distant past, so nothing draws until first used.
    this.shardOrigin.array.fill(-1000);

    this.shards = new Mesh(
      geometry,
      new ShaderMaterial({
        side: DoubleSide,
        uniforms: { uTime: this.time },
        vertexShader: /* glsl */ `
          attribute vec4 aOrigin;
          attribute vec4 aVelocity;
          attribute vec4 aSpin;
          attribute vec3 aTint;
          uniform float uTime;
          varying vec3 vColor;

          const float LIFE = 0.42;

          vec3 rotate(vec3 v, vec3 axis, float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
          }

          void main() {
            float age = uTime - aOrigin.w;
            if (age < 0.0 || age > LIFE) {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              vColor = vec3(0.0);
              return;
            }
            float t = age / LIFE;
            float drag = (1.0 - exp(-age * 5.5)) / 5.5;
            vec3 world = aOrigin.xyz + aVelocity.xyz * drag;
            world.y -= 2.2 * age * age;

            float size = aVelocity.w * (1.0 - t * t);
            vec3 local = rotate(position * vec3(1.0, 1.7, 0.16) * size, aSpin.xyz, aSpin.w * age);
            vec3 rotatedNormal = rotate(normal, aSpin.xyz, aSpin.w * age);

            float light = 0.62 + 0.38 * abs(rotatedNormal.y);
            vColor = aTint * light;
            gl_Position = projectionMatrix * viewMatrix * vec4(world + local, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            gl_FragColor = vec4(vColor, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.shards.frustumCulled = false;
    scene.add(this.shards);
  }

  buildPulses(scene) {
    const base = new PlaneGeometry(2, 2);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', new Float32BufferAttribute(base.getAttribute('position').array, 3));
    geometry.instanceCount = PULSE_CAPACITY;

    const instanced = (size) => {
      const attribute = new InstancedBufferAttribute(new Float32Array(PULSE_CAPACITY * size), size);
      attribute.setUsage(DynamicDrawUsage);
      return attribute;
    };
    this.pulseCentre = instanced(4); // xyz, start time
    this.pulseShape = instanced(4); // start radius, growth, life, kind (0 ring, 1 flash, 2 mark)
    this.pulseColor = instanced(4); // rgb, strength
    geometry.setAttribute('aCentre', this.pulseCentre);
    geometry.setAttribute('aShape', this.pulseShape);
    geometry.setAttribute('aColor', this.pulseColor);
    this.pulseCentre.array.fill(-1000);

    this.pulses = new Mesh(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: this.time, uEye: { value: new Vector3(EYE.x, EYE.y, EYE.z) } },
        vertexShader: /* glsl */ `
          attribute vec4 aCentre;
          attribute vec4 aShape;
          attribute vec4 aColor;
          uniform float uTime;
          uniform vec3 uEye;
          varying vec2 vLocal;
          varying vec4 vColor;
          varying float vKind;
          varying float vProgress;

          void main() {
            float age = uTime - aCentre.w;
            float t = age / aShape.z;
            if (age < 0.0 || t > 1.0) {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              return;
            }
            // Every pulse is a quad facing the eye, so a ring looks round from any angle.
            vec3 forward = normalize(uEye - aCentre.xyz);
            vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
            vec3 up = cross(forward, right);
            float ease = 1.0 - (1.0 - t) * (1.0 - t);
            float radius = aShape.x + aShape.y * ease;
            vec3 world = aCentre.xyz + (right * position.x + up * position.y) * radius;
            vLocal = position.xy;
            vColor = aColor;
            vKind = aShape.w;
            vProgress = t;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vLocal;
          varying vec4 vColor;
          varying float vKind;
          varying float vProgress;
          void main() {
            float d = length(vLocal);
            float alpha;
            if (vKind < 0.5) {
              float width = mix(0.09, 0.015, vProgress);
              float aa = max(fwidth(d), 1e-4);
              alpha = smoothstep(1.0 - width - aa, 1.0 - width, d) * (1.0 - smoothstep(1.0 - aa, 1.0, d));
              alpha *= (1.0 - vProgress) * (1.0 - vProgress);
            } else if (vKind < 1.5) {
              alpha = (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - vProgress) * (1.0 - vProgress);
            } else {
              float aa = max(fwidth(d), 1e-4);
              alpha = (1.0 - smoothstep(1.0 - aa, 1.0, d)) * (1.0 - vProgress * vProgress);
            }
            gl_FragColor = vec4(vColor.rgb, alpha * vColor.a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.pulses.frustumCulled = false;
    this.pulses.renderOrder = 3;
    scene.add(this.pulses);
  }

  configure({ intensity, particles }) {
    this.intensity = intensity;
    this.shardsPerHit = Math.round((SHARDS_PER_HIT[particles] ?? 0) * Math.min(1, intensity));
  }

  applyTheme(theme) {
    this.effectColor.set(theme.effect);
    this.flashColor.set(theme.flash);
    this.missColor.set(theme.missMark);
  }

  /** Half the fragments take the face colour and half the border, so they show on any wall. */
  setTargetColors(face, border) {
    this.shardColor.set(face);
    this.shardAccent.set(border);
  }

  /** @param {number} now seconds */
  update(now) {
    this.time.value = now;
  }

  /** A burst on the disc at (x, y, z), with its face pointing along (nx, ny, nz). */
  hit(now, x, y, z, nx, ny, nz, radius) {
    if (this.intensity <= 0) return;
    this.pulse(now, x, y, z, radius * 0.95, radius * 1.05, 0.3, 0, this.effectColor, 0.9 * this.intensity);
    this.pulse(now, x, y, z, radius * 0.5, radius * 1.1, 0.12, 1, this.flashColor, 0.85 * this.intensity);
    if (this.shardsPerHit > 0) this.burst(now, x, y, z, nx, ny, nz, radius);
  }

  /** A small mark where a missed shot landed. It tells the player how far off they were. */
  miss(now, x, y, z) {
    if (this.intensity <= 0) return;
    this.pulse(now, x, y, z, 0.036, 0, 0.55, 2, this.missColor, 0.75 * this.intensity);
  }

  burst(now, x, y, z, nx, ny, nz, radius) {
    const origin = this.shardOrigin.array;
    const velocity = this.shardVelocity.array;
    const spin = this.shardSpin.array;
    const tint = this.shardTint.array;

    // Two axes across the face of the disc.
    const length = Math.hypot(nz, nx) || 1;
    const rx = nz / length;
    const rz = -nx / length;
    const ux = ny * rz;
    const uy = nz * rx - nx * rz;
    const uz = -ny * rx;

    for (let i = 0; i < this.shardsPerHit; i += 1) {
      const slot = this.shardCursor;
      this.shardCursor = (this.shardCursor + 1) % SHARD_CAPACITY;
      const angle = Math.random() * Math.PI * 2;
      const across = radius * (0.3 + Math.random() * 0.65);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const offX = rx * cos + ux * sin;
      const offY = uy * sin;
      const offZ = rz * cos + uz * sin;

      origin[slot * 4] = x + offX * across;
      origin[slot * 4 + 1] = y + offY * across;
      origin[slot * 4 + 2] = z + offZ * across;
      origin[slot * 4 + 3] = now;

      const outward = 2 + Math.random() * 3.6;
      const toward = 0.8 + Math.random() * 2.4;
      velocity[slot * 4] = offX * outward + nx * toward;
      velocity[slot * 4 + 1] = offY * outward + ny * toward;
      velocity[slot * 4 + 2] = offZ * outward + nz * toward;
      velocity[slot * 4 + 3] = radius * (0.12 + Math.random() * 0.16);

      const ax = Math.random() - 0.5;
      const ay = Math.random() - 0.5;
      const az = Math.random() - 0.5;
      const axisLength = Math.hypot(ax, ay, az) || 1;
      spin[slot * 4] = ax / axisLength;
      spin[slot * 4 + 1] = ay / axisLength;
      spin[slot * 4 + 2] = az / axisLength;
      spin[slot * 4 + 3] = 6 + Math.random() * 16;

      const tintColor = i % 2 === 0 ? this.shardColor : this.shardAccent;
      tint[slot * 3] = tintColor.r;
      tint[slot * 3 + 1] = tintColor.g;
      tint[slot * 3 + 2] = tintColor.b;
    }
    this.shardOrigin.needsUpdate = true;
    this.shardVelocity.needsUpdate = true;
    this.shardSpin.needsUpdate = true;
    this.shardTint.needsUpdate = true;
  }

  pulse(now, x, y, z, startRadius, growth, life, kind, color, strength) {
    const slot = this.pulseCursor;
    this.pulseCursor = (this.pulseCursor + 1) % PULSE_CAPACITY;
    const centre = this.pulseCentre.array;
    const shape = this.pulseShape.array;
    const tint = this.pulseColor.array;
    centre[slot * 4] = x;
    centre[slot * 4 + 1] = y;
    centre[slot * 4 + 2] = z;
    centre[slot * 4 + 3] = now;
    shape[slot * 4] = startRadius;
    shape[slot * 4 + 1] = growth;
    shape[slot * 4 + 2] = life;
    shape[slot * 4 + 3] = kind;
    tint[slot * 4] = color.r;
    tint[slot * 4 + 1] = color.g;
    tint[slot * 4 + 2] = color.b;
    tint[slot * 4 + 3] = strength;
    this.pulseCentre.needsUpdate = true;
    this.pulseShape.needsUpdate = true;
    this.pulseColor.needsUpdate = true;
  }
}
