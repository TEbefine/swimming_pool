// Protocol snapshot of the live free-fishing roll at main 79bd8d0 (sheets A/B only).
// Deliberately independent of mutable TIERS/TUNING/READY_SHEETS: later odds tuning or new art must not
// silently change an outstanding v1 ticket. No story code imports this file. Keep v1 when adding v2.
export type DeckZone = 'near' | 'mid' | 'far';
export type DeckSeason = 'hot' | 'rainy' | 'cool';
export interface DeckSpeciesV1 {
  readonly id: string;
  readonly tier: 'common' | 'rare' | 'epic' | 'legend' | 'god';
  readonly where: DeckZone | 'any';
  readonly size?: readonly [number, number];
  readonly difficulty: number;
  readonly time?: 'day' | 'night';
  readonly season?: DeckSeason;
}

export const DECK_RULES_V1 = Object.freeze({
  nearEnd: 0.34, midEnd: 0.68, weakMax: 0.1, niceMin: 0.8, niceMax: 0.92,
  habitatMatch: 5, habitatAny: 1.5, habitatMiss: 0.35, minTierFit: 0.25,
  niceSizePull: 1.9, matchingSizePull: 1.25, otherSizePull: 0.8, bigShare: 0.8,
  bangkokOffsetMs: 7 * 60 * 60_000, dayStartHour: 6, nightStartHour: 19,
  hotStart: 216, hotEnd: 515, rainyStart: 516, rainyEnd: 1015,
});

// Order is part of the wire protocol: rarest first; the lowest tier is not reduced by habitat fit.
export const DECK_TIERS_V1 = Object.freeze([
  { id: 'god', weight: 0.3, nice: 2, weak: 0.05 },
  { id: 'legend', weight: 3.5, nice: 1.8, weak: 0.2 },
  { id: 'epic', weight: 10, nice: 1.5, weak: 0.4 },
  { id: 'rare', weight: 26, nice: 1.2, weak: 0.7 },
  { id: 'common', weight: 60, nice: 0.8, weak: 1.3 },
].map((tier) => Object.freeze(tier)));

const species: DeckSpeciesV1[] = [
  { id: 'sardine', tier: 'common', where: 'any', size: [12, 22], difficulty: 1 },
  { id: 'tilapia', tier: 'common', where: 'near', size: [15, 35], difficulty: 1 },
  { id: 'carp', tier: 'common', where: 'mid', size: [30, 70], difficulty: 2 },
  { id: 'catfish', tier: 'common', where: 'near', size: [30, 80], difficulty: 2 },
  { id: 'snakehead', tier: 'rare', where: 'near', size: [30, 90], difficulty: 3 },
  { id: 'pomfret', tier: 'common', where: 'mid', size: [15, 30], difficulty: 2 },
  { id: 'barramundi', tier: 'rare', where: 'mid', size: [40, 120], difficulty: 3 },
  { id: 'red_snapper', tier: 'rare', where: 'far', size: [30, 80], difficulty: 3 },
  { id: 'grouper', tier: 'rare', where: 'far', size: [40, 150], difficulty: 4 },
  { id: 'pufferfish', tier: 'rare', where: 'near', size: [10, 30], difficulty: 2 },
  { id: 'giant_gourami', tier: 'rare', where: 'mid', size: [30, 70], difficulty: 3 },
  { id: 'bluefin_tuna', tier: 'epic', where: 'far', size: [100, 300], difficulty: 5 },
  { id: 'arowana', tier: 'epic', where: 'mid', size: [50, 90], difficulty: 4 },
  { id: 'mekong_catfish', tier: 'epic', where: 'far', size: [150, 300], difficulty: 5 },
  { id: 'oarfish', tier: 'epic', where: 'far', size: [300, 800], difficulty: 4 },
  { id: 'coelacanth', tier: 'legend', where: 'far', size: [100, 200], difficulty: 5 },
  { id: 'armorfish', tier: 'legend', where: 'far', size: [300, 600], difficulty: 5 },
  { id: 'megalodon_pup', tier: 'legend', where: 'far', size: [200, 400], difficulty: 5 },
  { id: 'ammonite', tier: 'epic', where: 'near', size: [5, 30], difficulty: 2 },
  { id: 'fossil_fish', tier: 'rare', where: 'near', difficulty: 1 },
  { id: 'dragon_gate_carp', tier: 'legend', where: 'mid', size: [60, 120], difficulty: 5 },
  { id: 'jade_moon_koi', tier: 'legend', where: 'mid', size: [50, 100], difficulty: 4, time: 'night' },
  { id: 'lantern_fish', tier: 'epic', where: 'near', size: [15, 30], difficulty: 3, time: 'night' },
  { id: 'abyss_angler', tier: 'epic', where: 'far', size: [20, 60], difficulty: 4 },
  { id: 'ghost_pirate_fish', tier: 'legend', where: 'far', size: [40, 90], difficulty: 4, time: 'night' },
  { id: 'pearl_oyster', tier: 'epic', where: 'near', size: [10, 20], difficulty: 2 },
  { id: 'baby_kraken', tier: 'legend', where: 'far', size: [80, 200], difficulty: 5 },
  { id: 'star_swallower', tier: 'legend', where: 'far', size: [30, 70], difficulty: 5, time: 'night' },
  { id: 'sun_carp', tier: 'god', where: 'far', size: [100, 180], difficulty: 5, time: 'day' },
  { id: 'moon_whale', tier: 'god', where: 'far', size: [400, 700], difficulty: 5, time: 'night' },
  { id: 'bottle_message', tier: 'common', where: 'any', difficulty: 1 },
  { id: 'treasure_chest', tier: 'legend', where: 'any', difficulty: 4 },
];

export const DECK_SPECIES_V1: readonly DeckSpeciesV1[] = Object.freeze(species.map((fish) => {
  if (fish.size) Object.freeze(fish.size);
  return Object.freeze(fish);
}));
