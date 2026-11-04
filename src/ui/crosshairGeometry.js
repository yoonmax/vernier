/**
 * Computes a crosshair as rectangles on whole device pixels, because a line that straddles a
 * pixel boundary is drawn as two half-strength pixels: a grey smear rather than a sharp line.
 *
 * An odd-width line can't be centred on a boundary between pixels, so it sits half a device
 * pixel to one side. Everything is placed around that one centre, so the arms stay symmetrical
 * and a dot always lines up with them.
 *
 * @param {object} crosshair crosshair settings
 * @param {number} dpr device pixel ratio
 * @param {number} canvasSize width and height of the square drawing surface, in device pixels
 * @returns {{ core: Array<number[]>, outline: Array<number[]> }} each rect is [x, y, w, h]
 */
export function crosshairRects(crosshair, dpr, canvasSize) {
  const core = [];
  const outline = [];
  if (crosshair.style === 'hidden') return { core, outline };

  const hasLines = crosshair.style === 'cross' || crosshair.style === 'cross-dot';
  const hasDot = crosshair.style === 'dot' || crosshair.style === 'cross-dot';
  const thickness = Math.max(1, Math.round(crosshair.thickness * dpr));
  const length = Math.max(1, Math.round(crosshair.length * dpr));
  const gap = Math.max(0, Math.round(crosshair.gap * dpr));
  const border = crosshair.outline ? Math.max(1, Math.round(crosshair.outlineThickness * dpr)) : 0;

  let dotSize = Math.max(1, Math.round(crosshair.dotSize * dpr));
  // A dot can only be centred on a line of the same parity.
  if (hasLines && hasDot && dotSize % 2 !== thickness % 2) dotSize += 1;

  const addRect = (x, y, w, h) => {
    core.push([x, y, w, h]);
    if (border > 0) outline.push([x - border, y - border, w + border * 2, h + border * 2]);
  };

  const width = hasLines ? thickness : dotSize;
  const start = Math.floor((canvasSize - width + 1) / 2);
  const centre = start + width / 2;

  if (hasLines) {
    const before = gap > 0 ? Math.floor(centre) - gap : start;
    const after = gap > 0 ? Math.ceil(centre) + gap : start + width;
    addRect(start, before - length, width, length);
    addRect(start, after, width, length);
    addRect(before - length, start, length, width);
    addRect(after, start, length, width);
    // With no gap the arms stop at the line's edges, so the middle needs filling in.
    if (gap === 0) addRect(start, start, width, width);
  }
  if (hasDot) {
    const dotStart = centre - dotSize / 2;
    addRect(dotStart, dotStart, dotSize, dotSize);
  }
  return { core, outline };
}

/** Draws a crosshair into a 2D canvas context. Used in-game and by the settings preview. */
export function drawCrosshair(context, crosshair, dpr, canvasSize) {
  context.clearRect(0, 0, canvasSize, canvasSize);
  const { core, outline } = crosshairRects(crosshair, dpr, canvasSize);
  context.globalAlpha = crosshair.opacity;
  if (outline.length > 0) {
    context.fillStyle = crosshair.outlineColor;
    for (const [x, y, w, h] of outline) context.fillRect(x, y, w, h);
  }
  context.fillStyle = crosshair.color;
  for (const [x, y, w, h] of core) context.fillRect(x, y, w, h);
  context.globalAlpha = 1;
}
