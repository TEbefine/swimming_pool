import { ECONOMY_ON, ECONOMY_SANDBOX } from '../economy/flags';
import { FishingDeckStore } from './deckStore';
import type { DeckTransport } from './deckStore';
import { FISHING_DECK } from './deckConfig';

const store = new FishingDeckStore({
  enabled: ECONOMY_ON && !ECONOMY_SANDBOX,
  clock: () => Date.now(), online: () => navigator.onLine !== false,
  randomIndex: () => crypto.getRandomValues(new Uint32Array(1))[0] % FISHING_DECK.casts, // 8192 divides 2^32: unbiased
  storage: { get: (key) => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value) },
});
let timer: ReturnType<typeof setTimeout> | undefined;
export function registerDeckTransport(transport: DeckTransport) { store.setTransport(transport); }
export function attachFishingDeck(address: string | null) {
  clearTimeout(timer); store.attach(address);
  if (ECONOMY_ON && !ECONOMY_SANDBOX && address) void refreshFishingDeck();
}
export async function refreshFishingDeck() {
  clearTimeout(timer);
  if (!ECONOMY_ON || ECONOMY_SANDBOX || !store.getAddress() || document.hidden) return;
  await store.sync();
  if (!store.getAddress() || document.hidden) return;
  const deck = store.getDeck();
  clearTimeout(timer);
  // One wake at rollover; failures retry slowly while visible. Never one request per cast.
  timer = setTimeout(() => { void refreshFishingDeck(); }, deck ? Math.max(1000, deck.window.endAt - store.now() + 1) : 60_000);
}
export const getFishingDeck = () => store.getDeck();
export const reserveFishingCast = () => store.reserveCast();
if (ECONOMY_ON && !ECONOMY_SANDBOX && typeof window !== 'undefined') {
  window.addEventListener('online', () => { void refreshFishingDeck(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer); else void refreshFishingDeck();
  });
}
