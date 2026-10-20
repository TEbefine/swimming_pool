import React, { useMemo } from 'react';
import type { CupLayer, Temp } from '../../game/cafe/cafeMenu';

// A small pixel-art glass drawn from the drink's colour layers (no image files needed).
// Hot = glass mug with a handle and steam · iced = tall glass with ice cubes and a straw.
// Grid 20 × 22, drawn with crisp edges so it stays pixel-sharp at any size.

const INK = '#2B1B12';
const GLASS = '#EEF6F7';
const SHINE = 'rgba(255,255,255,0.75)';

type Px = [x: number, y: number, w: number, h: number, fill: string];

/** Split `rows` between the layers by weight, bottom → top, at least 1 row each. */
function layerRows(layers: CupLayer[], rows: number): number[] {
  const total = layers.reduce((s, l) => s + l.w, 0) || 1;
  const out = layers.map((l) => Math.max(1, Math.floor((l.w / total) * rows)));
  const byWeight = layers.map((_, i) => i).sort((a, b) => layers[b].w - layers[a].w);
  let used = out.reduce((s, n) => s + n, 0);
  for (let k = 0; used < rows; k++, used++) out[byWeight[k % byWeight.length]]++;
  while (used > rows) {
    const i = byWeight.find((j) => out[j] > 1);
    if (i === undefined) break;
    out[i]--;
    used--;
  }
  return out;
}

function buildPixels(layers: CupLayer[], temp: Temp): Px[] {
  const px: Px[] = [];
  if (temp === 'hot') {
    // steam
    px.push([8, 0, 1, 1, '#CDBFAF'], [7, 1, 1, 1, '#CDBFAF'], [8, 2, 1, 1, '#CDBFAF'], [7, 3, 1, 1, '#CDBFAF']);
    px.push([12, 1, 1, 1, '#D9CDBF'], [11, 2, 1, 1, '#D9CDBF'], [12, 3, 1, 1, '#D9CDBF']);
    // handle
    px.push([15, 8, 3, 1, INK], [17, 9, 1, 6, INK], [15, 15, 3, 1, INK]);
    // body outline + glass
    px.push([3, 5, 13, 1, INK], [3, 6, 1, 13, INK], [15, 6, 1, 13, INK], [4, 19, 11, 1, INK]);
    px.push([4, 6, 11, 13, GLASS]);
    // liquid: rows 8..18
    const top = 8, bottom = 18;
    const rows = layerRows(layers, bottom - top + 1);
    let y = bottom + 1;
    layers.forEach((l, i) => { y -= rows[i]; px.push([4, y, 11, rows[i], l.c]); });
    px.push([5, 7, 1, 11, SHINE]);
    // saucer
    px.push([1, 20, 18, 1, '#D8CBB8'], [1, 21, 18, 1, INK]);
  } else {
    // straw
    px.push([12, 0, 2, 1, INK], [12, 1, 2, 4, '#3FAF6A'], [12, 2, 2, 1, '#E9F7EE']);
    // glass outline + glass
    px.push([4, 3, 12, 1, INK], [4, 4, 1, 17, INK], [15, 4, 1, 17, INK], [5, 21, 10, 1, INK]);
    px.push([5, 4, 10, 17, GLASS]);
    // liquid: rows 6..20
    const top = 6, bottom = 20;
    const rows = layerRows(layers, bottom - top + 1);
    let y = bottom + 1;
    layers.forEach((l, i) => { y -= rows[i]; px.push([5, y, 10, rows[i], l.c]); });
    // straw inside the drink (darker), ice cubes, shine
    px.push([12, 5, 2, 9, 'rgba(30,90,55,0.55)']);
    for (const [x, y0] of [[6, 6], [9, 8], [6, 11]] as const) {
      px.push([x, y0, 3, 3, 'rgba(232,246,251,0.92)'], [x, y0, 3, 1, 'rgba(255,255,255,0.95)']);
    }
    px.push([5, 5, 1, 14, SHINE]);
  }
  return px;
}

export const CupIcon: React.FC<{ layers: CupLayer[]; temp: Temp; size: number }> = ({ layers, temp, size }) => {
  const px = useMemo(() => buildPixels(layers, temp), [layers, temp]);
  return (
    <svg viewBox="0 0 20 22" width={size} height={Math.round(size * 1.1)} shapeRendering="crispEdges" aria-hidden="true">
      {px.map(([x, y, w, h, fill], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />)}
    </svg>
  );
};
