import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, PerspectiveCamera, Vector3, WebGLRenderTarget } from 'three';

const up = new Vector3();
const forward = new Vector3();
const lookTarget = new Vector3();

/**
 * Real-time reflection for the floor (the plane y = 0). The scene is drawn once more from
 * a camera mirrored below the floor, at half resolution, and the floor material samples
 * the result with a fresnel weight. Nothing sits below the floor, so no clip plane is
 * needed. The texture matrix projects world positions into the mirrored camera's view.
 */
export class PlanarReflection {
  constructor(uniforms) {
    this.uniforms = uniforms;
    this.camera = new PerspectiveCamera();
    // Targets draw on their own layer in the main view, but still belong in the reflection.
    this.camera.layers.enable(1);
    this.enabled = false;
    this.target = null;
  }

  setEnabled(enabled, width, height) {
    this.enabled = enabled;
    if (!enabled) {
      this.target?.dispose();
      this.target = null;
      this.uniforms.tReflection.value = null;
      return;
    }
    this.setSize(width, height);
  }

  setSize(width, height) {
    if (!this.enabled) return;
    const w = Math.max(64, Math.floor(width / 2));
    const h = Math.max(64, Math.floor(height / 2));
    if (this.target) {
      this.target.setSize(w, h);
    } else {
      this.target = new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
      });
      this.uniforms.tReflection.value = this.target.texture;
    }
    this.uniforms.uReflectionTexel.value = 1 / h;
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').PerspectiveCamera} camera
   * @param {import('three').Object3D} floor hidden during this pass
   */
  render(renderer, scene, camera, floor) {
    if (!this.enabled || !this.target) return;

    const mirror = this.camera;
    camera.getWorldPosition(mirror.position);
    mirror.position.y = -mirror.position.y;

    camera.getWorldDirection(forward);
    lookTarget.set(
      camera.position.x + forward.x,
      -(camera.position.y + forward.y),
      camera.position.z + forward.z,
    );
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    up.y = -up.y;
    mirror.up.copy(up);
    mirror.lookAt(lookTarget);

    mirror.projectionMatrix.copy(camera.projectionMatrix);
    mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirror.updateMatrixWorld();

    // Map clip space [-1, 1] to texture space [0, 1].
    const matrix = this.uniforms.uReflectionMatrix.value;
    matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matrix.multiply(mirror.projectionMatrix);
    matrix.multiply(mirror.matrixWorldInverse);

    const previousTarget = renderer.getRenderTarget();
    floor.visible = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previousTarget);
    floor.visible = true;
  }

  dispose() {
    this.target?.dispose();
    this.target = null;
  }
}
