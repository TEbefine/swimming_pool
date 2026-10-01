/** Which part of the 1024 × 576 world canvas the player can actually see.
 *  On phones the canvas is shown with `object-fit: cover`, so in portrait only ~45% of
 *  its width is on screen. Everything outside that window is work nobody sees. */
export interface ViewRect { x: number; y: number; w: number; h: number }

export function computeVisibleRect(
  canvasW: number,
  canvasH: number,
  cssW: number,
  cssH: number,
  fit: 'cover' | 'contain',
  posXPct: number,
  posYPct = 50,
  margin = 24,
): ViewRect {
  const full = { x: 0, y: 0, w: canvasW, h: canvasH };
  if (fit !== 'cover' || cssW <= 0 || cssH <= 0) return full;
  const scale = Math.max(cssW / canvasW, cssH / canvasH);
  const visW = Math.min(canvasW, cssW / scale);
  const visH = Math.min(canvasH, cssH / scale);
  const pctX = Math.max(0, Math.min(100, posXPct)) / 100;
  const pctY = Math.max(0, Math.min(100, posYPct)) / 100;
  const x0 = Math.max(0, Math.floor((canvasW - visW) * pctX) - margin);
  const y0 = Math.max(0, Math.floor((canvasH - visH) * pctY) - margin);
  const x1 = Math.min(canvasW, Math.ceil((canvasW - visW) * pctX + visW) + margin);
  const y1 = Math.min(canvasH, Math.ceil((canvasH - visH) * pctY + visH) + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function intersectRect(a: ViewRect, b: ViewRect): ViewRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || btm <= y) return null;
  return { x, y, w: r - x, h: btm - y };
}

/** Horizontal overlap test for a sprite anchored at its feet (x = centre). */
export function spanVisible(view: ViewRect, centerX: number, halfWidth: number): boolean {
  return centerX + halfWidth >= view.x && centerX - halfWidth <= view.x + view.w;
}

/** Bounding box of the see-through pixels (windows / open sky) of a painted background.
 *  The sky, city and flying things only need drawing there. Returns null for a solid painting. */
export function findOpenArea(alpha: Uint8ClampedArray, width: number, height: number, step = 2): ViewRect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += step) {
    const row = y * width;
    for (let x = 0; x < width; x += step) {
      if (alpha[(row + x) * 4 + 3] < 250) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = step + 1;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(width, maxX + pad + 1) - x, h: Math.min(height, maxY + pad + 1) - y };
}
