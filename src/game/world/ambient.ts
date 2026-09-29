// Ambient life drawn in code on top of painted postcard scenes (stars, water glints, sparkles,
// falling petals, lighthouse beacon, temple magic: floor ring, doorway specks + glow, light motes). Everything is deterministic from the clock — no state.
// Passes (called by Engine.render):
//   'sky'   → right after the sky gradient, behind the painting (stars)
//   'back'  → right after the room background (water glints on the painted lake)
//   'front' → after characters, before the night overlay (fountain sparkles, petals)
//   'glow'  → after the night lights (lighthouse beacon)

import type { RGB } from './cityView';

export type AmbientPass = 'sky' | 'back' | 'front' | 'glow';

export interface AmbientConfig {
  stars?: { count: number; maxY: number };
  /** Short light dashes on water: [x, y, width] */
  glints?: [number, number, number][];
  /** 1-px twinkles (fountain water): [x, y] */
  sparkles?: [number, number][];
  petals?: { x: number; y: number; w: number; h: number; fall: number; drift: number; count: number; colors: string[] };
  beacons?: { x: number; y: number; radius: number; periodMs: number; color: RGB }[];
  /** Tiny lights drifting slowly UP (sun dust by day, fireflies by night) inside an area */
  motes?: { x: number; y: number; w: number; h: number; rise: number; count: number };
  /** A dark doorway that "breathes": star specks inside (behind people) + soft edge glow at night */
  portal?: { x: number; y: number; w: number; h: number; color: RGB };
  /** Dotted ring on the floor, turning very slowly (centre x/y, radii rx/ry) */
  ring?: { x: number; y: number; rx: number; ry: number; dots: number; periodMs: number };
}

/** Stable 0..1 random from an integer seed */
const rand = (i: number, salt = 0) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const AMBIENT: Record<string, AmbientConfig> = {
  town: {
    stars: { count: 70, maxY: 160 },
    glints: [
      [219, 169, 2], [250, 169, 3], [167, 172, 2], [904, 172, 3], [195, 173, 3], [294, 174, 2], [916, 174, 3],
      [154, 175, 3], [246, 176, 5], [860, 176, 3], [224, 177, 4], [818, 178, 5], [172, 179, 4], [270, 180, 4],
      [742, 180, 5], [802, 180, 3], [259, 182, 4], [767, 182, 4], [848, 185, 5], [818, 188, 4], [835, 188, 2],
      [265, 189, 5], [524, 190, 3], [801, 190, 4], [154, 194, 3], [186, 198, 3], [758, 198, 4], [820, 198, 2],
      [869, 198, 4], [897, 198, 5], [809, 200, 4], [248, 202, 2], [748, 204, 5], [808, 207, 2], [827, 209, 3],
      [200, 210, 3], [223, 210, 3], [733, 214, 3], [820, 215, 4], [921, 215, 4], [140, 218, 2], [285, 218, 3],
      [838, 220, 5], [154, 224, 3], [906, 227, 3],
    ],
    sparkles: [
      [439, 318], [377, 310], [472, 318], [481, 317], [449, 321], [394, 321], [410, 320], [392, 312], [446, 307],
      [434, 323], [434, 312], [399, 317], [481, 311], [424, 321], [407, 296], [420, 287], [419, 275], [427, 267],
      [430, 278], [439, 274], [406, 288], [426, 295], [413, 288], [397, 297],
    ],
    petals: {
      x: 915, y: 110, w: 105, h: 120, fall: 190, drift: -70, count: 9,
      colors: ['#ffc9dc', '#ffb3cc', '#fde2ec'],
    },
    beacons: [{ x: 799, y: 126, radius: 22, periodMs: 4200, color: [255, 236, 170] }],
  },
  // Dalbit · Kang family home: a quiet fishing yard. Just stars and the sea behind the wall.
  dalbit_yard: {
    stars: { count: 90, maxY: 150 },
    glints: [
      [192, 157, 4], [67, 158, 2], [884, 159, 2], [966, 159, 2], [218, 163, 4], [782, 163, 2], [181, 164, 4],
      [869, 164, 4], [915, 164, 2], [746, 167, 4], [917, 167, 4], [859, 168, 3], [921, 170, 2], [221, 171, 4],
      [272, 172, 3], [201, 173, 3], [844, 173, 3], [258, 174, 2], [992, 174, 4], [869, 178, 3], [984, 179, 3],
      [780, 180, 4], [967, 183, 2], [959, 185, 4], [980, 185, 3], [966, 189, 3],
    ],
  },
  // River mouth: a wide calm sea (painted flat on purpose) — code glints do the shimmer.
  dalbit_river: {
    stars: { count: 100, maxY: 130 },
    glints: [
      [185, 140, 4], [444, 140, 4], [461, 141, 2], [340, 142, 3], [360, 142, 3], [222, 144, 3], [543, 144, 5],
      [484, 145, 4], [402, 146, 5], [360, 147, 4], [211, 148, 2], [443, 151, 4], [130, 153, 2], [400, 153, 3],
      [566, 153, 2], [93, 154, 4], [83, 158, 5], [509, 158, 4], [161, 162, 5], [222, 164, 5], [494, 164, 4],
      [401, 166, 5], [349, 167, 5], [209, 168, 4], [472, 169, 4], [391, 171, 2], [279, 173, 4], [394, 175, 3],
      [186, 178, 4], [496, 180, 5], [140, 181, 2], [531, 183, 3], [834, 186, 4], [537, 189, 3], [387, 193, 2],
      [281, 195, 4], [414, 195, 3], [476, 197, 4], [555, 201, 4], [567, 201, 2], [526, 203, 4], [517, 205, 3],
      [625, 226, 3], [561, 227, 3], [699, 238, 5], [666, 240, 2], [707, 252, 2], [500, 254, 2], [624, 259, 4],
      [681, 259, 3], [600, 260, 3], [804, 267, 4], [851, 268, 2], [958, 273, 4], [744, 278, 4],
    ],
  },
  // Quiet Temple: magic stays SUBTLE (quiet, sacred, never flashy). Everything here is code, not paint,
  // so it moves and reacts to day/night.
  temple: {
    stars: { count: 80, maxY: 160 },
    glints: [
      [255, 169, 4], [893, 169, 5], [172, 170, 5], [772, 170, 2], [897, 172, 4], [861, 173, 2], [884, 173, 5],
      [107, 174, 3], [817, 174, 2], [877, 174, 5], [837, 176, 4], [261, 177, 4], [139, 179, 3], [197, 179, 3],
      [279, 179, 2], [760, 179, 4], [114, 180, 4], [167, 180, 4], [913, 181, 2], [820, 182, 2], [120, 184, 3],
      [865, 184, 3], [863, 187, 5], [117, 188, 5], [251, 188, 5], [810, 188, 4], [142, 190, 2], [175, 190, 4],
      [185, 190, 5], [211, 190, 5], [850, 190, 5], [867, 190, 2], [881, 191, 2], [757, 195, 3], [850, 195, 2],
      [203, 196, 4], [814, 196, 5], [192, 197, 5], [920, 197, 3], [190, 200, 4], [743, 201, 3], [148, 203, 4],
    ],
    motes: { x: 60, y: 250, w: 904, h: 300, rise: 70, count: 26 },
    portal: { x: 490, y: 127, w: 44, h: 105, color: [196, 186, 255] },
    ring: { x: 512, y: 318, rx: 118, ry: 26, dots: 120, periodMs: 90000 },
  },
};

export function renderAmbient(ctx: CanvasRenderingContext2D, roomId: string, pass: AmbientPass, t: number, night: number) {
  const cfg = AMBIENT[roomId];
  if (!cfg) return;
  ctx.save();
  if (pass === 'sky') drawStars(ctx, cfg, t, night);
  if (pass === 'back') { drawGlints(ctx, cfg, t, night); drawRing(ctx, cfg, t, night); drawPortalSpecks(ctx, cfg, t, night); }
  if (pass === 'front') { drawSparkles(ctx, cfg, t, night); drawPetals(ctx, cfg, t); }
  // motes go after the night overlay so fireflies really glow in the dark
  if (pass === 'glow') { drawBeacons(ctx, cfg, t, night); drawPortalGlow(ctx, cfg, t, night); drawMotes(ctx, cfg, t, night); }
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  if (!cfg.stars) return;
  const vis = clamp01((night - 0.35) / 0.5);
  if (vis <= 0) return;
  for (let i = 0; i < cfg.stars.count; i++) {
    const x = Math.floor(rand(i, 1) * 1024);
    const y = Math.floor(rand(i, 2) * cfg.stars.maxY);
    const tw = 0.55 + 0.45 * Math.sin(t * (0.0012 + rand(i, 3) * 0.0025) + rand(i, 4) * 6.28);
    const big = rand(i, 5) > 0.85;
    ctx.globalAlpha = vis * tw * (big ? 1 : 0.75);
    ctx.fillStyle = rand(i, 6) > 0.7 ? '#ffe9b8' : '#ffffff';
    ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
  }
}

function drawGlints(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  if (!cfg.glints) return;
  cfg.glints.forEach(([x, y, w], i) => {
    const period = 2200 + rand(i, 7) * 2800;
    const phase = rand(i, 8);
    const s = Math.sin(((t / period) + phase) * Math.PI * 2);
    const a = Math.pow(Math.max(0, s), 3);
    if (a < 0.02) return;
    const dx = Math.round(Math.sin(t / 900 + i) * 1);
    ctx.globalAlpha = a * (0.85 - 0.35 * night);
    ctx.fillStyle = night > 0.5 ? '#ffe6a8' : '#ffffff';
    ctx.fillRect(x + dx, y, w, 1);
  });
}

function drawSparkles(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  if (!cfg.sparkles) return;
  cfg.sparkles.forEach(([x, y], i) => {
    const period = 650 + rand(i, 9) * 700;
    const s = Math.sin(((t / period) + rand(i, 10)) * Math.PI * 2);
    const a = Math.pow(Math.max(0, s), 4);
    if (a < 0.05) return;
    ctx.globalAlpha = a * (0.9 - 0.4 * night);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 1);
    if (a > 0.7) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  });
}

function drawPetals(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number) {
  const p = cfg.petals;
  if (!p) return;
  for (let i = 0; i < p.count; i++) {
    const dur = 9000 + rand(i, 11) * 6000;
    const u = ((t / dur) + rand(i, 12)) % 1;
    const x0 = p.x + rand(i, 13) * p.w;
    const y0 = p.y + rand(i, 14) * p.h;
    const x = Math.round(x0 + u * p.drift + Math.sin(u * Math.PI * 4 + i) * 6);
    const y = Math.round(y0 + u * p.fall);
    const a = Math.min(clamp01(u / 0.1), clamp01((1 - u) / 0.25));
    const flip = Math.sin(t / 260 + i * 1.7) > 0;
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = p.colors[i % p.colors.length];
    ctx.fillRect(x, y, flip ? 2 : 1, flip ? 1 : 2);
  }
}

function drawBeacons(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  if (!cfg.beacons || night <= 0.15) return;
  for (const b of cfg.beacons) {
    const pulse = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin((t / b.periodMs) * Math.PI * 2)), 2);
    const k = clamp01((night - 0.15) / 0.5) * pulse;
    const [r, g, bl] = b.color;
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${0.8 * k})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = k;
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(b.x - 1, b.y - 1, 3, 2);
  }
}

/** Floor ring: a dotted inlay that turns slowly, with one brighter spot travelling around it.
 *  Cream marble is almost white, so the ring shows by COLOUR, not brightness: old gold by day, violet by night. */
function drawRing(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  const r = cfg.ring;
  if (!r) return;
  const turn = (t / r.periodMs) * Math.PI * 2;
  const breathe = 0.8 + 0.2 * Math.sin(t / 2600);
  const col = night > 0.5 ? '#8c79ff' : '#b08f45';
  for (let i = 0; i < r.dots; i++) {
    const ang = (i / r.dots) * Math.PI * 2 + turn;
    const x = Math.round(r.x + Math.cos(ang) * r.rx);
    const y = Math.round(r.y + Math.sin(ang) * r.ry);
    const head = Math.pow(Math.max(0, Math.cos(ang - turn * 3)), 12); // the travelling spot
    ctx.globalAlpha = Math.min(1, (0.42 + 0.25 * night) * breathe + head * 0.5);
    ctx.fillStyle = head > 0.6 ? (night > 0.5 ? '#e6e0ff' : '#fff1c4') : col;
    ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, 1);
  }
}

/** Star specks drifting slowly inside the dark doorway (like her hood: a door to somewhere else). */
function drawPortalSpecks(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  const p = cfg.portal;
  if (!p) return;
  for (let i = 0; i < 14; i++) {
    const dur = 7000 + rand(i, 21) * 7000;
    const u = ((t / dur) + rand(i, 22)) % 1;
    const x = Math.round(p.x + 3 + rand(i, 23) * (p.w - 6) + Math.sin(u * 6.28 + i) * 2);
    const y = Math.round(p.y + p.h - 4 - u * (p.h - 10));
    const a = Math.min(clamp01(u / 0.2), clamp01((1 - u) / 0.3));
    const tw = 0.5 + 0.5 * Math.sin(t / (300 + rand(i, 24) * 500) + i);
    ctx.globalAlpha = a * tw * (0.55 + 0.4 * night);
    ctx.fillStyle = rand(i, 25) > 0.6 ? '#ffe9b8' : '#cfc6ff';
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Soft light breathing out of the doorway, only after sunset. */
function drawPortalGlow(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  const p = cfg.portal;
  if (!p || night <= 0.2) return;
  const k = clamp01((night - 0.2) / 0.5) * (0.55 + 0.45 * Math.sin(t / 3200));
  const [r, g, b] = p.color;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h * 0.7;
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 70);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.32 * k})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - 70, cy - 70, 140, 140);
  ctx.globalCompositeOperation = 'source-over';
}

/** Motes rising slowly: warm sun dust by day, pale fireflies by night. */
function drawMotes(ctx: CanvasRenderingContext2D, cfg: AmbientConfig, t: number, night: number) {
  const m = cfg.motes;
  if (!m) return;
  for (let i = 0; i < m.count; i++) {
    const dur = 11000 + rand(i, 31) * 9000;
    const u = ((t / dur) + rand(i, 32)) % 1;
    const x = Math.round(m.x + rand(i, 33) * m.w + Math.sin(u * Math.PI * 3 + i) * 8);
    const y = Math.round(m.y + rand(i, 34) * m.h - u * m.rise);
    const a = Math.min(clamp01(u / 0.2), clamp01((1 - u) / 0.3));
    const tw = 0.6 + 0.4 * Math.sin(t / (500 + rand(i, 35) * 700) + i * 2);
    ctx.globalAlpha = a * tw * (0.35 + 0.5 * night);
    ctx.fillStyle = night > 0.5 ? (i % 4 === 0 ? '#d9d2ff' : '#fff2b0') : '#fffaf0';
    ctx.fillRect(x, y, 1, 1);
    if (night > 0.5 && tw > 0.9) { ctx.globalAlpha *= 0.4; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
}
