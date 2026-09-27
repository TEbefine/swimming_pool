// Ambient life drawn in code on top of painted postcard scenes (stars, water glints, sparkles,
// falling petals, lighthouse beacon). Everything is deterministic from the clock — no state.
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
};

export function renderAmbient(ctx: CanvasRenderingContext2D, roomId: string, pass: AmbientPass, t: number, night: number) {
  const cfg = AMBIENT[roomId];
  if (!cfg) return;
  ctx.save();
  if (pass === 'sky') drawStars(ctx, cfg, t, night);
  if (pass === 'back') drawGlints(ctx, cfg, t, night);
  if (pass === 'front') { drawSparkles(ctx, cfg, t, night); drawPetals(ctx, cfg, t); }
  if (pass === 'glow') drawBeacons(ctx, cfg, t, night);
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
