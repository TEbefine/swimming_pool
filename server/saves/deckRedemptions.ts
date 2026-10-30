// Pure, bounded paid-index helpers used inside the existing sale transaction.
import { FISHING_DECK } from '../../src/game/fishing/deckConfig.js';
import { COOLER } from '../../src/game/economy/economyConfig.js';

export interface PaidDeck { version: number; deckId: number; bits: string }
export interface PaidTicket { version: number; deckId: number; castIndex: number }
export interface RedemptionContext { now: number; redeemFromDeckId: number | null }
export type PaidDeckRead = { ok: true; windows: PaidDeck[] } | { ok: false; reason: 'invalid_state' };
export class DeckRedemptionError extends Error {
  code: 'invalid_state' | 'inactive' | 'invalid_ticket' | 'before_activation' | 'outside_window' | 'already_paid' | 'duplicate';
  index?: number;
  constructor(code: DeckRedemptionError['code'], index?: number) { super(`Fishing redemption: ${code}.`); this.code = code; this.index = index; }
}
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const BYTES = FISHING_DECK.casts / 8;
const ENCODED = Math.ceil(BYTES / 3) * 4;
if (!Number.isInteger(BYTES)) throw new Error('Fishing deck needs a whole number of bitmap bytes.');
const currentWindow = (now: number) => {
  if (!integer(now) || !Number.isFinite(new Date(now).getTime())) throw new DeckRedemptionError('invalid_state');
  return Math.floor(now / FISHING_DECK.windowMs);
};
const emptySlot = (deckId: number): PaidDeck => ({ version: FISHING_DECK.version, deckId, bits: Buffer.alloc(BYTES).toString('base64') });

/** Missing state starts empty. Unsafe active state cannot be interpreted as an unpaid deck. */
export function readPaidDecks(raw: unknown, now: number): PaidDeckRead {
  try {
    const current = currentWindow(now);
    if (raw === undefined) return { ok: true, windows: [] };
    if (!Array.isArray(raw) || raw.length > 2) return { ok: false, reason: 'invalid_state' };
    const windows: PaidDeck[] = [], seen = new Set<number>();
    for (const slot of raw) {
      if (!object(slot) || !integer(slot.deckId) || slot.deckId > current) return { ok: false, reason: 'invalid_state' };
      if (slot.deckId < current - 1) continue; // Retired only by server time, never incoming request order.
      if (seen.has(slot.deckId) || Object.keys(slot).length !== 3 || !['version', 'deckId', 'bits'].every(key => Object.hasOwn(slot, key)) || slot.version !== FISHING_DECK.version
        || typeof slot.bits !== 'string' || slot.bits.length !== ENCODED || !/^[A-Za-z0-9+/]*={0,2}$/.test(slot.bits)) return { ok: false, reason: 'invalid_state' };
      const bytes = Buffer.from(slot.bits, 'base64');
      if (bytes.length !== BYTES || bytes.toString('base64') !== slot.bits) return { ok: false, reason: 'invalid_state' };
      seen.add(slot.deckId); windows.push({ version: slot.version, deckId: slot.deckId, bits: slot.bits });
    }
    return { ok: true, windows: windows.sort((a, b) => a.deckId - b.deckId) };
  } catch { return { ok: false, reason: 'invalid_state' }; }
}

export function checkRedemptionWindow(ticket: PaidTicket, context: RedemptionContext): void {
  const current = currentWindow(context.now);
  if (context.redeemFromDeckId === null || context.redeemFromDeckId === undefined) throw new DeckRedemptionError('inactive');
  if (!integer(context.redeemFromDeckId)) throw new DeckRedemptionError('invalid_state');
  if (!object(ticket) || ticket.version !== FISHING_DECK.version || !integer(ticket.deckId)
    || !integer(ticket.castIndex) || ticket.castIndex >= FISHING_DECK.casts) throw new DeckRedemptionError('invalid_ticket');
  if (ticket.deckId < context.redeemFromDeckId) throw new DeckRedemptionError('before_activation');
  if (ticket.deckId > current || ticket.deckId < current - 1) throw new DeckRedemptionError('outside_window');
}

/** Call ONLY for paid lines, after full ticket/roll/freshness checks. Input state is never mutated.
 * Bit i uses byte floor(i/8), least-significant bit (i%8). No per-catch documents or cleanup writes. */
export function markPaidTickets(raw: unknown, tickets: readonly PaidTicket[], context: RedemptionContext): PaidDeck[] {
  const parsed = readPaidDecks(raw, context.now);
  if (!parsed.ok) throw new DeckRedemptionError('invalid_state');
  const maxBatch = COOLER.baseSlots + COOLER.upgradeSlots * COOLER.upgradePrices.length;
  if (!Array.isArray(tickets) || !tickets.length || tickets.length > maxBatch) throw new DeckRedemptionError('invalid_ticket');
  const current = currentWindow(context.now), seen = new Set<string>();
  const windows = (current > 0 ? [current - 1, current] : [current]).map((id) => parsed.windows.find((slot) => slot.deckId === id) ?? emptySlot(id));
  const bytes = new Map(windows.map((slot) => [slot.deckId, Buffer.from(slot.bits, 'base64')]));
  for (const [index, ticket] of tickets.entries()) {
    checkRedemptionWindow(ticket, context);
    const key = `${ticket.version}:${ticket.deckId}:${ticket.castIndex}`;
    if (seen.has(key)) throw new DeckRedemptionError('duplicate', index);
    seen.add(key);
    const bitmap = bytes.get(ticket.deckId)!;
    const byte = Math.floor(ticket.castIndex / 8), mask = 1 << (ticket.castIndex % 8);
    if (bitmap[byte] & mask) throw new DeckRedemptionError('already_paid', index);
    bitmap[byte] |= mask;
  }
  return windows.map((slot) => ({ ...slot, bits: bytes.get(slot.deckId)!.toString('base64') }));
}
