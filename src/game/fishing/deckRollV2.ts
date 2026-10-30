// V2 protocol snapshot. Never change a published version's roll; add a new version instead.
// Reuse only the immutable v1 species/calendar/size data: no live catalogue or minigame tuning.
import { DECK_RULES_V1 as RULES, DECK_SPECIES_V1 as DECK_SPECIES_V2 } from './deckRollV1.js';
import type { DeckSpeciesV1 } from './deckRollV1.js';
import { canonicalDeckCast, deckContextAt } from './deckKernelV1.js';
import type { DeckRollInput, DeckCatch } from './deckKernelV1.js';
export { DECK_SPECIES_V2 };
export const DECK_TIERS_V2 = Object.freeze([
  { id: 'god', weight: 0.3, nice: 2, weak: 0.05 },
  { id: 'legend', weight: 0.9, nice: 1.8, weak: 0.2 },
  { id: 'epic', weight: 10, nice: 1.5, weak: 0.4 },
  { id: 'rare', weight: 26, nice: 1.2, weak: 0.7 },
  { id: 'common', weight: 60, nice: 0.8, weak: 1.3 },
].map(tier => Object.freeze(tier)));

export function createDeckRngV2(seed: string, castIndex: number): () => number {
  if (typeof seed !== 'string' || !/^[0-9a-f]{64}$/.test(seed)) throw new RangeError('Invalid deck seed.');
  if (!Number.isSafeInteger(castIndex) || castIndex < 0 || castIndex >= 8192) throw new RangeError('Invalid deck cast index.');
  const key = `lumen-bay/fishing-roll/v2:${seed}:${castIndex}`;
  let state = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rng: () => number, values: readonly T[], weight: (value: T) => number): T {
  let remaining = rng() * values.reduce((sum, value) => sum + weight(value), 0);
  for (const value of values) {
    remaining -= weight(value);
    if (remaining <= 0) return value;
  }
  return values[values.length - 1];
}

/** V2 roll: legend weight 0.9 and its own random-stream domain; timing/story are independent. */
export function rollDeckCatch(input: DeckRollInput): DeckCatch {
  if (!input || input.version !== 2) throw new RangeError('Unsupported fishing deck version.');
  const rng = createDeckRngV2(input.seed, input.castIndex);
  const { zone, quality } = canonicalDeckCast(input.castInfo);
  const { day, season } = deckContextAt(input.castAt);
  const open = DECK_SPECIES_V2.filter((fish) => (!fish.time || (fish.time === 'day') === day) && (!fish.season || fish.season === season));
  const habitat = (fish: DeckSpeciesV1) => fish.where === 'any' ? RULES.habitatAny : fish.where === zone ? RULES.habitatMatch : RULES.habitatMiss;
  const tiers = DECK_TIERS_V2.filter((tier) => open.some((fish) => fish.tier === tier.id));
  const tier = pickWeighted(rng, tiers, (candidate) => {
    const fit = Math.max(...open.filter((fish) => fish.tier === candidate.id).map(habitat)) / RULES.habitatMatch;
    const lowest = candidate === tiers[tiers.length - 1];
    return candidate.weight * (quality === 'nice' ? candidate.nice : quality === 'weak' ? candidate.weak : 1)
      * (lowest ? 1 : Math.max(RULES.minTierFit, fit));
  });
  const fish = pickWeighted(rng, open.filter((candidate) => candidate.tier === tier.id), habitat);
  let sizeCm: number | null = null;
  if (fish.size) {
    const inZone = fish.where === 'any' || fish.where === zone;
    const pull = (quality === 'nice' ? RULES.niceSizePull : 1) * (inZone ? RULES.matchingSizePull : RULES.otherSizePull);
    const u = 1 - Math.pow(1 - rng(), pull);
    sizeCm = Math.round(fish.size[0] + (fish.size[1] - fish.size[0]) * u);
  }
  const big = !!fish.size && sizeCm !== null && sizeCm >= fish.size[0] + (fish.size[1] - fish.size[0]) * RULES.bigShare;
  return { fish: fish.id, sizeCm, baseDiff: fish.difficulty, big };
}
