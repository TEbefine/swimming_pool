// Fishing minigame logic — no drawing, no React. FishingGame.tsx draws it and feeds it input.
//
//   ready ──◯──▶ waiting (fake nibbles) ──▶ bite (float goes under) ──◯ in time──▶ reel ──▶ caught
//                  │ ◯ too early                 │ too slow                          │ progress 0
//                  ▼                             ▼                                   ▼
//               scared                        stolen                               escaped
//
// Father's rule is the whole skill: "Don't pull when it bites. Pull when it turns."
// Nibbles are the fish "biting"; the float going fully under is the fish "turning".
//
// Numbers live in TUNING so the feel can be changed in one place.

import { ITEMS, type Habitat, type ItemId, type Rarity } from './items';

export const TUNING = {
  /** Chance of each rarity per cast (must add to 1). */
  rarity: { common: 0.61, uncommon: 0.25, rare: 0.04, junk: 0.1 } as Record<Rarity, number>,
  /** Seconds before the real bite: min + random * spread. */
  waitMin: 2.2,
  waitSpread: 3.5,
  /** Fake nibbles before the real bite: 0..maxNibbles (more for harder fish). */
  maxNibbles: 3,
  nibbleTime: 0.28,
  /** How long the float stays under = the strike window. Shrinks with difficulty. */
  biteWindow: (d: number) => 1.0 - 0.12 * d, // d1 0.88 s … d5 0.40 s
  /** Reel bar: 0 = bottom, 1 = top. */
  netSize: 0.3, // height of the net zone (small net)
  gravity: 1.6, // how fast the net sinks (units/s²)
  tapLift: 0.55, // upward kick per ◯ press (units/s)
  holdLift: 3.0, // extra lift while a key is held (units/s²)
  maxSpeed: 1.1,
  /** Fish movement per difficulty: how fast it swims and how often it changes its mind. */
  fishSpeed: (d: number) => 0.18 + 0.12 * d,
  fishTurnEvery: (d: number) => 1.6 - 0.22 * d,
  /** Catch meter: starts at `progressStart`, fills in the net, drains outside. */
  progressStart: 0.3,
  fillRate: 0.34,
  drainRate: 0.22,

  // ---- the cast (power gauge) ----
  /** Gauge speed: ms for one sweep bottom → top (then it comes back down). */
  chargeSweepMs: 900,
  /** Distance zones along the gauge / the water (0 = at the pier, 1 = as far as he can throw). */
  zone: (distance: number): Exclude<Habitat, 'any'> => (distance < 0.34 ? 'near' : distance < 0.68 ? 'mid' : 'far'),
  /** "Nice!" band on the gauge — a clean, strong throw. */
  niceMin: 0.8,
  niceMax: 0.92,
  /** A flop: the float barely leaves the pier. */
  weakMax: 0.1,
  /** How much a fish prefers its home zone (weight when it matches / lives anywhere / wrong zone). */
  habitatMatch: 5,
  habitatAny: 1.5,
  habitatMiss: 0.35,
  /** Rarity multipliers for a Nice! cast and for a flop. */
  niceRarity: { common: 0.85, uncommon: 1.3, rare: 1.6, junk: 0.4 } as Record<Rarity, number>,
  weakRarity: { common: 1, uncommon: 0.7, rare: 0.3, junk: 2.5 } as Record<Rarity, number>,
  /** A Nice! cast: the fish comes sooner. */
  niceWait: 0.6,
  /** Top share of a species' size range that counts as "big" — big fish fight 1 level harder. */
  bigShare: 0.8,
};

/** How the line was thrown. */
export interface CastInfo {
  /** 0 = right at the pier … 1 = the longest throw. */
  distance: number;
  nice: boolean;
}

// ---- fish tables (the story's 10 fish, or Free Fishing's 32) ------------------------------
/** One kind of fish (or treasure) that can come out of the water. */
export interface Species {
  id: string;
  /** Rarity tier id (story: common/uncommon/rare/junk · free: common/rare/epic/legend/god). */
  tier: string;
  where: Habitat;
  /** Size range in cm (none for junk / treasure). */
  size?: [number, number];
  difficulty: number;
  /** Only bites at this time of day (Bangkok time). */
  time?: 'day' | 'night';
}
export interface TierDef {
  id: string;
  /** Chance weight per cast. */
  weight: number;
  /** Multipliers for a Nice! cast and for a flop. */
  nice: number;
  weak: number;
}
export interface FishTable {
  species: Species[];
  tiers: TierDef[];
}

/** The story's table, built from the item contract (items.ts). */
export const STORY_TABLE: FishTable = {
  species: Object.entries(ITEMS)
    .filter(([, d]) => d.catch)
    .map(([id, d]) => ({ id, tier: d.catch!.rarity, where: d.catch!.where, size: d.catch!.size, difficulty: d.catch!.difficulty })),
  tiers: (['common', 'uncommon', 'rare', 'junk'] as Rarity[]).map((r) => ({ id: r, weight: 0, nice: 1, weak: 1 })),
};
// story tier numbers live in TUNING so they stay tunable in one place
function storyTiers(): TierDef[] {
  return STORY_TABLE.tiers.map((t) => ({
    id: t.id,
    weight: TUNING.rarity[t.id as Rarity],
    nice: TUNING.niceRarity[t.id as Rarity],
    weak: TUNING.weakRarity[t.id as Rarity],
  }));
}

export type FishingPhase = 'ready' | 'waiting' | 'bite' | 'reel' | 'caught' | 'scared' | 'stolen' | 'escaped';

export interface FishingState {
  phase: FishingPhase;
  /** What is on the hook (chosen at the cast, hidden until the end). */
  fish: string | null;
  /** Its difficulty before the size bonus. */
  baseDiff: number;
  /** Seconds spent in the current phase. */
  t: number;
  /** waiting: when the real bite comes, and when each fake nibble happens. */
  biteAt: number;
  nibbles: number[];
  /** True while the float is dipping (a nibble or the bite). */
  floatDown: boolean;
  /** reel */
  netY: number;
  netV: number;
  fishY: number;
  fishTarget: number;
  fishTurnIn: number;
  progress: number;
  /** True while the fish is inside the net. */
  inNet: boolean;
  /** The very first catch of the story: plays like the easiest fish, whatever it is. */
  easy: boolean;
  /** Size of what's on the hook, in cm (null for junk). Decided at the cast. */
  sizeCm: number | null;
  /** In the top of its size range → fights one level harder. */
  big: boolean;
}

export type Rng = () => number;

export function newFishing(): FishingState {
  return {
    phase: 'ready', fish: null, baseDiff: 1, t: 0, biteAt: 0, nibbles: [], floatDown: false,
    netY: 0, netV: 0, fishY: 0.5, fishTarget: 0.5, fishTurnIn: 0, progress: 0, inNet: false, easy: false,
    sizeCm: null, big: false,
  };
}

function pickWeighted<T>(rng: Rng, items: T[], weight: (t: T) => number): T {
  const total = items.reduce((a, t) => a + weight(t), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

/** Is it day or night now (for night-only / day-only fish)? 6:00–18:59 = day. */
export function isDayHour(hour: number): boolean {
  return hour >= 6 && hour < 19;
}

/** Pick what bites from a table. Distance decides WHERE you fish (each fish has a home zone); a Nice!
 *  cast tilts the odds toward rarer tiers; a flop mostly brings up the lowest tier. `hour` filters
 *  day-only / night-only fish. */
export function rollFrom(rng: Rng, table: FishTable, info: CastInfo, hour = 12): Species {
  const weak = info.distance <= TUNING.weakMax;
  const zone = TUNING.zone(info.distance);
  const day = isDayHour(hour);
  const open = table.species.filter((sp) => !sp.time || (sp.time === 'day') === day);
  const habitat = (sp: Species) =>
    sp.where === 'any' ? TUNING.habitatAny : sp.where === zone ? TUNING.habitatMatch : TUNING.habitatMiss;
  const tiers = table.tiers.filter((t) => open.some((sp) => sp.tier === t.id));
  const tier = pickWeighted(rng, tiers, (t) => {
    const pool = open.filter((sp) => sp.tier === t.id);
    const fit = Math.max(...pool.map(habitat)) / TUNING.habitatMatch;
    const lowest = t === tiers[tiers.length - 1];
    return t.weight * (info.nice ? t.nice : weak ? t.weak : 1) * (lowest ? 1 : Math.max(0.25, fit));
  });
  return pickWeighted(rng, open.filter((sp) => sp.tier === tier.id), habitat);
}

/** Size in cm: random inside the range, pushed toward big by a Nice! cast and a matching zone. */
export function sizeFrom(rng: Rng, sp: Species, info: CastInfo): number | null {
  if (!sp.size) return null;
  const inZone = sp.where === 'any' || sp.where === TUNING.zone(info.distance);
  let u = rng();
  const pull = (info.nice ? 1.9 : 1) * (inZone ? 1.25 : 0.8); // > 1 = skews big, < 1 = skews small
  u = 1 - Math.pow(1 - u, pull);
  return Math.round(sp.size[0] + (sp.size[1] - sp.size[0]) * u);
}

/** Story helpers (kept for the simulations and older callers). */
export function rollFish(rng: Rng, firstCatch = false, info: CastInfo = { distance: 0.5, nice: false }): ItemId {
  if (firstCatch) return 'mackerel';
  return rollFrom(rng, { ...STORY_TABLE, tiers: storyTiers() }, info).id as ItemId;
}
export function rollSize(rng: Rng, fish: ItemId, info: CastInfo): number | null {
  const sp = STORY_TABLE.species.find((x) => x.id === fish);
  return sp ? sizeFrom(rng, sp, info) : null;
}

export function difficultyOf(s: Pick<FishingState, 'easy' | 'baseDiff'> & Partial<Pick<FishingState, 'big'>>): number {
  if (s.easy) return 1;
  return Math.min(5, s.baseDiff + (s.big ? 1 : 0));
}

export interface CastOptions {
  info?: CastInfo;
  /** Which fish can bite (default: the story's). */
  table?: FishTable;
  /** The story's very first cast: always an easy mackerel. */
  firstCatch?: boolean;
  /** Test mode: always hook this one. */
  forceFish?: string | null;
  /** Hour of the day (0–23) for day/night fish. */
  hour?: number;
}

/** Throw the line. */
export function cast(rng: Rng, opts: CastOptions = {}): FishingState {
  const info = opts.info ?? { distance: 0.5, nice: false };
  const isStory = !opts.table;
  const table = opts.table ?? { ...STORY_TABLE, tiers: storyTiers() };
  const firstCatch = !!opts.firstCatch && !opts.forceFish && isStory;
  const sp: Species =
    (opts.forceFish && table.species.find((x) => x.id === opts.forceFish)) ||
    (firstCatch ? table.species.find((x) => x.id === 'mackerel')! : rollFrom(rng, table, info, opts.hour));
  const sizeCm = firstCatch ? 30 : sizeFrom(rng, sp, info);
  const big = !firstCatch && !!sp.size && sizeCm !== null && sizeCm >= sp.size[0] + (sp.size[1] - sp.size[0]) * TUNING.bigShare;
  const baseDiff = sp.difficulty;
  const d = firstCatch ? 1 : difficultyOf({ easy: false, baseDiff, big });
  const wait = (TUNING.waitMin + rng() * TUNING.waitSpread) * (info.nice ? TUNING.niceWait : 1);
  const biteAt = Math.max(1.4, wait);
  const count = firstCatch ? 1 : Math.min(TUNING.maxNibbles, Math.floor(rng() * (1 + Math.ceil(d / 2))) );
  const nibbles: number[] = [];
  for (let i = 0; i < count; i++) nibbles.push(0.8 + rng() * Math.max(0.1, biteAt - 1.4));
  nibbles.sort((a, b) => a - b);
  return { ...newFishing(), phase: 'waiting', fish: sp.id, baseDiff, biteAt, nibbles, easy: firstCatch, sizeCm, big };
}

/** ◯ pressed (any phase). Returns the new state. */
export function press(s: FishingState): FishingState {
  switch (s.phase) {
    case 'waiting':
      // Pulled on a nibble (or on nothing): too early.
      return { ...s, phase: 'scared', t: 0, floatDown: false };
    case 'bite':
      return {
        ...s, phase: 'reel', t: 0, floatDown: false,
        netY: 0.1, netV: 0, fishY: 0.35, fishTarget: 0.5, fishTurnIn: 0.4, progress: TUNING.progressStart,
      };
    case 'reel':
      return { ...s, netV: Math.min(TUNING.maxSpeed, s.netV + TUNING.tapLift) };
    default:
      return s;
  }
}

/** Advance time. `held` = the key is being held down (keyboard / touch on the panel). */
export function step(s: FishingState, dt: number, rng: Rng, held = false): FishingState {
  const t = s.t + dt;
  const d = difficultyOf(s);

  if (s.phase === 'waiting') {
    if (t >= s.biteAt) return { ...s, phase: 'bite', t: 0, floatDown: true };
    const floatDown = s.nibbles.some((n) => t >= n && t < n + TUNING.nibbleTime);
    return { ...s, t, floatDown };
  }

  if (s.phase === 'bite') {
    if (t >= TUNING.biteWindow(d)) return { ...s, phase: 'stolen', t: 0, floatDown: false };
    return { ...s, t };
  }

  if (s.phase === 'reel') {
    // Net: sinks with gravity, lifted by taps / holding.
    let netV = s.netV - TUNING.gravity * dt + (held ? TUNING.holdLift * dt : 0);
    netV = Math.max(-TUNING.maxSpeed, Math.min(TUNING.maxSpeed, netV));
    let netY = s.netY + netV * dt;
    const top = 1 - TUNING.netSize;
    if (netY < 0) { netY = 0; netV = Math.max(0, netV) * 0.3; }
    if (netY > top) { netY = top; netV = Math.min(0, netV); }

    // Fish: swims toward a target, picks a new one now and then (harder fish = faster, more often).
    let { fishTarget, fishTurnIn } = s;
    fishTurnIn -= dt;
    if (fishTurnIn <= 0) {
      fishTarget = 0.05 + rng() * 0.9;
      fishTurnIn = TUNING.fishTurnEvery(d) * (0.6 + rng() * 0.8);
    }
    const speed = TUNING.fishSpeed(d);
    const diff = fishTarget - s.fishY;
    const fishY = s.fishY + Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);

    const inNet = fishY >= netY && fishY <= netY + TUNING.netSize;
    const progress = Math.max(0, Math.min(1, s.progress + (inNet ? TUNING.fillRate : -TUNING.drainRate) * dt));
    if (progress >= 1) return { ...s, phase: 'caught', t: 0, progress, netY, fishY, inNet };
    if (progress <= 0) return { ...s, phase: 'escaped', t: 0, progress, netY, fishY, inNet };
    return { ...s, t, netY, netV, fishY, fishTarget, fishTurnIn, progress, inNet };
  }

  return { ...s, t };
}

/** Short line for the current phase (shown under the water). */
export function hint(s: FishingState): string {
  switch (s.phase) {
    case 'ready': return 'Press ◯ to cast the line.';
    case 'waiting': return s.floatDown ? '...a nibble.' : 'Wait for it...';
    case 'bite': return 'It turned! PULL!';
    case 'reel': return 'Tap ◯ to lift the net. Keep the fish inside!';
    case 'caught': return '';
    case 'scared': return "Too early. Don't pull when it bites...";
    case 'stolen': return 'Too slow. It stole the bait.';
    case 'escaped': return 'It slipped away.';
  }
}

export function isOver(s: FishingState): boolean {
  return s.phase === 'caught' || s.phase === 'scared' || s.phase === 'stolen' || s.phase === 'escaped';
}
