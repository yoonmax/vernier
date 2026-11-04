import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { radiansPerCount } from '../../src/input/SensitivityController.js';
import { CameraController, verticalFovDegrees } from '../../src/rendering/CameraController.js';

const configure = (camera, overrides = {}) =>
  camera.configure({ sensitivity: 1, verticalMultiplier: 1, invertY: false, pitchLimitDegrees: 89, ...overrides });

describe('camera rotation', () => {
  it('moving the mouse right turns right, by exactly counts times rate', () => {
    const camera = new CameraController();
    configure(camera);
    camera.applyMouseDelta(100, 0);
    expect(camera.yaw).toBeCloseTo(-100 * radiansPerCount(1), 12);
    expect(camera.pitch).toBe(0);
  });

  it('moving the mouse up looks up, and invert Y reverses it', () => {
    const camera = new CameraController();
    configure(camera);
    camera.applyMouseDelta(0, -50);
    expect(camera.pitch).toBeCloseTo(50 * radiansPerCount(1), 12);

    const inverted = new CameraController();
    configure(inverted, { invertY: true });
    inverted.applyMouseDelta(0, -50);
    expect(inverted.pitch).toBeCloseTo(-50 * radiansPerCount(1), 12);
  });

  it('applies the vertical multiplier to pitch only', () => {
    const camera = new CameraController();
    configure(camera, { verticalMultiplier: 0.5 });
    camera.applyMouseDelta(10, -10);
    expect(camera.pitch).toBeCloseTo(5 * radiansPerCount(1), 12);
    expect(camera.yaw).toBeCloseTo(-10 * radiansPerCount(1), 12);
  });

  it('gives the same result however the movement is divided into events', () => {
    const whole = new CameraController();
    configure(whole);
    whole.applyMouseDelta(600, -240);

    const pieces = new CameraController();
    configure(pieces);
    for (let i = 0; i < 120; i += 1) pieces.applyMouseDelta(5, -2);

    expect(pieces.yaw).toBeCloseTo(whole.yaw, 10);
    expect(pieces.pitch).toBeCloseTo(whole.pitch, 10);
  });

  it('does not limit horizontal rotation and wraps yaw', () => {
    const camera = new CameraController();
    configure(camera, { sensitivity: 10 });
    for (let i = 0; i < 100; i += 1) camera.applyMouseDelta(500, 0);
    expect(Math.abs(camera.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it('matches a real Three.js camera direction', () => {
    const controller = new CameraController();
    const three = new PerspectiveCamera();
    three.rotation.order = 'YXZ';
    const expected = new Vector3();
    const actual = { x: 0, y: 0, z: 0 };
    for (const [yaw, pitch] of [[0, 0], [0.7, 0.3], [-2.4, -0.9], [3, 1.2]]) {
      controller.setAngles(yaw, pitch);
      controller.applyTo(three);
      three.updateMatrixWorld();
      three.getWorldDirection(expected);
      controller.getDirection(actual);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
      expect(actual.z).toBeCloseTo(expected.z, 6);
    }
  });
});

describe('vertical pitch clamping', () => {
  it('clamps at the limit in both directions', () => {
    const camera = new CameraController();
    configure(camera, { sensitivity: 20, pitchLimitDegrees: 60 });
    const limit = (60 * Math.PI) / 180;
    for (let i = 0; i < 100; i += 1) camera.applyMouseDelta(0, -1000);
    expect(camera.pitch).toBeCloseTo(limit, 12);
    for (let i = 0; i < 200; i += 1) camera.applyMouseDelta(0, 1000);
    expect(camera.pitch).toBeCloseTo(-limit, 12);
  });

  it('never reaches straight up, which would make the orientation invalid', () => {
    const camera = new CameraController();
    configure(camera, { sensitivity: 20 });
    for (let i = 0; i < 100; i += 1) camera.applyMouseDelta(0, -5000);
    expect(camera.pitch).toBeLessThan(Math.PI / 2);
  });

  it('re-clamps the current pitch when the limit is tightened', () => {
    const camera = new CameraController();
    configure(camera);
    camera.setAngles(0, 1.4);
    configure(camera, { pitchLimitDegrees: 45 });
    expect(camera.pitch).toBeCloseTo(Math.PI / 4, 12);
  });
});

describe('field of view', () => {
  it('converts horizontal FOV to vertical', () => {
    expect(verticalFovDegrees(90, 1)).toBeCloseTo(90);
    expect(verticalFovDegrees(103, 16 / 9)).toBeCloseTo(70.53, 1);
  });
});
