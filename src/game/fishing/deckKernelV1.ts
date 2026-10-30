// Frozen v1 roll kernel. Preserve this algorithm/domain and deckRollV1.ts when tuning later versions.
// Issuance/redemption chooses its active version separately; old vectors still run this kernel.
import { DECK_RULES_V1 as RULES, DECK_SPECIES_V1, DECK_TIERS_V1 } from './deckRollV1.js';
import type { DeckSeason, DeckSpeciesV1, DeckZone } from './deckRollV1.js';

export interface DeckCastInfo { readonly distance: number; readonly nice: boolean }
export interface DeckRollInput {
  readonly version: number;
  /** Canonical lowercase hex encoding of the 32-byte server HMAC output (NOT the server secret). */
  readonly seed: string;
  readonly castIndex: number;
  readonly castInfo: DeckCastInfo;
  /** Server-adjusted timestamp at the cast; do not substitute catch/receipt time when verifying. */
  readonly castAt: number;
}
export interface DeckCatch {
  fish: string;
  sizeCm: number | null;
  baseDiff: number;
  big: boolean;
}

/** Only five accepted roll states. Extra distance precision cannot select more random streams. */
export function canonicalDeckCast(info: DeckCastInfo): { zone: DeckZone; quality: 'weak' | 'normal' | 'nice' } {
  if (!info || !Number.isFinite(info.distance) || info.distance < 0 || info.distance > 1 || typeof info.nice !== 'boolean') {
    throw new RangeError('Invalid deck cast quality.');
  }
  const nice = info.distance >= RULES.niceMin && info.distance <= RULES.niceMax;
  if (info.nice !== nice) throw new RangeError('Nice must match the cast distance band.');
  const zone = info.distance < RULES.nearEnd ? 'near' : info.distance < RULES.midEnd ? 'mid' : 'far';
  return { zone, quality: nice ? 'nice' : info.distance <= RULES.weakMax ? 'weak' : 'normal' };
}

/** Versioned Bangkok calendar, with no ambient clock, timezone, locale or URL overrides. */
export function deckContextAt(castAt: number): { day: boolean; season: DeckSeason } {
  if (!Number.isSafeInteger(castAt) || castAt < 0) throw new RangeError('Invalid deck cast time.');
  const bkk = new Date(castAt + RULES.bangkokOffsetMs);
  if (!Number.isFinite(bkk.getTime())) throw new RangeError('Invalid deck cast time.');
  const hour = bkk.getUTCHours();
  const md = (bkk.getUTCMonth() + 1) * 100 + bkk.getUTCDate();
  return {
    day: hour >= RULES.dayStartHour && hour < RULES.nightStartHour,
    season: md >= RULES.hotStart && md <= RULES.hotEnd ? 'hot' : md >= RULES.rainyStart && md <= RULES.rainyEnd ? 'rainy' : 'cool',
  };
}

/** Explicit mulberry32 stream per (seed,index). Non-cryptographic; look-ahead is accepted in v1.
 * FNV-1a folds the canonical ASCII domain/seed/index into uint32; every arithmetic step is specified.
 * The card stream is independent of call order, cast quality, timestamps and minigame frame count. */
export function createDeckRng(seed: string, castIndex: number): () => number {
  if (typeof seed !== 'string' || !/^[0-9a-f]{64}$/.test(seed)) throw new RangeError('Invalid deck seed.');
  if (!Number.isSafeInteger(castIndex) || castIndex < 0 || castIndex >= 8192) throw new RangeError('Invalid deck cast index.');
  const key = `lumen-bay/fishing-roll/v1:${seed}:${castIndex}`;
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

/** V1 snapshots the existing rollFrom/sizeFrom maths without importing or changing Dalbit's rules.
 * Only this function is used by future client/server ticket consumers; the legacy minigame stays put. */
export function rollDeckCatch(input: DeckRollInput): DeckCatch {
  if (!input || input.version !== 1) throw new RangeError('Unsupported fishing deck version.');
  const rng = createDeckRng(input.seed, input.castIndex);
  const { zone, quality } = canonicalDeckCast(input.castInfo);
  const { day, season } = deckContextAt(input.castAt);
  const open = DECK_SPECIES_V1.filter((fish) => (!fish.time || (fish.time === 'day') === day) && (!fish.season || fish.season === season));
  const habitat = (fish: DeckSpeciesV1) => fish.where === 'any' ? RULES.habitatAny : fish.where === zone ? RULES.habitatMatch : RULES.habitatMiss;
  const tiers = DECK_TIERS_V1.filter((tier) => open.some((fish) => fish.tier === tier.id));
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
