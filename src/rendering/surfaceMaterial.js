import { MeshStandardMaterial } from 'three';

/**
 * Architectural surfaces are computed per pixel from world position rather than from
 * textures. Seams and scale marks stay razor sharp at any resolution, shimmer is prevented
 * with analytic anti-aliasing, and the room costs no texture memory.
 *
 * Ambient occlusion here is the room's known geometry written as a function (the darkening
 * where wall meets floor, for example). It costs a few shader instructions per pixel,
 * compared with a full-screen pass for screen-space AO.
 */

const SHARED_GLSL = /* glsl */ `
  varying vec3 vWorldPos;
  uniform float uOcclusion;

  float triangleWave(float x, float period) {
    return abs(fract(x / period + 0.5) - 0.5) * period;
  }
  // Anti-aliased line of half-width w around d = 0.
  float lineMask(float d, float w) {
    float aa = max(fwidth(d), 1e-5);
    return 1.0 - smoothstep(w - aa, w + aa, abs(d));
  }
  float bandMask(float x, float low, float high) {
    float aa = max(fwidth(x), 1e-5);
    return smoothstep(low - aa, low + aa, x) * (1.0 - smoothstep(high - aa, high + aa, x));
  }
`;

/**
 * @param {object} parameters MeshStandardMaterial parameters
 * @param {object} surface
 * @param {string} surface.declarations extra GLSL uniforms and functions
 * @param {string} surface.body GLSL that may change `surfaceColor` and `occlusion`, given `p`
 * @param {Record<string,{value:any}>} [surface.uniforms]
 * @param {string} [surface.outgoing] GLSL run on the final lit colour
 * @param {string} [surface.vertex] GLSL run in the vertex shader, with worldPosition available
 * @param {string} [surface.vertexDeclarations]
 */
export function createSurfaceMaterial(parameters, surface) {
  const material = new MeshStandardMaterial(parameters);
  const uniforms = { uOcclusion: { value: 1 }, ...(surface.uniforms ?? {}) };
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         ${surface.vertexDeclarations ?? ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec4 surfaceWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
         #else
           vec4 surfaceWorld = modelMatrix * vec4(transformed, 1.0);
         #endif
         vWorldPos = surfaceWorld.xyz;
         ${surface.vertex ?? ''}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         ${SHARED_GLSL}
         ${surface.declarations ?? ''}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float occlusion = 1.0;
         vec3 surfaceColor = diffuseColor.rgb;
         vec3 p = vWorldPos;
         ${surface.body}
         diffuseColor.rgb = surfaceColor;`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
         float appliedOcclusion = mix(1.0, occlusion, uOcclusion);
         reflectedLight.directDiffuse *= mix(1.0, appliedOcclusion, 0.55);
         reflectedLight.indirectDiffuse *= appliedOcclusion;
         reflectedLight.indirectSpecular *= appliedOcclusion;`,
      );

    if (surface.outgoing) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `${surface.outgoing}
         #include <opaque_fragment>`,
      );
    }
  };

  // Each surface compiles its own program, because its injected GLSL differs.
  material.customProgramCacheKey = () => surface.key;
  return material;
}
