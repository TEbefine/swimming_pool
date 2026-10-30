// Client convenience only; the sale transaction is always authoritative.
import { SALE } from '../economy/economyConfig.js';
import { FISHING_DECK } from './deckConfig.js';
import { parseCatchTicket } from './catchTicket.js';
import { FISH_BOOK_BY_ID } from './fishBookConfig.js';
export interface SalePolicy { redeemFromDeckId: number; paidDecks: { version: number; deckId: number; bits: string }[] }
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function parseSalePolicy(raw: Record<string, unknown>): SalePolicy | null {
  if (!integer(raw.redeemFromDeckId) || !Array.isArray(raw.paidDecks) || raw.paidDecks.length > 2) return null;
  const seen = new Set<number>();
  const paidDecks: SalePolicy['paidDecks'] = [];
  try {
    for (const s of raw.paidDecks) {
      if (!s || s.version !== FISHING_DECK.version || !integer(s.deckId) || seen.has(s.deckId) || typeof s.bits !== 'string'
        || s.bits.length !== Math.ceil(FISHING_DECK.casts / 8 / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.bits) || atob(s.bits).length !== FISHING_DECK.casts / 8 || btoa(atob(s.bits)) !== s.bits) return null;
      seen.add(s.deckId); paidDecks.push({ version: s.version, deckId: s.deckId, bits: s.bits });
    }
  } catch { return null; }
  return { redeemFromDeckId: raw.redeemFromDeckId, paidDecks };
}
export function saleProblem(c: { fishId: string; sizeCm: number | null; caughtAt: number; ticket?: unknown }, policy: SalePolicy | null, now: number): string | null {
  const t = parseCatchTicket(c.ticket, c.caughtAt);
  const fish = Object.hasOwn(FISH_BOOK_BY_ID, c.fishId) ? FISH_BOOK_BY_ID[c.fishId] : null;
  if (c.caughtAt > now + SALE.clockSkewMs || !t || !fish || !Number.isInteger(c.sizeCm) || c.sizeCm! < fish.size[0] || c.sizeCm! > fish.size[1]) return "That catch can't be sold or added to your Fish Book.";
  if (!policy) return 'Please check in with Gen online before selling.';
  const current = Math.floor(now / FISHING_DECK.windowMs);
  if (policy.paidDecks.some(s => s.deckId > current)) return 'Please check in with Gen online before selling.';
  if (t.deckId < policy.redeemFromDeckId || t.deckId < current - 1 || t.deckId > current) return "This ticket can’t be used for a sale or Fish Book entry.";
  const slot = policy.paidDecks.find(s => s.deckId === t.deckId && s.version === t.version);
  if (slot && atob(slot.bits).charCodeAt(t.castIndex >> 3) & (1 << (t.castIndex % 8))) return "I've already paid for that catch.";
  return null;
}
