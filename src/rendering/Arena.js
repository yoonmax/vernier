import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { ARENA_HEIGHT, ARENA_RADIUS } from '../core/constants.js';
import { DEG_TO_RAD } from '../utils/math.js';
import { createSurfaceMaterial } from './surfaceMaterial.js';

/** The central ring the ceiling beams land on, which surrounds the oculus. */
const COLLAR_RADIUS = 5.3;

/** Half-angle of the calm wall section behind the training zone, in radians. */
const ZONE_HALF_ANGLE = 44 * DEG_TO_RAD;

/** Angles of the structural columns. They frame the zone and never stand inside it. */
const COLUMN_ANGLES_DEG = [52, 76, 100, 124, 148, 180, -52, -76, -100, -124, -148];
const GLASS_BAYS_DEG = [64, 88, 112, 136, -64, -88, -112, -136];

const composeMatrix = (() => {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const axis = new Vector3(0, 1, 0);
  return (x, y, z, rotationY, sx, sy, sz) => {
    position.set(x, y, z);
    quaternion.setFromAxisAngle(axis, rotationY);
    scale.set(sx, sy, sz);
    return new Matrix4().compose(position, quaternion, scale);
  };
})();

/** A point on a circle around the eye. Angle 0 is straight ahead and positive turns left. */
const onCircle = (angle, radius) => ({ x: -Math.sin(angle) * radius, z: -Math.cos(angle) * radius });

/**
 * The training chamber: a circular room with the player at its exact centre. Geometry is
 * generated at startup, and repeated parts are instanced so the whole room is a handful of
 * draw calls.
 */
export class Arena {
  constructor() {
    this.group = new Group();
    this.group.name = 'arena';
    this.reflectionUniforms = {
      tReflection: { value: null },
      uReflectionMatrix: { value: new Matrix4() },
      uReflectionBase: { value: 0 },
      uReflectionEdge: { value: 0 },
      uReflectionTexel: { value: 1 / 1024 },
    };
    this.buildSurfaces();
    this.buildStructure();
    this.buildLights();
  }

  buildSurfaces() {
    this.wallUniforms = {
      uZone: { value: new Color() },
      uSeam: { value: new Color() },
      uTick: { value: new Color() },
    };
    this.wallMaterial = createSurfaceMaterial(
      { side: BackSide, metalness: 0 },
      {
        key: 'arena-wall',
        uniforms: this.wallUniforms,
        declarations: /* glsl */ `
          uniform vec3 uZone;
          uniform vec3 uSeam;
          uniform vec3 uTick;
          const float RADIUS = ${ARENA_RADIUS.toFixed(1)};
          const float HEIGHT = ${ARENA_HEIGHT.toFixed(1)};
          const float ZONE = ${ZONE_HALF_ANGLE.toFixed(4)};
        `,
        body: /* glsl */ `
          float angle = atan(-p.x, -p.z);
          float arc = angle * RADIUS;
          float absAngle = abs(angle);
          float degrees = angle * 57.29578;

          float inZone = (1.0 - smoothstep(ZONE - 0.002, ZONE + 0.002, absAngle))
            * bandMask(p.y, 0.62, 8.6);
          surfaceColor = mix(surfaceColor, uZone, inZone);

          // Large panels: tall bays with a single horizontal seam course.
          float bay = 12.0 * 0.0174533 * RADIUS;
          float vertical = lineMask(triangleWave(arc + bay * 0.5, bay), 0.006);
          float horizontal = lineMask(triangleWave(p.y - 0.62, 2.66), 0.006);
          float seamStrength = (1.0 - inZone * 0.35) * 0.55;
          surfaceColor = mix(surfaceColor, uSeam, max(vertical, horizontal) * seamStrength);

          // The zone's frame, and a degree scale along its lower edge.
          float frame = max(lineMask(p.y - 0.62, 0.012), lineMask(p.y - 8.6, 0.012))
            * step(absAngle, ZONE);
          frame = max(frame, lineMask(absAngle - ZONE, 0.0007) * bandMask(p.y, 0.62, 8.6));
          surfaceColor = mix(surfaceColor, uTick, frame * 0.75);

          float tickBand = step(absAngle, ZONE - 0.001);
          float everyTen = lineMask(triangleWave(degrees, 10.0), 0.05) * bandMask(p.y, 0.3, 0.6);
          float everyFive = lineMask(triangleWave(degrees, 5.0), 0.04) * bandMask(p.y, 0.4, 0.6);
          float everyOne = lineMask(triangleWave(degrees, 1.0), 0.03) * bandMask(p.y, 0.5, 0.6);
          surfaceColor = mix(surfaceColor, uTick, max(everyTen, max(everyFive, everyOne)) * tickBand * 0.8);

          // Known geometry as occlusion: corners, the skirting and the base of each column.
          occlusion *= mix(0.58, 1.0, smoothstep(0.0, 1.5, p.y));
          occlusion *= mix(0.68, 1.0, smoothstep(0.0, 2.4, HEIGHT - p.y));
          float wash = smoothstep(1.0, HEIGHT, p.y);
          occlusion *= mix(0.9, 1.04, wash);
        `,
      },
    );
    const wall = new Mesh(
      new CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, ARENA_HEIGHT, 128, 1, true),
      this.wallMaterial,
    );
    wall.position.y = ARENA_HEIGHT / 2;
    wall.receiveShadow = true;
    wall.name = 'wall';
    this.group.add(wall);

    this.floorUniforms = { uFloorSeam: { value: new Color() }, ...this.reflectionUniforms };
    this.floorMaterial = createSurfaceMaterial(
      { metalness: 0 },
      {
        key: 'arena-floor',
        uniforms: this.floorUniforms,
        vertexDeclarations: /* glsl */ `
          uniform mat4 uReflectionMatrix;
          varying vec4 vReflectionCoord;
        `,
        vertex: /* glsl */ `vReflectionCoord = uReflectionMatrix * surfaceWorld;`,
        declarations: /* glsl */ `
          uniform vec3 uFloorSeam;
          uniform sampler2D tReflection;
          uniform float uReflectionBase;
          uniform float uReflectionEdge;
          uniform float uReflectionTexel;
          varying vec4 vReflectionCoord;
          const float RADIUS = ${ARENA_RADIUS.toFixed(1)};

          vec3 sampleReflection(vec2 uv) {
            // A vertically stretched kernel over a mip level, the way polished resin smears
            // reflections of tall objects, at a fixed cost of five texture reads.
            float s = uReflectionTexel * 1.6;
            vec3 sum = min(texture2D(tReflection, uv, 2.4).rgb, vec3(1.25)) * 0.28;
            sum += min(texture2D(tReflection, uv + vec2(s, s * 3.0), 2.4).rgb, vec3(1.25)) * 0.18;
            sum += min(texture2D(tReflection, uv + vec2(-s, s * 3.0), 2.4).rgb, vec3(1.25)) * 0.18;
            sum += min(texture2D(tReflection, uv + vec2(s, -s * 3.0), 2.4).rgb, vec3(1.25)) * 0.18;
            sum += min(texture2D(tReflection, uv + vec2(-s, -s * 3.0), 2.4).rgb, vec3(1.25)) * 0.18;
            return sum;
          }
        `,
        body: /* glsl */ `
          float radius = length(p.xz);
          float angle = atan(-p.x, -p.z);
          float degrees = angle * 57.29578;

          // Concentric rings and radial joints, centred on the player.
          float ring = lineMask(triangleWave(radius - 2.0, 4.0), 0.008);
          float joint = lineMask(triangleWave(degrees + 7.5, 15.0) * radius * 0.0174533, 0.008)
            * smoothstep(1.7, 1.9, radius);
          surfaceColor = mix(surfaceColor, uFloorSeam, max(ring, joint) * 0.38);

          // A protractor inlay in front of the player, in true degrees.
          float inFront = step(abs(degrees), 50.0);
          float arcLine = lineMask(radius - 3.2, 0.006) * inFront;
          float tickTen = lineMask(triangleWave(degrees, 10.0) * radius * 0.0174533, 0.007)
            * bandMask(radius, 3.2, 3.5) * inFront;
          float tickOne = lineMask(triangleWave(degrees, 2.0) * radius * 0.0174533, 0.004)
            * bandMask(radius, 3.2, 3.3) * inFront;
          surfaceColor = mix(surfaceColor, uFloorSeam, max(arcLine, max(tickTen, tickOne)) * 0.9);

          occlusion *= mix(0.5, 1.0, smoothstep(0.0, 2.6, RADIUS - radius));
          occlusion *= mix(0.72, 1.0, smoothstep(1.5, 2.2, radius));
        `,
        outgoing: /* glsl */ `
          if (uReflectionEdge > 0.0) {
            vec3 viewDirection = normalize(vViewPosition);
            float facing = clamp(dot(normalize(normal), viewDirection), 0.0, 1.0);
            float fresnel = mix(uReflectionBase, uReflectionEdge, pow(1.0 - facing, 3.0));
            vec2 reflectionUv = vReflectionCoord.xy / vReflectionCoord.w;
            outgoingLight = mix(outgoingLight, sampleReflection(reflectionUv), fresnel);
          }
        `,
      },
    );
    const floor = new Mesh(new CircleGeometry(ARENA_RADIUS, 128), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.floor = floor;
    this.group.add(floor);

    this.ceilingUniforms = { uSeamCeiling: { value: new Color() } };
    this.ceilingMaterial = createSurfaceMaterial(
      { metalness: 0, roughness: 0.9 },
      {
        key: 'arena-ceiling',
        uniforms: this.ceilingUniforms,
        declarations: /* glsl */ `
          uniform vec3 uSeamCeiling;
          const float RADIUS = ${ARENA_RADIUS.toFixed(1)};
        `,
        body: /* glsl */ `
          float radius = length(p.xz);
          float ring = lineMask(triangleWave(radius, 3.0), 0.01);
          surfaceColor = mix(surfaceColor, uSeamCeiling, ring * 0.35);
          occlusion *= mix(0.6, 1.0, smoothstep(0.0, 3.0, RADIUS - radius));
          occlusion *= mix(1.08, 0.94, smoothstep(5.0, 13.0, radius));
        `,
      },
    );
    const ceiling = new Mesh(new RingGeometry(5.2, ARENA_RADIUS, 128, 1), this.ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ARENA_HEIGHT;
    this.group.add(ceiling);
  }

  buildStructure() {
    // Double-sided because the skirting and the ceiling collar are seen from inside the circle.
    this.structureMaterial = createSurfaceMaterial(
      { side: DoubleSide },
      {
        key: 'arena-structure',
        body: /* glsl */ `
          occlusion *= mix(0.55, 1.0, smoothstep(0.0, 1.3, p.y));
          occlusion *= mix(0.74, 1.0, smoothstep(0.0, 1.6, ${ARENA_HEIGHT.toFixed(1)} - p.y));
        `,
      },
    );

    // Columns: slim fins standing proud of the wall.
    const columnGeometry = new BoxGeometry(0.34, ARENA_HEIGHT, 1.05);
    const columns = new InstancedMesh(columnGeometry, this.structureMaterial, COLUMN_ANGLES_DEG.length);
    COLUMN_ANGLES_DEG.forEach((degrees, index) => {
      const angle = degrees * DEG_TO_RAD;
      const { x, z } = onCircle(angle, ARENA_RADIUS - 0.5);
      columns.setMatrixAt(index, composeMatrix(x, ARENA_HEIGHT / 2, z, angle, 1, 1, 1));
    });
    columns.castShadow = true;
    columns.receiveShadow = true;
    this.group.add(columns);

    // Radial ceiling beams, running from the perimeter to the central ring.
    const beamCount = 24;
    const beamLength = ARENA_RADIUS - COLLAR_RADIUS;
    const beams = new InstancedMesh(new BoxGeometry(0.16, 0.42, beamLength), this.structureMaterial, beamCount);
    for (let i = 0; i < beamCount; i += 1) {
      const angle = (i / beamCount) * Math.PI * 2 + 7.5 * DEG_TO_RAD;
      const { x, z } = onCircle(angle, COLLAR_RADIUS + beamLength / 2);
      beams.setMatrixAt(i, composeMatrix(x, ARENA_HEIGHT - 0.21, z, angle, 1, 1, 1));
    }
    this.group.add(beams);

    // A skirting course all the way round the room's base.
    const skirting = new Mesh(
      new CylinderGeometry(ARENA_RADIUS - 0.05, ARENA_RADIUS - 0.05, 0.14, 128, 1, true),
      this.structureMaterial,
    );
    skirting.position.y = 0.07;
    this.group.add(skirting);

    // The central ring, which the beams land on and the oculus sits within.
    const collar = new Mesh(new CylinderGeometry(COLLAR_RADIUS, COLLAR_RADIUS, 0.9, 96, 1, true), this.structureMaterial);
    collar.position.y = ARENA_HEIGHT - 0.45;
    this.group.add(collar);

    // The dais the player stands on.
    this.dais = new Mesh(new CylinderGeometry(1.6, 1.66, 0.08, 96), this.structureMaterial);
    this.dais.position.y = 0.04;
    this.dais.receiveShadow = true;
    this.group.add(this.dais);

    // Glass bays between the columns, each lit from behind by a slot of light.
    this.glassMaterial = new MeshStandardMaterial({
      transparent: true,
      roughness: 0.06,
      metalness: 0.9,
      depthWrite: false,
      side: DoubleSide,
    });
    const glass = new InstancedMesh(new PlaneGeometry(6.2, ARENA_HEIGHT - 3.2), this.glassMaterial, GLASS_BAYS_DEG.length);
    GLASS_BAYS_DEG.forEach((degrees, index) => {
      const angle = degrees * DEG_TO_RAD;
      const { x, z } = onCircle(angle, ARENA_RADIUS - 0.72);
      glass.setMatrixAt(index, composeMatrix(x, (ARENA_HEIGHT - 3.2) / 2 + 1.1, z, angle, 1, 1, 1));
    });
    glass.renderOrder = 2;
    this.group.add(glass);
    this.glass = glass;
  }

  buildLights() {
    this.glowMaterial = new MeshBasicMaterial({ color: '#ffffff' });

    // The oculus: a disc of soft daylight at the centre of the ceiling.
    const oculus = new Mesh(new CircleGeometry(5.3, 96), this.glowMaterial);
    oculus.rotation.x = Math.PI / 2;
    oculus.position.y = ARENA_HEIGHT - 0.02;
    this.group.add(oculus);

    // Cove lines: the ceiling edge, and a fine line where the dais meets the floor.
    const cove = new Mesh(new RingGeometry(ARENA_RADIUS - 0.42, ARENA_RADIUS - 0.2, 128), this.glowMaterial);
    cove.rotation.x = Math.PI / 2;
    cove.position.y = ARENA_HEIGHT - 0.02;
    this.group.add(cove);

    const daisLine = new Mesh(new RingGeometry(1.68, 1.71, 96), this.glowMaterial);
    daisLine.rotation.x = -Math.PI / 2;
    daisLine.position.y = 0.006;
    this.group.add(daisLine);

    // Vertical light slots in the glass bays.
    const slots = new InstancedMesh(new BoxGeometry(0.1, ARENA_HEIGHT - 3.4, 0.04), this.glowMaterial, GLASS_BAYS_DEG.length * 2);
    GLASS_BAYS_DEG.forEach((degrees, index) => {
      const angle = degrees * DEG_TO_RAD;
      [-2.4, 2.4].forEach((offset, side) => {
        const lateral = offset / ARENA_RADIUS;
        const { x, z } = onCircle(angle + lateral, ARENA_RADIUS - 0.95);
        slots.setMatrixAt(index * 2 + side, composeMatrix(x, (ARENA_HEIGHT - 3.4) / 2 + 1.2, z, angle, 1, 1, 1));
      });
    });
    this.group.add(slots);
  }

  /** Applies a theme. Only colours and material values change. */
  applyTheme(theme) {
    this.wallMaterial.color.set(theme.wall);
    this.wallMaterial.roughness = theme.wallRoughness;
    this.wallUniforms.uZone.value.set(theme.zone);
    this.wallUniforms.uSeam.value.set(theme.seam);
    this.wallUniforms.uTick.value.set(theme.tick);

    this.floorMaterial.color.set(theme.floor);
    this.floorMaterial.roughness = theme.floorRoughness;
    this.floorUniforms.uFloorSeam.value.set(theme.floorSeam);

    this.ceilingMaterial.color.set(theme.ceiling);
    this.ceilingMaterial.emissive.set(theme.ceiling);
    this.ceilingMaterial.emissiveIntensity = theme.ceilingLift;
    this.ceilingUniforms.uSeamCeiling.value.set(theme.seam);

    this.structureMaterial.color.set(theme.structure);
    this.structureMaterial.metalness = theme.structureMetalness;
    this.structureMaterial.roughness = theme.structureRoughness;

    this.glassMaterial.color.set(theme.glass);
    this.glassMaterial.opacity = theme.glassOpacity;

    this.glowMaterial.color.set(theme.glow).multiplyScalar(theme.glowStrength);
  }

  setOcclusionEnabled(enabled) {
    const value = enabled ? 1 : 0;
    for (const material of [this.wallMaterial, this.floorMaterial, this.ceilingMaterial, this.structureMaterial]) {
      material.userData.uniforms.uOcclusion.value = value;
    }
  }
}
