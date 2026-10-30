// ECO-03 stage 3: injected device cache/allocation, no React, network globals or gameplay effects.
import { FISHING_DECK } from './deckConfig.js';

export interface FishingDeck {
  address: string; version: number; deckId: number; seed: string;
  window: { startAt: number; endAt: number }; casts: number; serverNow: number;
}
interface Cache { deck: FishingDeck; savedAt: number; startIndex: number; draws: number }
interface Deps {
  enabled: boolean; clock(): number; online(): boolean; randomIndex(): number;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
}
export type DeckTransport = () => Promise<unknown>;
const owner = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-f]{40}$/.test(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

export function parseFishingDeck(raw: unknown, address: string): FishingDeck | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as FishingDeck;
  if (!owner(d.address) || d.address !== address || d.version !== FISHING_DECK.version || d.casts !== FISHING_DECK.casts
    || !integer(d.deckId) || !integer(d.serverNow) || typeof d.seed !== 'string' || !/^[0-9a-f]{64}$/.test(d.seed)
    || !d.window || !integer(d.window.startAt) || !integer(d.window.endAt)
    || d.window.startAt !== d.deckId * FISHING_DECK.windowMs || d.window.endAt !== (d.deckId + 1) * FISHING_DECK.windowMs
    || Math.floor(d.serverNow / FISHING_DECK.windowMs) !== d.deckId) return null;
  return { address, version: d.version, deckId: d.deckId, seed: d.seed, window: { ...d.window }, casts: d.casts, serverNow: d.serverNow };
}

export class FishingDeckStore {
  private address: string | null = null;
  private generation = 0;
  private cache: Cache | null = null;
  private transport: DeckTransport | null = null;
  private inFlight: { generation: number; promise: Promise<void> } | null = null;
  private deps: Deps;
  constructor(deps: Deps) { this.deps = deps; }
  setTransport(transport: DeckTransport) { this.transport = transport; }
  getAddress() { return this.address; }
  private key() { return `sp_fishing_deck_v1_${this.address}`; }
  private read(strict = false): Cache | null {
    try {
      const raw = this.deps.storage.get(this.key());
      if (!raw || raw.length > 4096 || !this.address) return null;
      const c = JSON.parse(raw) as Cache;
      const deck = parseFishingDeck(c?.deck, this.address);
      return deck && integer(c.savedAt) && integer(c.startIndex) && c.startIndex < deck.casts && integer(c.draws) && c.draws <= deck.casts
        ? { deck, savedAt: c.savedAt, startIndex: c.startIndex, draws: c.draws } : null;
    } catch (error) { if (strict) throw error; return null; }
  }
  private persist(): boolean {
    try { this.deps.storage.set(this.key(), JSON.stringify(this.cache)); return true; } catch { return false; }
  }
  attach(address: string | null) {
    const next = this.deps.enabled && owner(address) ? address : null;
    if (next === this.address) return;
    this.address = next; this.generation++; this.inFlight = null;
    this.cache = next ? this.read() : null;
  }
  reset() {
    this.generation++; this.cache = null; this.inFlight = null;
    try { this.deps.storage.set(this.key(), 'null'); } catch { /* memory only */ }
  }
  now() { return this.deps.clock() + (this.cache ? this.cache.deck.serverNow - this.cache.savedAt : 0); }
  getDeck(at = this.now()): FishingDeck | null {
    if (!this.deps.enabled || !this.address || !this.cache) return null;
    const deck = this.cache.deck;
    return Number.isSafeInteger(at) && at >= deck.window.startAt && at < deck.window.endAt ? structuredClone(deck) : null;
  }
  async sync(): Promise<void> {
    if (!this.deps.enabled || !this.address || !this.transport || !this.deps.online() || this.getDeck()) return;
    if (this.inFlight?.generation === this.generation) return this.inFlight.promise;
    const address = this.address, generation = this.generation, transport = this.transport;
    const request = { generation, promise: Promise.resolve() };
    request.promise = Promise.resolve().then(async () => {
      try {
        const deck = parseFishingDeck(await transport(), address);
        if (!deck || generation !== this.generation || address !== this.address) return;
        // Never reset a used deck's cursor when receiving that same window again.
        const previous = this.cache;
        if (previous && deck.deckId < previous.deck.deckId) return;
        if (previous && deck.deckId === previous.deck.deckId && deck.seed !== previous.deck.seed) return;
        const same = previous?.deck.deckId === deck.deckId;
        const startIndex = same ? previous.startIndex : this.deps.randomIndex();
        if (!integer(startIndex) || startIndex >= deck.casts) return;
        this.cache = { deck, savedAt: this.deps.clock(), startIndex, draws: same ? previous.draws : 0 };
        this.persist();
      } catch { /* Offline/unlock/closed/missing config: keep the device cache; never block fishing. */ }
      finally { if (this.inFlight === request) this.inFlight = null; }
    });
    this.inFlight = request;
    return request.promise;
  }
  /** Inject the exact gameNow() stamp used for castAt; the cache offset is only for background refresh.
   * Called synchronously. Persist before handing out a card; never throw mid-cast.
   * Failure/exhaustion = Book-only. No network, and wrapping stops after ONE full traversal. */
  reserveCast(castAt: number): { deck: FishingDeck; castIndex: number } | null {
    try {
      // Pick up sequential consumption by another tab when present. Separate devices can still collide.
      const stored = this.read(true);
      if (stored && this.cache && stored.deck.deckId === this.cache.deck.deckId && stored.deck.seed === this.cache.deck.seed
        && stored.startIndex === this.cache.startIndex && stored.draws > this.cache.draws) this.cache = stored;
      const deck = this.getDeck(castAt);
      if (!deck || !this.cache || this.cache.draws >= deck.casts) return null;
      const castIndex = (this.cache.startIndex + this.cache.draws) % deck.casts;
      const previous = this.cache;
      this.cache = { ...this.cache, draws: this.cache.draws + 1 };
      if (!this.persist()) { this.cache = previous; return null; }
      return { deck, castIndex };
    } catch { return null; }
  }
}
