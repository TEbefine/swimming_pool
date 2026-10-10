import React from 'react';

// A tiny hand-drawn backpack: 16 × 16 "pixels", drawn as SVG rects so it stays razor sharp at any size.
// It sits on a cream tile (see .gm-pack-tile): the navy outline would vanish on the navy screen.
const PALETTE: Record<string, string> = {
  o: '#1b313d', // outline (the menu navy)
  T: '#6f93a6', // flap (light blue-gray)
  t: '#4d7388', // body
  s: '#35566a', // straps
  g: '#e7bd66', // gold: handle, clasp, zip
  c: '#eee6c8', // cream pocket
};

const ROWS = [
  '................',
  '.....oooooo.....',
  '....og....go....',
  '....oooooooo....',
  '...osTTTTTTso...',
  '...osTTTTTTso...',
  '...osTTTTTTso...',
  '...osTTggTTso...',
  '...ooooggoooo...',
  '.oootttggtttooo.',
  '.ototoooooototo.',
  '.ototoggggototo.',
  '.ototoccccototo.',
  '.oootooooootooo.',
  '...oooooooooo...',
  '................',
];

/** Merge each row into runs of one colour: ~40 rects instead of 256. */
const RECTS = ROWS.flatMap((row, y) => {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  let x = 0;
  while (x < row.length) {
    const ch = row[x];
    let w = 1;
    while (x + w < row.length && row[x + w] === ch) w++;
    if (PALETTE[ch]) out.push({ x, y, w, fill: PALETTE[ch] });
    x += w;
  }
  return out;
});

export const PixelBackpack: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className="gm-backpack"
  >
    {RECTS.map((r, i) => (
      <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
    ))}
  </svg>
);
