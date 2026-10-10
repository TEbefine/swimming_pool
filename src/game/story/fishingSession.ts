// Fishing IN THE WORLD — Yunseul stands at the end of the pier, swings his bamboo pole, the float lands
// in the river, and the whole minigame plays on the scene (no separate window).
//
//   fishing.ts        = the rules (phases, timing, reel physics)
//   fishingSession.ts = this file: runs those rules on the scene — Yunseul's fishing poses
//                       (public/sprites/outfits/dalbit/fish_*.webp), the line from the rod tip, float,
//                       splash, effort (shake + sweat), the fish held up, the big reel bar, sounds,
//                       and the story effects of a catch
//   FishingHud.tsx    = one short hint line, the reel bar canvas, the catch card (React)
//
// Input comes from App: ◯ (Game Boy) / E / O / Space = press (holding the key also lifts the net),
// ✕ / Esc = stop. Drawing is called by the engine every frame through engine.onDrawLayer.

import { useSyncExternalStore } from 'react';
import { sound } from '../audio';
import type { GameEngine } from '../Engine';
import { cast, difficultyOf, isOver, newFishing, press as pressRule, step, TUNING, type CastInfo, type FishingPhase, type FishingState } from './fishing';
import { ITEMS, itemIcon, withArticle, type ItemId } from './items';
import { addItem, addLedger, getStory, recordSize, setEnergy, setFlag } from './storyStore';
import { BOTTLE_NOTES, FREE_BY_ID, FREE_TABLE, TIERS, addToFishBook, freeIcon, freeTableNow } from '../fishing/freeFish';
import { bangkokHour } from '../world/cityView';

/** 'story' = The Heir of Dalbit (energy, bag, Ledger) · 'free' = Free Fishing with friends (Fish Book). */
export type FishingMode = 'story' | 'free';
let mode: FishingMode = 'story';

/** What the HUD shows about a catch. */
export interface CatchInfo {
  name: string;
  note: string;
  icon: string;
  /** Rarity label + colour (Free Fishing tiers; story shows its own rarity). */
  tier: string;
  tierColor: string;
  /** First time ever (Free Fishing). */
  isNew: boolean;
}

function catchInfo(id: string): CatchInfo {
  if (mode === 'free') {
    const f = FREE_BY_ID[id];
    const t = TIERS[f.tier];
    // protected animals are logged, then let go (the note says so)
    const note = id === 'bottle_message' ? `"${BOTTLE_NOTES[Math.floor(Math.random() * BOTTLE_NOTES.length)]}"` : f.note;
    return { name: f.name, note, icon: freeIcon(id), tier: t.label, tierColor: t.color, isNew: false };
  }
  const it = ITEMS[id as ItemId];
  const rare = it.catch?.rarity === 'rare';
  return { name: it.name, note: it.note, icon: itemIcon(id as ItemId), tier: rare ? 'Rare' : '', tierColor: rare ? '#E0A526' : '#9AA3A8', isNew: false };
}

/** Sentence name: "an eel" / "a Jade Moon Koi". */
function sayName(id: string): string {
  if (mode === 'free') {
    const n = FREE_BY_ID[id].name;
    return `${/^[AEIOU]/i.test(n) ? 'an' : 'a'} ${n}`;
  }
  return withArticle(id as ItemId);
}

/** Where Yunseul stands to fish: the right edge of the pier end, facing the open water. */
export const FISHING_SPOT = { x: 452, y: 222, facing: 1 as const };
/** Where you fish this time. Front-facing rooms (room.fishing, e.g. Quiet Bay): right where you stand on
 *  the edge, facing the camera, float in the water below. Otherwise the side-view pier spot above. */
let spot: { x: number; y: number; facing: 1 | -1 } = { ...FISHING_SPOT };
let front = false;
/** Where the float lands: x from right off the pier end (distance 0) to far out (distance 1). */
const CAST_X0 = 494;
const CAST_RANGE = 268;

// Throw timeline (ms after ◯): wind-up → swing → the float leaves the tip → it flies → splash
const WINDUP_MS = 240;
const SWING_MS = 140;
const THROW_DELAY = WINDUP_MS + 70; // float leaves the rod mid-swing
const AUTO_RELEASE_MS = 5000; // if a hold is never released (lost touch), throw anyway
const STRIKE_MS = 220;
const CATCH_SHOW_MS = 1600;
const MISS_SHOW_MS = 1300;

// ---- view for React (changes only when something visible to the HUD changes) --------------
export interface FishingView {
  active: boolean;
  phase: FishingPhase;
  /** The float is in the water (after the throw). */
  landed: boolean;
  caught: string | null;
  /** Name, note, icon, tier of the catch (for the card). */
  info: CatchInfo | null;
  mode: FishingMode;
  /** Fishing toward the camera (Quiet Bay): the HUD goes to the top so it never covers you or the float. */
  front: boolean;
  /** Caught without the fish ever leaving the net. */
  perfect: boolean;
  tired: boolean;
  /** Holding ◯ — the power gauge is running. */
  aiming: boolean;
  /** Size of the catch in cm (null for junk). */
  sizeCm: number | null;
  /** The catch beat the old best size. */
  record: boolean;
}

const EMPTY: Omit<FishingView, 'active' | 'mode' | 'front'> = { phase: 'ready', landed: false, caught: null, info: null, perfect: false, tired: false, aiming: false, sizeCm: null, record: false };
let view: FishingView = { active: false, mode: 'story', front: false, ...EMPTY };
const listeners = new Set<() => void>();
function emit(patch: Partial<FishingView>) {
  view = { ...view, ...patch };
  listeners.forEach((l) => l());
}
export function useFishingView(): FishingView {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => view,
    () => view,
  );
}
export function isFishing(): boolean {
  return view.active;
}

// ---- test hooks (?test=fishing only) --------------------------------------------------
export interface FishingTestHooks {
  forceFish?: string | null;
  onResult?: (phase: FishingPhase, fish: string | null, reelSeconds: number) => void;
  onCast?: (info: CastInfo) => void;
}
let testHooks: FishingTestHooks = {};
export function setFishingTestHooks(h: FishingTestHooks) {
  testHooks = h;
}

// ---- rod tips of the fishing poses (from the outfit manifest, written by process_fishing_sheet.py) ----
type Tip = { x: number; y: number };
let tips: Record<string, Tip> = {};
/** Front-facing catch frames: where the palm is (the fish is drawn there). */
let hands: Record<string, Tip> = {};
/** Every fishing frame this outfit has (some sheets have extra chill poses: sit, sip, yawn). */
let have = new Set<string>();
let tipsFor = '';
async function loadTips(outfit: string) {
  if (tipsFor === outfit) return;
  tipsFor = outfit;
  try {
    const res = await fetch(`/sprites/outfits/${outfit}/manifest.json`);
    const m = (await res.json()) as Record<string, { tip?: Tip; hand?: Tip }>;
    tips = {};
    hands = {};
    have = new Set();
    for (const [k, v] of Object.entries(m)) {
      if (!k.startsWith('fish_')) continue;
      have.add(k);
      if (v.tip) tips[k] = v.tip;
      if (v.hand) hands[k] = v.hand;
    }
  } catch {
    tips = {};
    hands = {};
    have = new Set();
  }
}
/** True when this outfit has real fishing poses (otherwise a simple rod is drawn in code). */
function hasPoses(): boolean {
  return !!tips.fish_wait_a;
}
/** This pose if the outfit has it, else the fallback. */
function pick(name: string, fallback: string): string {
  return have.has(name) ? name : fallback;
}
/** Standing pose when not fishing. */
function restPose(): string {
  return front ? 'idle' : 'side_idle';
}

// ---- session state ----------------------------------------------------------------
let engine: GameEngine | null = null;
let fs: FishingState = newFishing();
let held = false;
let lastTime = 0;
let castAt = 0; // performance.now() when the throw started
let target = { x: 560, y: 245 };
let reelStart = 0;
let endAt = 0; // when the last cast ended
let readyAt = 0; // when the rod came out (for the slow idle between casts)
let lastLedgerFish: string | null = null;
let pose = '';
let splashed = false;
let biteSounded = false;
// effort / effects
let tension = 0; // 0 calm … 1 about to snap (smoothed)
let leftNet = false;
let prevInNet = false;
let netFlashAt = 0;
let prevFishY = 0.5;
let fishTilt = 0;
interface Drop { x: number; y: number; vx: number; vy: number; born: number }
let drops: Drop[] = [];
let nextDropAt = 0;
// the cast
let chargeAt = 0; // when ◯ went down for the power gauge
let flightMs = 460;
let popText: { text: string; color: string; at: number } | null = null;

function landedAt(): number {
  return castAt + THROW_DELAY + flightMs;
}

/** Power gauge value 0…1: goes up, then back down, while ◯ is held. */
export function gaugeValue(now: number): number {
  const t = ((now - chargeAt) / TUNING.chargeSweepMs) % 2;
  return t < 1 ? t : 2 - t;
}

function setPose(name: string) {
  if (pose === name) return;
  pose = name;
  engine?.setPlayerPose(name, spot.facing);
}

/** Start fishing at the pier end: walk to the edge, face the water, throw. */
export async function startFishing(e: GameEngine, m: FishingMode = 'story') {
  if (view.active) return;
  engine = e;
  mode = m;
  e.setDialogFrozen(true);
  const fc = e.getRoom().fishing;
  front = !!fc;
  emit({ active: true, mode, front, ...EMPTY });
  spot = fc
    ? { x: Math.round(Math.max(fc.minX, Math.min(fc.maxX, e.localPlayer.x))), y: fc.standY, facing: 1 }
    : { ...FISHING_SPOT };
  await Promise.all([
    loadTips(e.getRoom().outfit),
    e.walkPlayerTo(spot.x, spot.y, spot.facing),
  ]);
  pose = '';
  fs = newFishing();
  endAt = 0;
  readyAt = performance.now();
  setPose(hasPoses() ? 'fish_ready' : restPose());
  // now hold ◯ to power up, let go to cast
}

/** Put the rod away (rod on the shoulder for a moment, then free to walk). */
export function stopFishing() {
  if (!view.active) return;
  held = false;
  fs = newFishing();
  drops = [];
  if (engine) {
    engine.localShakeX = 0;
    engine.cameraFocusX = null;
  }
  if (hasPoses() && have.has('fish_shoulder')) {
    setPose('fish_shoulder');
    const rest = restPose();
    window.setTimeout(() => {
      if (!view.active && engine?.localPlayer.currentAction === 'fish_shoulder') engine.setPlayerPose(rest);
    }, 700);
  } else {
    engine?.setPlayerPose(restPose(), spot.facing);
  }
  pose = '';
  engine?.setDialogFrozen(false);
  emit({ active: false, mode, ...EMPTY });
}

/** ◯ went down while ready: start the power gauge (Yunseul winds the rod back). */
function startAiming(now: number) {
  if (mode === 'story' && getStory().energy <= 0) {
    emit({ tired: true, phase: 'ready', caught: null, landed: false, aiming: false });
    setPose(hasPoses() ? 'fish_ready' : restPose());
    return;
  }
  chargeAt = now;
  fs = newFishing();
  if (engine) engine.cameraFocusX = null;
  emit({ ...EMPTY, aiming: true });
}

/** ◯ let go: throw as far as the gauge says. */
function release(now: number) {
  const power = gaugeValue(now);
  const info: CastInfo = {
    distance: power,
    nice: power >= TUNING.niceMin && power <= TUNING.niceMax,
  };
  popText = info.nice
    ? { text: 'Nice!', color: '#F4D98B', at: now }
    : power <= TUNING.weakMax
      ? { text: 'Oops...', color: '#CFCFCF', at: now }
      : power > TUNING.niceMax
        ? { text: 'Max!', color: '#FFFFFF', at: now }
        : null;
  throwLine(info);
}

function throwLine(info: CastInfo) {
  const e = engine;
  if (!e) return;
  const st = getStory();
  if (mode === 'story') setEnergy(st.energy - 1);
  const fc = e.getRoom().fishing;
  if (front && fc) {
    // facing the camera: a far cast lands LOWER on the screen (toward the viewer), a little to the right
    const w = fc.water;
    target = {
      x: Math.round(Math.min(w.maxX, spot.x + w.dx0 + info.distance * (w.dx1 - w.dx0) + (Math.random() - 0.5) * 10)),
      y: Math.round(w.y0 + info.distance * (w.y1 - w.y0) + (Math.random() - 0.5) * 6),
    };
  } else {
    // far water is higher on the screen (closer to the horizon)
    target = {
      x: Math.round(CAST_X0 + info.distance * CAST_RANGE + (Math.random() - 0.5) * 12),
      y: Math.round(262 - info.distance * 24 + (Math.random() - 0.5) * 12),
    };
  }
  flightMs = 340 + info.distance * 320;
  const now = performance.now();
  castAt = now - WINDUP_MS; // he is already wound up: go straight into the swing
  lastTime = now;
  splashed = false;
  biteSounded = false;
  tension = 0;
  drops = [];
  fs = mode === 'free'
    ? cast(Math.random, { table: testHooks.forceFish ? FREE_TABLE : freeTableNow(), info, forceFish: testHooks.forceFish, hour: bangkokHour() })
    : cast(Math.random, { firstCatch: !st.flags.first_catch, forceFish: testHooks.forceFish, info });
  testHooks.onCast?.(info);
  sound.playEmoteSound('jump'); // the swing whoosh
  if (!hasPoses()) e.triggerEmote('jump'); // old fallback: the hop = the throw
  emit({ ...EMPTY, phase: fs.phase });
}

/** ◯ pressed. */
export function fishingPress() {
  if (!view.active) return;
  const now = performance.now();
  if (view.tired || view.aiming) return;
  if (fs.phase === 'ready' || isOver(fs)) {
    if (now - endAt < 300) return; // don't recast by accident right after a pull
    startAiming(now);
    return;
  }
  if (fs.phase === 'waiting' && now < landedAt()) return; // float still in the air
  const next = pressRule(fs);
  if (next.phase === 'reel' && fs.phase === 'bite') {
    reelStart = now;
    leftNet = false;
    prevInNet = true;
    prevFishY = next.fishY;
    sound.playEmoteSound('jump'); // the strike whoosh
  }
  fs = next;
  if (isOver(fs)) finish(now);
  else if (fs.phase !== view.phase) emit({ phase: fs.phase });
}

/** Key held down (keyboard / touch hold) — lifts the net in the reel. */
export function fishingHold(down: boolean) {
  held = down;
  if (!down && view.active && view.aiming) release(performance.now());
}

function finish(now: number) {
  endAt = now;
  held = false;
  if (engine) engine.localShakeX = 0;
  const fish = fs.fish;
  const perfect = fs.phase === 'caught' && !leftNet;
  let record = false;
  let info: CatchInfo | null = null;
  if (fs.phase === 'caught' && fish) {
    info = catchInfo(fish);
    if (mode === 'free') {
      const r = addToFishBook(fish, fs.sizeCm);
      record = r.record;
      info.isNew = r.isNew;
      // tell everyone in the room about the big ones (chat bubble over your head)
      const f = FREE_BY_ID[fish];
      if (TIERS[f.tier].announce) {
        engine?.sendChat(`caught ${sayName(fish)}! [${TIERS[f.tier].label}]${fs.sizeCm !== null ? ` ${fs.sizeCm} cm` : ''}`);
      }
    } else {
      addItem(fish as ItemId);
      if (fs.sizeCm !== null) record = recordSize(fish as ItemId, fs.sizeCm);
      const st = getStory();
      if (!st.flags.first_catch) {
        setFlag('first_catch');
        addLedger(`Your first catch from the pier: ${sayName(fish)}.`);
      }
      if (ITEMS[fish as ItemId].catch?.rarity === 'rare' && !st.flags[`caught_${fish}`] && lastLedgerFish !== fish) {
        lastLedgerFish = fish;
        setFlag(`caught_${fish}`);
        addLedger(`You pulled ${sayName(fish)} from the river mouth. Not every day is like this.`);
      }
    }
    sound.playEmoteSound('happy');
    if (!hasPoses()) engine?.setPlayerPose('happy', spot.facing);
  } else {
    sound.playBuzzer();
    if (!hasPoses()) engine?.setPlayerPose('thinking', spot.facing);
  }
  const reel = fs.phase === 'caught' || fs.phase === 'escaped' ? (now - reelStart) / 1000 : 0;
  testHooks.onResult?.(fs.phase, fish, reel);
  emit({
    phase: fs.phase,
    caught: fs.phase === 'caught' ? fish : null,
    info,
    perfect,
    landed: false,
    sizeCm: fs.phase === 'caught' ? fs.sizeCm : null,
    record,
  });
}

// ---- per-frame update + drawing (called by the engine) --------------------------------
export function drawFishing(ctx: CanvasRenderingContext2D, layer: 'world' | 'top', now: number) {
  if (!view.active || !engine) return;
  if (layer === 'world') {
    update(now);
    drawWorld(ctx, now);
  } else {
    drawTop(ctx, now);
  }
}

function update(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (view.aiming && now - chargeAt > AUTO_RELEASE_MS) release(now);
  // phone camera: drift toward the float while it's out, back to Yunseul otherwise
  const e = engine!;
  const out = fs.phase === 'waiting' || fs.phase === 'bite' || fs.phase === 'reel';
  e.cameraFocusX = out ? e.localPlayer.x + (target.x - e.localPlayer.x) * 0.55 : null;

  if (fs.phase === 'waiting' && !splashed && now >= landedAt()) {
    splashed = true;
    sound.playSplash();
    emit({ landed: true });
  }
  if (fs.phase === 'waiting' && now < landedAt()) {
    // the fish can't bite a float in the air
  } else if (fs.phase === 'waiting' || fs.phase === 'bite' || fs.phase === 'reel') {
    const prev = fs.phase;
    fs = step(fs, dt, Math.random, held);
    if (fs.phase === 'bite' && !biteSounded) {
      biteSounded = true;
      sound.playEmoteSound('surprise');
    }
    if (isOver(fs)) finish(now);
    else if (fs.phase !== prev) emit({ phase: fs.phase });
  }

  // effort: how hard the pull feels right now
  if (fs.phase === 'reel') {
    const d = difficultyOf(fs);
    const want = fs.inNet ? 0.15 + d * 0.07 : 0.65 + (1 - fs.progress) * 0.35;
    tension += (want - tension) * Math.min(1, dt * 6);
    if (fs.inNet && !prevInNet) netFlashAt = now;
    if (!fs.inNet && now - reelStart > 600) leftNet = true;
    prevInNet = fs.inNet;
    const vy = dt > 0 ? (fs.fishY - prevFishY) / dt : 0;
    fishTilt += (Math.max(-0.5, Math.min(0.5, -vy * 0.9)) - fishTilt) * Math.min(1, dt * 10);
    prevFishY = fs.fishY;
  } else {
    tension += (0 - tension) * Math.min(1, dt * 8);
  }

  // shake (the sprite shakes sideways; the feet stay put) + sweat drops
  const p = engine!.localPlayer;
  const shake = fs.phase === 'reel' && tension > 0.45 ? Math.round(Math.sin(now / 21) * (tension > 0.75 ? 2 : 1)) : 0;
  engine!.localShakeX = shake;
  if (fs.phase === 'reel' && tension > 0.55 && now >= nextDropAt) {
    nextDropAt = now + 170 + Math.random() * 200;
    const side = Math.random() < 0.5 ? -1 : 1;
    drops.push({ x: p.x + side * (12 + Math.random() * 4), y: p.y - 72 - Math.random() * 6, vx: side * (18 + Math.random() * 18), vy: -30 - Math.random() * 20, born: now });
  }
  drops = drops.filter((dp) => now - dp.born < 520);
  for (const dp of drops) {
    dp.x += dp.vx * dt;
    dp.y += dp.vy * dt;
    dp.vy += 160 * dt;
  }

  if (hasPoses()) setPose(poseFor(now));
}

/** Which fishing frame Yunseul shows right now. */
function poseFor(now: number): string {
  if (view.tired) return 'fish_ready';
  if (view.aiming) return 'fish_windup';
  const t = now - castAt;
  switch (fs.phase) {
    case 'ready':
      return restingPose(now - readyAt);
    case 'waiting':
      if (t < WINDUP_MS) return 'fish_windup';
      if (t < WINDUP_MS + SWING_MS) return 'fish_cast';
      if (now < landedAt() + 250) return 'fish_follow';
      return waitPose(now - landedAt());
    case 'bite':
      return 'fish_bite';
    case 'reel': {
      if (now - reelStart < STRIKE_MS) return 'fish_strike';
      if (tension > 0.6 && have.has('fish_strain')) return 'fish_strain';
      const d = difficultyOf(fs);
      return Math.floor(now / (340 - d * 30)) % 2 === 0 ? 'fish_pull_a' : 'fish_pull_b';
    }
    case 'caught':
      if (now - endAt < CATCH_SHOW_MS) {
        // front-facing catch frames hold the fish in the hand: don't flicker between two hand spots
        if (front) return now - endAt < CATCH_SHOW_MS * 0.55 ? 'fish_catch' : pick('fish_cheer', 'fish_catch');
        return Math.floor((now - endAt) / 260) % 2 === 0 ? 'fish_catch' : 'fish_cheer';
      }
      return restingPose(now - endAt - CATCH_SHOW_MS);
    default: // scared / stolen / escaped
      return now - endAt < MISS_SHOW_MS ? 'fish_miss' : restingPose(now - endAt - MISS_SHOW_MS);
  }
}

/** Float in the water: stand and breathe (a sip of the drink on a longer wait, if the outfit has it). */
function waitPose(sinceLand: number): string {
  if (sinceLand > 3200 && sinceLand < 4400 && have.has('fish_sip')) return 'fish_sip';
  return Math.floor(sinceLand / 750) % 2 === 0 ? 'fish_wait_a' : 'fish_wait_b';
}

/** Between casts, nothing to do: the slow part of a fishing day. Stand a moment, then breathe with the
 *  rod out (a sip, a yawn), then sit down on the cooler box. Friends see you relaxing. */
function restingPose(s: number): string {
  if (!front || s < 3500) return 'fish_ready';
  if (have.has('fish_sit_a') && s > 11000) {
    return Math.floor((s - 11000) / 1400) % 3 === 2 ? pick('fish_sit_b', 'fish_sit_a') : 'fish_sit_a';
  }
  const beat = (s - 3500) % 3800;
  if (beat > 2600) {
    const extra = Math.floor((s - 3500) / 3800) % 2 === 0 ? 'fish_sip' : 'fish_yawn';
    if (have.has(extra)) return extra;
  }
  return Math.floor(s / 750) % 2 === 0 ? pick('fish_wait_a', 'fish_ready') : pick('fish_wait_b', 'fish_ready');
}

const C = {
  rod: '#5A3A22', rodHi: '#8A6440', line: '#EDE6D6', outline: '#2B1B12', red: '#C8503F', white: '#F4EEDC',
  foam: '#F2FAF6', ring: 'rgba(242,250,246,', shadow: 'rgba(18,38,52,0.55)',
  net: '#C9A56B', netHi: '#DDBB78', mesh: '#8A6440', meterBg: '#D8CBB0', meterLow: '#C8503F',
  sweat: '#E6F7FF', sweatEdge: '#2F6E96', gold: '#F4D98B',
};

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Chunky pixel line (no anti-aliasing). */
function pixLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  ctx.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), w, w);
  }
}

/** Fishing line with a little sag, drawn as dots. */
function sagLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5));
  ctx.fillStyle = C.line;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + sag * 4 * t * (1 - t);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Where the rod tip is right now (from the pose's recorded tip, or a simple drawn rod as fallback). */
function rodTip(now: number): { tip: Tip; hand: Tip | null } {
  const e = engine!;
  const p = e.localPlayer;
  const f = p.facing;
  const t = tips[e.localPlayer.currentAction];
  if (t) return { tip: { x: p.x + t.x * f + e.localShakeX, y: p.y + t.y }, hand: null };
  // fallback (outfits without fishing art): a short rod drawn in code
  const hand = { x: p.x + 9 * f, y: p.y - 34 };
  const reeling = fs.phase === 'reel';
  return {
    hand,
    tip: { x: hand.x + f * (reeling ? 20 : 26), y: hand.y - (reeling ? 30 : 28) + (reeling ? Math.round(Math.sin(now / 60)) : 0) },
  };
}

function floatPos(now: number, tip: Tip): { x: number; y: number; flying: boolean } {
  const t = (now - castAt - THROW_DELAY) / flightMs;
  if (t < 0) return { x: tip.x, y: tip.y + 4, flying: true };
  if (t < 1) {
    return {
      x: tip.x + (target.x - tip.x) * t,
      y: tip.y + (target.y - tip.y) * t - 50 * 4 * t * (1 - t),
      flying: true,
    };
  }
  return { x: target.x, y: target.y, flying: false };
}

function drawFloat(ctx: CanvasRenderingContext2D, x: number, y: number, dip: boolean) {
  // tiny red-and-white wooden bobber, 5×7 with outline
  px(ctx, x - 3, y - 6, 7, dip ? 6 : 9, C.outline);
  px(ctx, x - 2, y - 5, 5, 3, C.red);
  if (!dip) px(ctx, x - 2, y - 2, 5, 3, C.white);
  px(ctx, x - 1, y - 5, 1, 1, C.foam);
  ctx.globalAlpha = 0.8;
  px(ctx, x - 5, y + (dip ? 0 : 2), 11, 1, C.foam);
  ctx.globalAlpha = 1;
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const a = Math.max(0, 0.7 - r / 28);
  if (a <= 0) return;
  ctx.strokeStyle = C.ring + a + ')';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(Math.round(x) + 0.5, Math.round(y) + 0.5, r, Math.max(1, r / 3), 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWorld(ctx: CanvasRenderingContext2D, now: number) {
  const { tip, hand } = rodTip(now);
  const over = isOver(fs) || fs.phase === 'ready' || view.tired;

  if (hand) {
    // fallback rod (no fishing art for this outfit)
    pixLine(ctx, hand.x, hand.y, tip.x, tip.y, C.rod, 2);
    px(ctx, hand.x - 1, hand.y - 1, 3, 3, C.rodHi);
  }

  if (over) {
    // the line hangs loose from the tip
    if (!(fs.phase === 'caught' && now - endAt < CATCH_SHOW_MS)) sagLine(ctx, tip.x, tip.y, tip.x + 2, tip.y + 16, 0);
    return;
  }

  if (fs.phase === 'reel') {
    // the fish's shadow darting under the water; the line pulled tight toward it
    const fx = target.x + (fs.fishY - 0.5) * 56 + Math.sin(now / 90) * 2;
    const fy = target.y + Math.sin(now / 300) * 4;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, fx + (fs.fishY > prevFishY ? -12 : 9), fy - 1, 3, 3, C.shadow);
    // a tight line trembles when the pull is hard
    const tremble = tension > 0.5 ? Math.round(Math.sin(now / 17)) : 0;
    sagLine(ctx, tip.x, tip.y, fx, fy - 1, tension > 0.5 ? tremble : 3);
    // splashes when it fights (more when it's winning)
    const k = Math.floor(now / 120);
    if (k % (tension > 0.6 ? 2 : 5) === 0) {
      for (let i = 0; i < 4; i++) px(ctx, fx - 6 + i * 4, fy - 4 - ((k + i) % 3) * 2, 2, 2, C.foam);
    }
    ring(ctx, fx, fy, 6 + ((now / 40) % 14));
    return;
  }

  // waiting / bite: the float in the air or on the water
  const f = floatPos(now, tip);
  if (f.flying) {
    if (now - castAt >= THROW_DELAY) {
      sagLine(ctx, tip.x, tip.y, f.x, f.y, 0);
      drawFloat(ctx, f.x, f.y, false);
    }
    return;
  }

  const sinceLand = now - landedAt();
  const bob = fs.floatDown ? 2 : Math.round(Math.sin(now / 330));
  sagLine(ctx, tip.x, tip.y, f.x, f.y - 3 + bob, fs.phase === 'bite' ? 2 : 10);

  // landing splash
  if (sinceLand < 380) {
    const k = sinceLand / 380;
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (i / 7);
      px(ctx, f.x + Math.cos(a) * k * 12, f.y - Math.sin(a) * k * 14 + k * k * 12, 2, 2, C.foam);
    }
  }
  // gentle rings; three fast rings on the bite
  if (fs.phase === 'bite') {
    for (let r = 0; r < 3; r++) ring(ctx, f.x, f.y + 1, 4 + ((fs.t * 30 + r * 7) % 22));
  } else {
    ring(ctx, f.x, f.y + 1, 3 + ((sinceLand / 70) % 20));
  }

  if (fs.phase !== 'bite') drawFloat(ctx, f.x, f.y + bob, fs.floatDown);
}

/** The generic fish shadow in the reel bar (16 × 8, centred on 0,0). Never the real fish. */
const MYSTERY_FISH = [
  '....XXXXX.......',
  '..XXXXXXXXX...XX',
  '.XXXXXXXXXXX.XXX',
  'XXXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXX.',
  '.XXXXXXXXXXX.XXX',
  '..XXXXXXXXX...XX',
  '....XXXXX.......',
];
function drawMysteryFish(ctx: CanvasRenderingContext2D, inNet: boolean) {
  ctx.fillStyle = inNet ? '#2E4E57' : '#16303A';
  MYSTERY_FISH.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') ctx.fillRect(x - 8, y - 4, 1, 1);
  });
}

const iconCache: Record<string, HTMLImageElement> = {};
/** The fish's icon for canvas drawing (Free Fishing falls back to a stand-in until its sheet is cut). */
function icon(id: string): HTMLImageElement {
  const key = mode + ':' + id;
  let img = iconCache[key];
  if (!img) {
    img = new Image();
    img.onerror = () => {
      img.onerror = null;
      img.src = itemIcon('mackerel');
    };
    img.src = mode === 'free' ? freeIcon(id) : itemIcon(id as ItemId);
    iconCache[key] = img;
  }
  return img;
}

function drawBang(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x - 3, y - 1, 6, 12, C.outline);
  px(ctx, x - 3, y + 12, 6, 5, C.outline);
  px(ctx, x - 2, y, 4, 10, C.foam);
  px(ctx, x - 2, y + 13, 4, 3, C.foam);
}

/** A small pixel teardrop (5×7) — readable against sky and water. */
function drawSweat(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const X = Math.round(x) - 2;
  const Y = Math.round(y) - 3;
  px(ctx, X + 2, Y, 1, 1, C.sweatEdge);
  px(ctx, X + 1, Y + 1, 3, 1, C.sweatEdge);
  px(ctx, X, Y + 2, 5, 3, C.sweatEdge);
  px(ctx, X + 1, Y + 5, 3, 1, C.sweatEdge);
  px(ctx, X + 2, Y + 1, 1, 1, C.sweat);
  px(ctx, X + 1, Y + 2, 3, 3, C.sweat);
  px(ctx, X + 1, Y + 2, 1, 1, '#FFFFFF');
  ctx.globalAlpha = 1;
}

function drawTop(ctx: CanvasRenderingContext2D, now: number) {
  const p = engine!.localPlayer;

  // "!" over the float AND over Yunseul's head on the bite
  if (fs.phase === 'bite') {
    const hop = Math.floor(now / 80) % 2;
    drawBang(ctx, target.x, target.y - 26 + hop);
    drawBang(ctx, p.x + 2, p.y - 104 + hop);
  }

  // "Nice!" / "Max!" / "Oops..." over his head right after the throw
  if (popText && now - popText.at < 900) {
    const age = (now - popText.at) / 900;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - age) * 2);
    ctx.font = '700 14px "Pool Pixel Default", monospace';
    ctx.textAlign = 'center';
    const y = Math.round(p.y - 100 - age * 12);
    ctx.fillStyle = C.outline;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(popText.text, p.x + ox, y + oy);
    ctx.fillStyle = popText.color;
    ctx.fillText(popText.text, p.x, y);
    ctx.restore();
  }

  // sweat: one drop sliding down the side of his face while he strains + drops flying off his head
  if (fs.phase === 'reel' && tension > 0.6) {
    const slide = (now % 700) / 700;
    drawSweat(ctx, p.x + engine!.localShakeX - 13, p.y - 70 + slide * 8, 1);
  }
  for (const dp of drops) {
    drawSweat(ctx, dp.x, dp.y, Math.max(0, 1 - (now - dp.born) / 520));
  }

  // just caught: the fish held up over his raised hands
  if (fs.phase === 'caught' && fs.fish) {
    const age = now - endAt;
    if (age < CATCH_SHOW_MS) {
      const rise = Math.min(1, age / 220);
      const hand = hands[engine!.localPlayer.currentAction];
      const size = hand ? 22 : 26;
      // front-facing frames: the fish is held in the open palm(s) (green marker); else held up over the head
      const x = hand ? Math.round(p.x + hand.x * p.facing - size / 2) : Math.round(p.x + 1 - size / 2);
      const y = hand
        ? Math.round(p.y + hand.y - size / 2 - 2 - rise * 2)
        : Math.round(p.y - 104 - rise * 8 + (Math.floor(age / 260) % 2));
      const img = icon(fs.fish);
      if (img.complete && img.naturalWidth) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
      }
      // sparkles (gold ones for a perfect catch)
      const k = Math.floor(age / 120);
      for (let i = 0; i < (view.perfect ? 6 : 4); i++) {
        if ((k + i) % 3 === 0) continue;
        const a = (i / (view.perfect ? 6 : 4)) * Math.PI * 2 + age / 400;
        px(ctx, x + size / 2 + Math.cos(a) * 22, y + size / 2 + Math.sin(a) * 17, 2, 2, view.perfect ? C.gold : C.foam);
      }
    }
  }
}

// ---- the big reel bar (drawn by FishingHud on its own canvas, right side of the screen) ----
/** Size of the reel-bar canvas in pixels (CSS scales it up, pixelated). Extra margin for the shake/pop. */
export const REEL_BAR_W = 56;
export const REEL_BAR_H = 192;
const BAR_END_MS = 480; // how long the bar stays after the fight (flash on a catch, shake on an escape)

function easeOutBack(t: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

/** Wooden frame shared by the power gauge and the reel bar. Returns the inner column rect. */
function drawBarFrame(ctx: CanvasRenderingContext2D, now: number) {
  const X = 4;
  const Y = 4;
  const FH = REEL_BAR_H - 8;
  px(ctx, X, Y, 34, FH, C.outline);
  px(ctx, X + 1, Y + 1, 32, FH - 2, '#8A6440');
  px(ctx, X + 2, Y + 2, 30, FH - 4, '#6B4A2B');
  px(ctx, X + 1, Y + 1, 32, 1, '#B08A5C');
  for (const [pxX, pxY] of [[X + 3, Y + 4], [X + 28, Y + 4], [X + 3, Y + FH - 7], [X + 28, Y + FH - 7]]) px(ctx, pxX, pxY, 3, 3, '#C9A56B');
  const lb = Math.floor(now / 400) % 2;
  px(ctx, X + 14, Y + 2 + lb, 6, 8, C.outline);
  px(ctx, X + 15, Y + 3 + lb, 4, 3, C.red);
  px(ctx, X + 15, Y + 6 + lb, 4, 3, C.white);
  return { X, Y, FH, col: { x: X + 6, y: Y + 12, w: 22, h: FH - 24 } };
}

/** The casting power gauge: bottom = right by the pier, top = far deep water. */
function drawPowerGauge(ctx: CanvasRenderingContext2D, now: number, reducedMotion: boolean) {
  const W = REEL_BAR_W;
  const H = REEL_BAR_H;
  ctx.save();
  const inT = Math.min(1, (now - chargeAt) / 220);
  const s = reducedMotion ? 1 : easeOutBack(inT);
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
  const { X, col } = drawBarFrame(ctx, reducedMotion ? 0 : now);
  const yAt = (v: number) => col.y + col.h - v * col.h;

  // water by distance: shallow (near) at the bottom → deep (far) at the top
  px(ctx, col.x - 1, col.y - 1, col.w + 2, col.h + 2, C.outline);
  const zones: [number, number, string][] = [[0, 0.34, '#8CC7C5'], [0.34, 0.68, '#5B8F97'], [0.68, 1, '#34606B']];
  for (const [a, b, c] of zones) px(ctx, col.x, yAt(b), col.w, Math.round(yAt(a) - yAt(b)), c);
  // zone lines
  for (const v of [0.34, 0.68]) {
    ctx.fillStyle = 'rgba(242,250,246,0.45)';
    for (let xx = col.x; xx < col.x + col.w; xx += 3) ctx.fillRect(xx, Math.round(yAt(v)), 2, 1);
  }
  // the gold "Nice!" band
  const ny0 = Math.round(yAt(TUNING.niceMax));
  const ny1 = Math.round(yAt(TUNING.niceMin));
  const v = gaugeValue(now);
  const inNice = v >= TUNING.niceMin && v <= TUNING.niceMax;
  px(ctx, col.x, ny0, col.w, ny1 - ny0, inNice ? '#FFE9A8' : '#E0B84E');
  px(ctx, col.x, ny0, col.w, 1, C.outline);
  px(ctx, col.x, ny1 - 1, col.w, 1, C.outline);
  if (inNice && !reducedMotion) {
    for (let i = 0; i < 3; i++) px(ctx, col.x + 3 + i * 7, ny0 + 2 + ((Math.floor(now / 90) + i) % 3), 2, 2, '#FFFFFF');
  }
  // fill up to the power + the float riding on top
  const fy = Math.round(yAt(v));
  ctx.globalAlpha = 0.35;
  px(ctx, col.x, fy, col.w, col.y + col.h - fy, '#F2FAF6');
  ctx.globalAlpha = 1;
  px(ctx, col.x - 2, fy - 1, col.w + 4, 2, C.outline);
  const bx = col.x + col.w / 2 - 4;
  px(ctx, bx, fy - 8, 8, 11, C.outline);
  px(ctx, bx + 1, fy - 7, 6, 4, C.red);
  px(ctx, bx + 1, fy - 3, 6, 4, C.white);
  px(ctx, bx + 2, fy - 6, 1, 1, C.foam);

  // small side ticks for the three zones (far / mid / near)
  const m = { x: X + 38, w: 8 };
  for (const [a, b, c] of zones) {
    px(ctx, m.x - 1, yAt(b) - 1, m.w + 2, Math.round(yAt(a) - yAt(b)) + 2, C.outline);
    px(ctx, m.x, yAt(b), m.w, Math.round(yAt(a) - yAt(b)), c);
  }
  // a tiny wave mark per zone: 1 = near, 2 = mid, 3 = far
  zones.forEach(([a, b], i) => {
    const cy = Math.round((yAt(a) + yAt(b)) / 2);
    for (let k = 0; k <= i; k++) px(ctx, m.x + 2, cy - i * 2 + k * 4, 4, 1, '#F2FAF6');
  });
  ctx.restore();
}

/** Returns false after clearing a finished bar, so the HUD can stop requesting frames. */
export function drawReelBar(ctx: CanvasRenderingContext2D, now: number, reducedMotion = false): boolean {
  const W = REEL_BAR_W;
  const H = REEL_BAR_H;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  if (view.aiming) {
    drawPowerGauge(ctx, now, reducedMotion);
    return true;
  }
  const ended = fs.phase === 'caught' || fs.phase === 'escaped';
  if (fs.phase !== 'reel' && !(ended && now - endAt < BAR_END_MS)) return false;
  const endT = ended ? (now - endAt) / BAR_END_MS : 0;

  ctx.save();
  // pop in (overshoot) at the strike; on a catch it swells a little, on an escape it shakes hard
  const inT = Math.min(1, (now - reelStart) / 260);
  let s = reducedMotion ? 1 : easeOutBack(inT);
  if (fs.phase === 'caught' && !reducedMotion) s = 1 + 0.08 * Math.sin(Math.min(1, endT) * Math.PI);
  const amp = reducedMotion ? 0 : fs.phase === 'escaped' ? 3 : fs.phase === 'reel' ? (tension > 0.8 ? 2 : tension > 0.55 ? 1 : 0) : 0;
  const sx = amp ? Math.round(Math.sin(now / 19) * amp) : 0;
  const sy = amp > 1 ? Math.round(Math.cos(now / 23)) : 0;
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
  ctx.globalAlpha = fs.phase === 'escaped' ? Math.max(0, 1 - endT) : 1;

  const X = 4; // left edge of the frame (margin for the shake)
  const Y = 4;
  const FH = H - 8;
  const col = { x: X + 6, y: Y + 12, w: 22, h: FH - 24 }; // water column

  // wooden frame
  px(ctx, X, Y, 34, FH, C.outline);
  px(ctx, X + 1, Y + 1, 32, FH - 2, '#8A6440');
  px(ctx, X + 2, Y + 2, 30, FH - 4, '#6B4A2B');
  px(ctx, X + 1, Y + 1, 32, 1, '#B08A5C');
  for (const [pxX, pxY] of [[X + 3, Y + 4], [X + 28, Y + 4], [X + 3, Y + FH - 7], [X + 28, Y + FH - 7]]) px(ctx, pxX, pxY, 3, 3, '#C9A56B');
  // tiny float on top as a label (bobs)
  const lb = reducedMotion ? 0 : Math.floor(now / 400) % 2;
  px(ctx, X + 14, Y + 2 + lb, 6, 8, C.outline);
  px(ctx, X + 15, Y + 3 + lb, 4, 3, C.red);
  px(ctx, X + 15, Y + 6 + lb, 4, 3, C.white);

  // water column: light at the top, deep at the bottom
  px(ctx, col.x - 1, col.y - 1, col.w + 2, col.h + 2, C.outline);
  const bands = ['#78AEB0', '#6A9FA4', '#5B8F97', '#4E808A', '#44767F', '#3F6E78'];
  const bh = Math.ceil(col.h / bands.length);
  bands.forEach((c, i) => px(ctx, col.x, col.y + i * bh, col.w, Math.max(0, Math.min(bh, col.h - i * bh)), c));
  // rising bubbles (faster when the fish is fighting)
  const speed = 22 - tension * 10;
  for (let i = 0; !reducedMotion && i < 6; i++) {
    const by = col.y + col.h - ((now / speed + i * 31) % col.h);
    px(ctx, col.x + 3 + ((i * 7) % (col.w - 6)), by, 2, 2, 'rgba(242,250,246,0.55)');
  }

  // the net (hemp mesh) — flashes when the fish swims in
  const ny = Math.round(col.y + col.h - (fs.netY + TUNING.netSize) * col.h);
  const nh = Math.round(TUNING.netSize * col.h);
  px(ctx, col.x, ny, col.w, nh, fs.inNet ? C.netHi : C.net);
  ctx.fillStyle = C.mesh;
  for (let yy = ny + 3; yy < ny + nh - 1; yy += 4) ctx.fillRect(col.x, yy, col.w, 1);
  for (let xx = col.x + 3; xx < col.x + col.w; xx += 4) ctx.fillRect(xx, ny, 1, nh);
  const flash = reducedMotion ? 0 : Math.max(0, 1 - (now - netFlashAt) / 180);
  if (flash > 0) {
    ctx.globalAlpha *= 0.7 * flash;
    px(ctx, col.x, ny, col.w, nh, '#FFFFFF');
    ctx.globalAlpha = fs.phase === 'escaped' ? Math.max(0, 1 - endT) : 1;
  }
  px(ctx, col.x - 1, ny - 1, col.w + 2, 2, C.outline);
  px(ctx, col.x - 1, ny + nh - 1, col.w + 2, 2, C.outline);

  // the fish: a MYSTERY shadow, the same for every fish — what you hooked stays hidden until it's
  // caught (before, the real icon was drawn with ctx.filter, which Safari / iPhone ignore → the fish
  // showed in full colour). Plain fillRects, so it looks the same in every browser.
  if (fs.fish && fs.phase !== 'escaped') {
    icon(fs.fish); // start loading the real icon now, so it's ready to show in his hands on a catch
    const cy = col.y + col.h - fs.fishY * col.h;
    const wig = reducedMotion ? 0 : Math.sin(now / 55) * (tension > 0.6 ? 2 : 1);
    ctx.save();
    ctx.translate(Math.round(col.x + col.w / 2 + wig), Math.round(cy));
    ctx.rotate(reducedMotion ? 0 : fishTilt);
    drawMysteryFish(ctx, fs.inNet);
    ctx.restore();
  }

  // catch meter (right): red → yellow → green, glows near full, blinks when the line is in danger
  const m = { x: X + 38, y: col.y, w: 8, h: col.h };
  const danger = fs.phase === 'reel' && fs.progress < 0.2 && (reducedMotion || Math.floor(now / 120) % 2 === 0);
  px(ctx, m.x - 1, m.y - 1, m.w + 2, m.h + 2, danger ? C.meterLow : C.outline);
  px(ctx, m.x, m.y, m.w, m.h, C.meterBg);
  const prog = fs.phase === 'caught' ? 1 : fs.progress;
  const mh = Math.round(prog * m.h);
  const mc = prog > 0.66 ? '#7DB35F' : prog > 0.25 ? '#D9B44A' : C.meterLow;
  px(ctx, m.x, m.y + m.h - mh, m.w, mh, mc);
  px(ctx, m.x, m.y + m.h - mh, m.w, 1, 'rgba(255,255,255,0.6)');
  if (!reducedMotion && prog > 0.85 && Math.floor(now / 100) % 2 === 0) px(ctx, m.x + 1, m.y + m.h - mh + 2, 2, Math.max(0, mh - 4), 'rgba(255,255,255,0.35)');

  // catch flash + sparkles
  if (fs.phase === 'caught' && !reducedMotion) {
    const a = Math.max(0, 1 - endT * 1.6);
    ctx.globalAlpha = a * 0.75;
    px(ctx, X, Y, 48, FH, '#FFFFFF');
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 10 + endT * 30;
      px(ctx, X + 24 + Math.cos(ang) * r, Y + FH / 2 + Math.sin(ang) * r * 2.4, 2, 2, view.perfect ? C.gold : C.foam);
    }
  }
  ctx.restore();
  return true;
}
