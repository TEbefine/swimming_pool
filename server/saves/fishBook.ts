// Step 1: pure data helpers only. A later step calls recordVerifiedPaidFish ONLY after sale verification.
// Fresh Book only: per kind { best, sold }. Presence means found. No data migration/versioning.
import { FISH_BOOK, FISH_BOOK_BY_ID, FISH_BOOK_KINDS } from '../../src/game/fishing/fishBookConfig.js';
import { COOLER } from '../../src/game/economy/economyConfig.js';

export interface VerifiedFishEntry { best: number; sold: number }
export type VerifiedFishBook = Record<string, VerifiedFishEntry>;
export type VerifiedBookRead = { ok: true; state: VerifiedFishBook } | { ok: false; reason: 'invalid_state' };
export class FishBookError extends Error {
  code: 'invalid_state' | 'invalid_sale' | 'count_overflow';
  constructor(code: FishBookError['code']) { super(`Verified Fish Book: ${code}.`); this.code = code; }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keysAre = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const sizeFits = (id: string, size: unknown): size is number => {
  const fish = Object.hasOwn(FISH_BOOK_BY_ID, id) ? FISH_BOOK_BY_ID[id] : undefined;
  return !!fish && Number.isInteger(size) && (size as number) >= fish.size[0] && (size as number) <= fish.size[1];
};

/** Read a Book map. Missing is fresh; malformed data has no valid display and cannot be awarded over. */
export function readVerifiedFishBook(raw: unknown): VerifiedBookRead {
  try {
    if (raw === undefined) return { ok: true, state: {} };
    if (!object(raw)) return { ok: false, reason: 'invalid_state' };
    const ids = Object.keys(raw);
    if (ids.length > FISH_BOOK_KINDS.length) return { ok: false, reason: 'invalid_state' };
    const fishBook: VerifiedFishBook = {};
    for (const id of ids) {
      const entry = raw[id];
      if (!object(entry) || !keysAre(entry, ['best', 'sold']) || !sizeFits(id, entry.best)
        || !Number.isSafeInteger(entry.sold) || (entry.sold as number) < 1) return { ok: false, reason: 'invalid_state' };
      fishBook[id] = { best: entry.best, sold: entry.sold as number };
    }
    return { ok: true, state: fishBook };
  } catch { return { ok: false, reason: 'invalid_state' }; }
}

/** Display only: fail safely and omit lifetime sold counts. */
export function verifiedFishBookView(raw: unknown) {
  const parsed = readVerifiedFishBook(raw);
  const fishBook: Record<string, { best: number; starred: boolean }> = {};
  if (parsed.ok) for (const [id, entry] of Object.entries(parsed.state)) {
    fishBook[id] = { best: entry.best, starred: entry.sold >= FISH_BOOK.starSales[FISH_BOOK_BY_ID[id].tier] };
  }
  return { fishBook, totalKinds: FISH_BOOK_KINDS.length };
}

/** Not a public authenticity check. Caller must pass only server-recomputed, PAID sale lines.
 * Replays/kept lines never call this. No client counts/best/Book snapshots are accepted. */
export function recordVerifiedPaidFish(raw: unknown, paid: readonly { fishId: string; sizeCm: number }[]): VerifiedFishBook {
  const parsed = readVerifiedFishBook(raw);
  if (!parsed.ok) throw new FishBookError('invalid_state');
  const maxBatch = COOLER.baseSlots + COOLER.upgradeSlots * COOLER.upgradePrices.length;
  if (!Array.isArray(paid) || !paid.length || paid.length > maxBatch) throw new FishBookError('invalid_sale');
  const next = parsed.state;
  for (const line of paid) {
    if (!line || typeof line.fishId !== 'string' || !sizeFits(line.fishId, line.sizeCm)) throw new FishBookError('invalid_sale');
    const old = next[line.fishId];
    if (old?.sold === Number.MAX_SAFE_INTEGER) throw new FishBookError('count_overflow');
    next[line.fishId] = { best: Math.max(old?.best ?? line.sizeCm, line.sizeCm), sold: (old?.sold ?? 0) + 1 };
  }
  return next;
}

