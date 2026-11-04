import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
  TorusGeometry,
} from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural pistol, modelled in metres from side-profile curves.
 *
 * Profiles are drawn in the plane (u, v), where u runs from the rear of the slide towards
 * the muzzle and v points up. Extrusion gives them width, and bevels catch the light along
 * every edge. The finished model looks along -Z, with its origin at the slide's rear base.
 */

export const SLIDE_LENGTH = 0.186;
const SLIDE_HEIGHT = 0.033;
const SLIDE_WIDTH = 0.0245;
const FRAME_WIDTH = 0.0225;
const CREASE_ANGLE = (38 * Math.PI) / 180;

function extrude(shape, width, bevel = 0.0013, bevelSegments = 3) {
  const geometry = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  // Shape +X (towards the muzzle) becomes -Z.
  geometry.rotateY(Math.PI / 2);
  return finish(toCreasedNormals(geometry, CREASE_ANGLE));
}

/** Every part must end up non-indexed with the same attributes so parts can be merged. */
function finish(geometry) {
  const clean = geometry.index ? geometry.toNonIndexed() : geometry;
  clean.deleteAttribute('uv');
  return clean;
}

function box(width, height, length, x, y, u, tiltDegrees = 0) {
  const geometry = new BoxGeometry(width, height, length);
  if (tiltDegrees) geometry.rotateX((tiltDegrees * Math.PI) / 180);
  geometry.translate(x, y, -u);
  return finish(geometry);
}

function polygon(points) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function frameProfile() {
  const s = new Shape();
  // Rail and dust cover, running forward from the rear tang.
  s.moveTo(0.012, 0.0005);
  s.lineTo(0.168, 0.0005);
  s.lineTo(0.17, -0.002);
  s.lineTo(0.17, -0.0135);
  s.bezierCurveTo(0.17, -0.0185, 0.165, -0.02, 0.158, -0.02);
  s.lineTo(0.12, -0.02);
  // Trigger guard, front then underside.
  s.bezierCurveTo(0.114, -0.021, 0.113, -0.027, 0.111, -0.036);
  s.bezierCurveTo(0.109, -0.047, 0.104, -0.051, 0.094, -0.051);
  s.lineTo(0.074, -0.051);
  s.bezierCurveTo(0.067, -0.051, 0.064, -0.048, 0.063, -0.044);
  // Front strap, raked back with a slight palm swell.
  s.bezierCurveTo(0.06, -0.058, 0.056, -0.07, 0.051, -0.086);
  s.bezierCurveTo(0.047, -0.102, 0.043, -0.114, 0.039, -0.126);
  s.lineTo(-0.011, -0.126);
  // Back strap, rising to a beavertail.
  s.bezierCurveTo(-0.014, -0.112, -0.012, -0.098, -0.011, -0.086);
  s.bezierCurveTo(-0.01, -0.066, -0.006, -0.052, -0.006, -0.036);
  s.bezierCurveTo(-0.006, -0.028, -0.016, -0.024, -0.019, -0.017);
  s.bezierCurveTo(-0.021, -0.011, -0.016, -0.008, -0.01, -0.009);
  s.bezierCurveTo(-0.002, -0.01, 0.004, -0.004, 0.012, 0.0005);

  // The trigger guard opening.
  const opening = new Path();
  opening.moveTo(0.073, -0.0235);
  opening.lineTo(0.104, -0.0235);
  opening.bezierCurveTo(0.106, -0.0235, 0.1065, -0.026, 0.106, -0.03);
  opening.bezierCurveTo(0.105, -0.04, 0.102, -0.0455, 0.094, -0.0455);
  opening.lineTo(0.075, -0.0455);
  opening.bezierCurveTo(0.07, -0.0455, 0.068, -0.043, 0.0685, -0.039);
  opening.lineTo(0.0695, -0.027);
  opening.bezierCurveTo(0.0698, -0.0245, 0.071, -0.0235, 0.073, -0.0235);
  s.holes.push(opening);
  return s;
}

function gripPanelProfile() {
  const s = new Shape();
  s.moveTo(0.0555, -0.056);
  s.bezierCurveTo(0.053, -0.07, 0.049, -0.09, 0.044, -0.105);
  s.lineTo(0.0375, -0.12);
  s.lineTo(-0.008, -0.12);
  s.bezierCurveTo(-0.01, -0.104, -0.007, -0.086, -0.004, -0.068);
  s.bezierCurveTo(-0.003, -0.056, -0.001, -0.05, 0.004, -0.048);
  s.lineTo(0.05, -0.048);
  s.closePath();
  return s;
}

function triggerProfile() {
  const s = new Shape();
  s.moveTo(0.086, -0.0235);
  s.bezierCurveTo(0.087, -0.03, 0.09, -0.036, 0.088, -0.0425);
  s.lineTo(0.0845, -0.0425);
  s.bezierCurveTo(0.0855, -0.036, 0.083, -0.03, 0.0815, -0.0235);
  s.closePath();
  return s;
}

function magazineBaseProfile() {
  return polygon([
    [0.0405, -0.1255],
    [0.042, -0.1305],
    [0.038, -0.133],
    [-0.0115, -0.133],
    [-0.0135, -0.1305],
    [-0.012, -0.1255],
  ]);
}

/**
 * The slide is extruded along its length from a chamfered cross-section, then its ends are
 * sculpted by moving vertices. This gives the angled top planes that catch light, and that
 * are what the player actually sees from behind the gun.
 */
function slideBody() {
  const half = SLIDE_WIDTH / 2;
  const bevel = 0.0011;
  const section = polygon([
    [-half + 0.0012, 0],
    [half - 0.0012, 0],
    [half, 0.0012],
    [half, 0.0205],
    [half - 0.0052, SLIDE_HEIGHT],
    [-half + 0.0052, SLIDE_HEIGHT],
    [-half, 0.0205],
    [-half, 0.0012],
  ]);
  const geometry = new ExtrudeGeometry(section, {
    depth: SLIDE_LENGTH - bevel * 2,
    steps: 48,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(0, 0, bevel);

  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const u = position.getZ(i);
    const upper = Math.min(1, Math.max(0, (y - 0.018) / (SLIDE_HEIGHT - 0.018)));
    const front = Math.min(1, Math.max(0, (u - (SLIDE_LENGTH - 0.02)) / 0.02));
    const rear = Math.min(1, Math.max(0, (0.012 - u) / 0.012));
    const drop = upper * (front * front * 0.0105 + rear * 0.0052);
    position.setXYZ(i, x * (1 - front * front * 0.07), y - drop, -u);
  }
  // Reflecting Z turns the triangles inside out, so reverse them to keep faces outward.
  const flipped = finish(geometry);
  const flippedPosition = flipped.getAttribute('position');
  for (let i = 0; i < flippedPosition.count; i += 3) {
    const bx = flippedPosition.getX(i + 1);
    const by = flippedPosition.getY(i + 1);
    const bz = flippedPosition.getZ(i + 1);
    flippedPosition.setXYZ(i + 1, flippedPosition.getX(i + 2), flippedPosition.getY(i + 2), flippedPosition.getZ(i + 2));
    flippedPosition.setXYZ(i + 2, bx, by, bz);
  }
  return finish(toCreasedNormals(flipped, CREASE_ANGLE));
}

/** The rear sight: a low block with a square notch, seen squarely by the player. */
function rearSight() {
  const section = polygon([
    [-0.0084, 0],
    [0.0084, 0],
    [0.0076, 0.0056],
    [0.0019, 0.0056],
    [0.0019, 0.0026],
    [-0.0019, 0.0026],
    [-0.0019, 0.0056],
    [-0.0076, 0.0056],
  ]);
  const geometry = new ExtrudeGeometry(section, {
    depth: 0.011,
    bevelEnabled: true,
    bevelThickness: 0.0005,
    bevelSize: 0.0005,
    bevelOffset: -0.0005,
    bevelSegments: 2,
  });
  geometry.translate(0, SLIDE_HEIGHT - 0.0004, -0.027);
  return finish(toCreasedNormals(geometry, CREASE_ANGLE));
}

/**
 * Builds the merged geometry for each material group.
 * The slide groups move during the firing animation and the frame groups don't.
 *
 * @returns {{ frameCeramic, frameDark, frameMetal, frameShade, slideCeramic, slideDark, slideShade, slideMetal, accent }}
 */
export function buildPistolGeometry() {
  const frameCeramic = [extrude(frameProfile(), FRAME_WIDTH, 0.0018, 4)];
  const frameDark = [
    extrude(gripPanelProfile(), FRAME_WIDTH + 0.0018, 0.0009, 2),
    extrude(magazineBaseProfile(), FRAME_WIDTH - 0.001, 0.001, 2),
    extrude(triggerProfile(), 0.0065, 0.0009, 2),
  ];
  // Fine grooves across each grip panel, and a short rail under the dust cover.
  const frameShade = [];
  for (let i = 0; i < 9; i += 1) {
    const v = -0.056 - i * 0.0068;
    const u = 0.0225 - i * 0.0007;
    for (const side of [-1, 1]) {
      frameShade.push(box(0.0005, 0.0013, 0.043 - i * 0.0009, side * (FRAME_WIDTH / 2 + 0.00095), v, u, 0));
    }
  }
  for (let i = 0; i < 3; i += 1) {
    for (const side of [-1, 1]) {
      frameShade.push(box(0.0006, 0.0026, 0.0058, side * (FRAME_WIDTH / 2 - 0.0001), -0.0118, 0.126 + i * 0.012));
    }
  }

  const frameMetal = [
    // Takedown lever and slide stop, sitting proud on the left of the frame.
    box(0.0012, 0.0036, 0.012, -FRAME_WIDTH / 2 - 0.0002, -0.0075, 0.105),
    box(0.0012, 0.0032, 0.018, -FRAME_WIDTH / 2 - 0.0002, -0.0045, 0.048),
    box(FRAME_WIDTH + 0.0006, 0.0028, 0.0028, 0, -0.0105, 0.145),
  ];

  const slideCeramic = [slideBody()];

  const slideDark = [
    rearSight(),
    // Blade of the front sight.
    box(0.003, 0.0042, 0.012, 0, SLIDE_HEIGHT + 0.0014, SLIDE_LENGTH - 0.03),
    // A slim inlay along each flank.
    box(0.0005, 0.0021, 0.098, -SLIDE_WIDTH / 2 - 0.0001, 0.0098, 0.122),
    box(0.0005, 0.0021, 0.098, SLIDE_WIDTH / 2 + 0.0001, 0.0098, 0.122),
    // Back plate, facing the player.
    box(0.0112, 0.0138, 0.0009, 0, 0.0128, -0.0002),
    // Ejection port, cut into the right side of the slide's top.
    box(0.0012, 0.0078, 0.036, SLIDE_WIDTH / 2 - 0.0003, 0.0165, 0.068),
    box(0.0088, 0.0005, 0.034, 0.0024, SLIDE_HEIGHT - 0.0001, 0.068),
  ];

  // Rear serrations: fine raked grooves on both flanks, in a soft grey rather than black.
  const slideShade = [];
  for (let i = 0; i < 9; i += 1) {
    const u = 0.0145 + i * 0.0032;
    for (const side of [-1, 1]) {
      slideShade.push(box(0.0005, 0.0162, 0.0012, side * (SLIDE_WIDTH / 2 + 0.0001), 0.0105, u, 7));
    }
  }
  // A long shallow channel down the top, from the rear sight to the front.
  slideShade.push(box(0.0044, 0.0005, 0.052, 0, SLIDE_HEIGHT + 0.00005, 0.122));

  const barrel = new CylinderGeometry(0.0058, 0.0058, 0.012, 28, 1, true);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0.0104, -(SLIDE_LENGTH + 0.0005));

  const crown = new TorusGeometry(0.0052, 0.0009, 10, 28);
  crown.translate(0, 0.0104, -(SLIDE_LENGTH + 0.0062));

  const bore = new CylinderGeometry(0.0046, 0.0046, 0.0006, 24);
  bore.rotateX(Math.PI / 2);
  bore.translate(0, 0.0104, -(SLIDE_LENGTH + 0.0048));
  slideDark.push(finish(bore));

  const slideMetal = [
    finish(barrel),
    finish(crown),
    // Barrel hood, seen through the ejection port.
    box(0.0072, 0.0004, 0.028, 0.0024, SLIDE_HEIGHT + 0.00025, 0.068),
    // A striker indicator in the back plate.
    box(0.0026, 0.0026, 0.0006, 0, 0.0128, -0.0007),
  ];

  // A single red fibre in the front sight: the model's one accent colour.
  const accent = [
    box(0.0013, 0.0013, 0.0032, 0, SLIDE_HEIGHT + 0.0032, SLIDE_LENGTH - 0.0248),
  ];

  return {
    frameCeramic: mergeGeometries(frameCeramic),
    frameDark: mergeGeometries(frameDark),
    frameMetal: mergeGeometries(frameMetal),
    frameShade: mergeGeometries(frameShade),
    slideCeramic: mergeGeometries(slideCeramic),
    slideDark: mergeGeometries(slideDark),
    slideShade: mergeGeometries(slideShade),
    slideMetal: mergeGeometries(slideMetal),
    accent: mergeGeometries(accent),
  };
}
