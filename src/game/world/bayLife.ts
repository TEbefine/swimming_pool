// Quiet Bay — small living things drawn from little sprite strips (public/sprites/bay/, cut by
// scripts/process_bay_life.py). Like ambient.ts everything is worked out from the clock — no state — so
// every player sees the same gull on the same bollard at the same moment.
//
//   day   : a gull flying across now and then · a gull resting on a bollard · a fish jumping in the bay ·
//           the harbour cat walking along the breakwater, then napping by the bench
//   night : squid boats far out with their lamps · a night heron on the stone shore · glowing jellyfish
//           and "umi-hotaru" (sea fireflies: tiny blue specks) at the foot of the wall
//   people: anyone fishing gets a bucket and a cooler box beside them (+ a lit lantern on the lid at night);
//           OTHER players' floats and lines are drawn too, so you see your friends fishing.
//
// Passes (from ambient.ts / Engine): 'back' = right after the painting (behind people) · 'glow' = after
// the night overlay (lights really glow) · drawFisherProps() = from the Engine's depth-sorted player list.

import type { PlayerData } from '../types';
import { QUIET_BAY_BOLLARDS } from '../rooms/quietBayLayout';

const ROOM = 'lake_pier';

interface Strip { w: number; h: number; frames: number }
const STRIPS: Record<string, Strip> = {
  gull_fly: { w: 24, h: 22, frames: 4 },
  gull_stand: { w: 19, h: 16, frames: 4 },
  fish_jump: { w: 20, h: 25, frames: 4 },
  cat_walk: { w: 17, h: 17, frames: 4 },
  squid_boat: { w: 46, h: 25, frames: 4 },
  heron: { w: 33, h: 24, frames: 4 },
  jelly: { w: 13, h: 12, frames: 4 },
  paper_lantern: { w: 9, h: 12, frames: 2 },
  camp_lantern: { w: 7, h: 12, frames: 2 },
  bucket: { w: 9, h: 10, frames: 1 },
  cooler: { w: 17, h: 15, frames: 1 },
  cat_sleep: { w: 18, h: 14, frames: 1 },
};

const imgs: Record<string, HTMLImageElement> = {};
function img(name: string): HTMLImageElement | null {
  let im = imgs[name];
  if (!im) {
    im = new Image();
    im.src = `/sprites/bay/${name}.webp`;
    imgs[name] = im;
  }
  return im.complete && im.naturalWidth ? im : null;
}

/** Draw frame `f` of a strip, bottom-centre at (x, y). flip = face left. */
function frame(ctx: CanvasRenderingContext2D, name: string, f: number, x: number, y: number, flip = false, alpha = 1) {
  const s = STRIPS[name];
  const im = img(name);
  if (!im || alpha <= 0) return;
  const fi = ((Math.floor(f) % s.frames) + s.frames) % s.frames;
  const dx = Math.round(x - s.w / 2);
  const dy = Math.round(y - s.h);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.translate(dx + s.w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(im, fi * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
  } else {
    ctx.drawImage(im, fi * s.w, 0, s.w, s.h, dx, dy, s.w, s.h);
  }
  ctx.restore();
}

/** Stable 0..1 random from an integer seed. */
const rand = (i: number, salt = 0) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Lantern glows recorded during this frame's depth pass, drawn in the 'glow' pass.
let lanterns: { x: number; y: number; camp: boolean }[] = [];

/** Called from ambient.ts for room 'lake_pier'. */
export function drawBayLife(ctx: CanvasRenderingContext2D, pass: 'back' | 'glow', t: number, night: number) {
  if (pass === 'back') {
    lanterns = [];
    const day = night < 0.55;
    if (day) {
      drawFlyingGull(ctx, t);
      drawRestingGull(ctx, t);
      drawJumpingFish(ctx, t, 1);
    } else {
      drawSquidBoats(ctx, t, night);
      drawHeron(ctx, t);
      drawJumpingFish(ctx, t, 0.6); // fish still jump at night, just harder to see
    }
    drawCat(ctx, t);
  } else {
    if (night > 0.45) {
      drawBoatLamps(ctx, t, night);
      drawJellies(ctx, t, night);
      drawSeaFireflies(ctx, t, night);
      drawLanternGlows(ctx, t, night);
    }
  }
}

// ---- day -----------------------------------------------------------------------------------------

/** Every 32 s a gull crosses the sky (14 s), alternating direction and height. */
function drawFlyingGull(ctx: CanvasRenderingContext2D, t: number) {
  const SLOT = 32000;
  const k = Math.floor(t / SLOT);
  const u = (t % SLOT) / 14000;
  if (u >= 1) return;
  const ltr = k % 2 === 0;
  const x = ltr ? -20 + u * 1064 : 1044 - u * 1064;
  const y = 52 + rand(k, 1) * 70 + Math.sin(u * Math.PI * 3) * 6;
  frame(ctx, 'gull_fly', t / 130, x, y, !ltr);
}

/** A gull rests on one bollard for ~40 s of every 70 s (looks around, calls, fluffs). */
function drawRestingGull(ctx: CanvasRenderingContext2D, t: number) {
  const SLOT = 70000;
  const k = Math.floor(t / SLOT);
  if ((t % SLOT) > 40000) return;
  const [bx, by] = QUIET_BAY_BOLLARDS[Math.floor(rand(k, 2) * QUIET_BAY_BOLLARDS.length)];
  const beat = Math.floor(t / 900);
  // mostly still; now and then look at the viewer / call / fluff
  const r = rand(beat, 3);
  const f = r < 0.7 ? 0 : r < 0.82 ? 1 : r < 0.9 ? 2 : 3;
  frame(ctx, 'gull_stand', f, bx + 1, by, rand(k, 4) < 0.5);
}

/** One fish jumps somewhere in the open bay every ~20 s. */
function drawJumpingFish(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  const SLOT = 20000;
  const k = Math.floor(t / SLOT);
  const start = 2000 + rand(k, 5) * 14000;
  const age = (t % SLOT) - start;
  if (age < 0 || age > 1800) return;
  const x = 90 + rand(k, 6) * 840;
  const y = 215 + rand(k, 7) * 105;
  const flip = rand(k, 8) < 0.5;
  if (age < 640) frame(ctx, 'fish_jump', age / 160, x, y, flip, alpha);
  // rings where it went back in
  const r0 = age / 60;
  for (let i = 0; i < 2; i++) {
    const r = r0 - i * 6;
    const a = Math.max(0, 0.6 - r / 26) * alpha;
    if (r <= 0 || a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#eaf6ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(x + (flip ? -6 : 6)) + 0.5, Math.round(y - 2) + 0.5, r, Math.max(1, r / 3), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** The harbour cat (180 s loop): naps by the bench → walks to the lighthouse → naps there → walks back. */
function drawCat(ctx: CanvasRenderingContext2D, t: number) {
  const L = 180000;
  const u = t % L;
  const A = { x: 300, y: 380 }; // in front of the bench
  const B = { x: 800, y: 362 }; // by the lighthouse platform
  const WALK = 32000;
  if (u < 60000) {
    frame(ctx, 'cat_sleep', 0, A.x, A.y);
  } else if (u < 60000 + WALK) {
    const k = (u - 60000) / WALK;
    frame(ctx, 'cat_walk', u / 160, A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, false);
  } else if (u < 148000) {
    frame(ctx, 'cat_sleep', 0, B.x, B.y, true);
  } else {
    const k = (u - 148000) / WALK;
    frame(ctx, 'cat_walk', u / 160, B.x + (A.x - B.x) * k, B.y + (A.y - B.y) * k, true);
  }
}

// ---- night ---------------------------------------------------------------------------------------

const BOATS = [
  { y: 226, period: 260000, phase: 0.1 },
  { y: 248, period: 340000, phase: 0.62 },
];
/** Boats drift slowly right → left across the bay (they start left of the lighthouse, so they never
 *  pass in front of it), fading in at the start of each trip. */
function boatX(i: number, t: number) {
  const b = BOATS[i];
  const u = ((t / b.period) + b.phase) % 1;
  return 790 - u * 880;
}
function boatFade(i: number, t: number) {
  const b = BOATS[i];
  const u = ((t / b.period) + b.phase) % 1;
  return clamp01(u / 0.04);
}

function drawSquidBoats(ctx: CanvasRenderingContext2D, t: number, night: number) {
  const a = clamp01((night - 0.55) / 0.3);
  BOATS.forEach((b, i) => {
    const x = boatX(i, t);
    const bob = Math.sin(t / 900 + i) > 0.6 ? 1 : 0;
    frame(ctx, 'squid_boat', t / (500 + i * 90), x, b.y + bob, false, a * boatFade(i, t));
  });
}

/** The lamps glow warm after the night overlay (squid boats fish with bright lights). */
function drawBoatLamps(ctx: CanvasRenderingContext2D, t: number, night: number) {
  const k = clamp01((night - 0.45) / 0.4);
  BOATS.forEach((b, i) => {
    const x = boatX(i, t);
    const flick = (0.85 + 0.15 * Math.sin(t / 170 + i * 2)) * boatFade(i, t);
    const cx = x - 9;
    const cy = b.y - 18;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    g.addColorStop(0, `rgba(255, 238, 190, ${0.55 * k * flick})`);
    g.addColorStop(1, 'rgba(255, 238, 190, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 30, cy - 30, 60, 60);
    // the lamp row itself + its long reflection on the water
    ctx.globalAlpha = k * flick;
    ctx.fillStyle = '#fff4cf';
    for (let j = 0; j < 3; j++) ctx.fillRect(Math.round(x - 17 + j * 5), Math.round(cy), 2, 2);
    ctx.globalAlpha = 0.35 * k * flick;
    for (let j = 0; j < 6; j++) ctx.fillRect(Math.round(x - 14 + Math.sin(t / 400 + j) * 2), Math.round(b.y + 3 + j * 3), 6 - j, 1);
    ctx.restore();
  });
}

/** A black-crowned night heron waiting on the stone shore (left), now and then catching a fish. */
function drawHeron(ctx: CanvasRenderingContext2D, t: number) {
  const beat = Math.floor(t / 1100);
  const r = rand(beat, 9);
  const f = r < 0.65 ? 0 : r < 0.85 ? 1 : r < 0.93 ? 2 : 3;
  frame(ctx, 'heron', f, 36, 396, false);
}

const JELLIES = [
  { x: 210, y: 506, drift: 30, period: 52000 },
  { x: 560, y: 540, drift: 40, period: 61000 },
  { x: 820, y: 498, drift: 26, period: 47000 },
];
function drawJellies(ctx: CanvasRenderingContext2D, t: number, night: number) {
  const k = clamp01((night - 0.45) / 0.4);
  JELLIES.forEach((j, i) => {
    const u = (t / j.period + i * 0.3) % 1;
    const x = j.x + Math.sin(u * Math.PI * 2) * j.drift;
    const y = j.y + Math.sin(u * Math.PI * 4 + i) * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - 6, 0, x, y - 6, 14);
    g.addColorStop(0, `rgba(170, 220, 255, ${0.28 * k})`);
    g.addColorStop(1, 'rgba(170, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, y - 20, 28, 28);
    ctx.restore();
    frame(ctx, 'jelly', t / 520 + i, x, y, false, 0.7 * k);
  });
}

/** Umi-hotaru: tiny blue specks that blink along the foot of the breakwater wall. */
function drawSeaFireflies(ctx: CanvasRenderingContext2D, t: number, night: number) {
  const k = clamp01((night - 0.5) / 0.35);
  ctx.save();
  ctx.fillStyle = '#7fd8ff';
  for (let i = 0; i < 46; i++) {
    const x = Math.round(80 + rand(i, 11) * 880);
    const y = Math.round(461 + rand(i, 12) * 9);
    const tw = Math.pow(Math.max(0, Math.sin(t / (700 + rand(i, 13) * 900) + rand(i, 14) * 6.28)), 3);
    if (tw < 0.05) continue;
    ctx.globalAlpha = k * tw;
    ctx.fillRect(x, y, 1, 1);
    if (tw > 0.8) { ctx.globalAlpha = k * tw * 0.35; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
  ctx.restore();
}

function drawLanternGlows(ctx: CanvasRenderingContext2D, t: number, night: number) {
  const k = clamp01((night - 0.45) / 0.4);
  for (const l of lanterns) {
    const flick = 0.85 + 0.15 * Math.sin(t / 130 + l.x);
    const cy = l.y - 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(l.x, cy, 0, l.x, cy, 34);
    const c = l.camp ? '255, 240, 200' : '255, 170, 120';
    g.addColorStop(0, `rgba(${c}, ${0.5 * k * flick})`);
    g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(l.x - 34, cy - 34, 68, 68);
    ctx.restore();
    // redraw the lit lantern bright, on top of the darkness
    frame(ctx, l.camp ? 'camp_lantern' : 'paper_lantern', Math.floor(t / 400) % 2, l.x, l.y, false, k);
  }
}

// ---- people fishing ------------------------------------------------------------------------------

/** Rod tips per fishing pose (from the room outfit's manifest), for OTHER players' lines. */
let tipsFor = '';
let tips: Record<string, { x: number; y: number }> = {};
function loadTips(outfit: string) {
  if (tipsFor === outfit) return;
  tipsFor = outfit;
  fetch(`/sprites/outfits/${outfit}/manifest.json`)
    .then((r) => r.json())
    .then((m: Record<string, { tip?: { x: number; y: number } }>) => {
      tips = {};
      for (const [k, v] of Object.entries(m)) if (v.tip) tips[k] = v.tip;
    })
    .catch(() => { tips = {}; });
}

function idHash(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const WAITING = /^fish_(wait|sit|sip|yawn)/;
const FIGHT = /^fish_(bite|strike|pull|strain)/;

/**
 * Called by the Engine for every player whose pose starts with 'fish_' in this room.
 * 'under' = before the sprite (bucket, cooler box, lantern) · 'over' = after it (another player's line + float).
 */
export function drawFisherProps(
  ctx: CanvasRenderingContext2D, roomId: string, outfit: string, player: PlayerData,
  x: number, isLocal: boolean, layer: 'under' | 'over', t: number, night: number,
) {
  if (roomId !== ROOM) return;
  const a = player.currentAction;
  const y = player.y;
  if (layer === 'under') {
    // the gear on his left (the rod goes out to the right): bucket, cooler box, and at night a lantern on its lid
    frame(ctx, 'bucket', 0, x - 42, y + 1);
    frame(ctx, 'cooler', 0, x - 26, y + 2);
    if (night > 0.45) {
      const camp = idHash(player.id, 1) < 0.5;
      const lx = x - 28;
      const ly = y + 2 - STRIPS.cooler.h + 3;
      frame(ctx, camp ? 'camp_lantern' : 'paper_lantern', 0, lx, ly);
      lanterns.push({ x: lx, y: ly, camp });
    }
    return;
  }
  if (isLocal) return; // your own line + float are drawn by the fishing session
  loadTips(outfit);
  const tip = tips[a];
  if (!tip) return;
  const tx = x + tip.x * (player.facing || 1);
  const ty = y + tip.y;
  // each friend's float sits in a fixed spot in front of them (from their id)
  const fx = x + 48 + idHash(player.id, 2) * 22;
  const fy = 478 + idHash(player.id, 3) * 46;
  ctx.save();
  if (WAITING.test(a)) {
    const bob = Math.round(Math.sin(t / 330 + idHash(player.id, 4) * 6));
    dotLine(ctx, tx, ty, fx, fy - 3 + bob, 10);
    // float: red over white, with a foam line
    ctx.fillStyle = '#2B1B12'; ctx.fillRect(Math.round(fx) - 3, Math.round(fy) - 6 + bob, 7, 9);
    ctx.fillStyle = '#C8503F'; ctx.fillRect(Math.round(fx) - 2, Math.round(fy) - 5 + bob, 5, 3);
    ctx.fillStyle = '#F4EEDC'; ctx.fillRect(Math.round(fx) - 2, Math.round(fy) - 2 + bob, 5, 3);
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#F2FAF6'; ctx.fillRect(Math.round(fx) - 5, Math.round(fy) + 2 + bob, 11, 1);
  } else if (FIGHT.test(a)) {
    const sx = fx + Math.sin(t / 90) * 6;
    dotLine(ctx, tx, ty, sx, fy, 2);
    ctx.fillStyle = 'rgba(18,38,52,0.55)';
    ctx.beginPath(); ctx.ellipse(sx, fy, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (Math.floor(t / 120) % 3 === 0) {
      ctx.fillStyle = '#F2FAF6';
      for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(sx - 5 + i * 5), Math.round(fy - 4 - (i % 2) * 2), 2, 2);
    }
  }
  ctx.restore();
}

function dotLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5));
  ctx.fillStyle = '#EDE6D6';
  ctx.globalAlpha = 0.85;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * u), Math.round(y0 + (y1 - y0) * u + sag * 4 * u * (1 - u)), 1, 1);
  }
  ctx.globalAlpha = 1;
}
