// Imported only by Vite's serve-only plugins. Never a fallback for the production handlers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FISHING_DECK } from '../../src/game/fishing/deckConfig.js';
export const DEV_DECK_SECRET = 'dev-only-fishing-deck-no-production-use-2026';

/** Pin the current window for fresh local testing once; restarts must not move an activation cutoff. */
export function devFishingPolicy(root: string, now = Date.now()) {
  const file = resolve(root, '.dev/fishing-policy.json');
  let cutoff: number;
  let resetId: string | undefined;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (saved.version !== FISHING_DECK.version || typeof saved.resetId !== 'string' || !saved.resetId) {
      throw new Error('Dev fishing version changed. Stop dev, run npm run dev:reset-fishing, restart dev and reload every game tab.');
    }
    if (!Number.isSafeInteger(saved.redeemFromDeckId) || saved.redeemFromDeckId < 0) throw new Error('Invalid dev fishing policy; restore it or reset dev saves coherently.');
    cutoff = saved.redeemFromDeckId;
    resetId = typeof saved.resetId === 'string' ? saved.resetId : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (existsSync(resolve(root, '.dev/saves.json'))) {
      throw new Error('Dev saves exist without a fishing policy. Run npm run dev:reset-fishing to reset them together.');
    }
    resetId = randomUUID();
    cutoff = Math.floor(now / FISHING_DECK.windowMs);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: FISHING_DECK.version, redeemFromDeckId: cutoff, resetId }), { flag: 'wx' });
  }
  return { DEV_FISHING_RESET_ID: resetId, FISHING_DECK_SECRET: DEV_DECK_SECRET, FISHING_DECK_REDEEM_FROM_DECK_ID: String(cutoff) };
}
