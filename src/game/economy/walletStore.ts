// The one real economy store (economyStore.ts) + React hooks. Game code calls the small functions below.
//
// ECO-02(d): in SERVER mode (npm run dev with the TEST Player ID, and dev-test-id previews) the server owns
// coins, goods, cooler level and ice; this device keeps the cooler and a cache of the last server answer.
// Sandbox pages (?test=shop / ?test=free) keep everything on this device with their own key, as before.
// The live game has no shop at all until ECO-04 (ECONOMY_ON is false there, and the server refuses money ops).

import { useSyncExternalStore } from 'react';
import { attachFishBook, receiveFishBook, resetVerifiedBook } from '../fishing/freeFish';
import { resetFishingDeck } from '../fishing/deckClient';
import type { CatchStamp } from '../fishing/catchTicket';
import { EconomyStore, formatMoney } from './economyStore';
import type { EconomyStatus, Transport, TradeOutcome } from './economyStore';
import type { Vendor } from './shopCatalog';
import { REASON_LINES } from './wallet';
import type { CartLine, CoolerFish, Fail, Wallet } from './wallet';

import { ECONOMY_ON, ECONOMY_SANDBOX as SANDBOX } from './flags';

export { ECONOMY_ON, formatMoney };
export type { EconomyStatus, TradeOutcome };

function newOperationId(): string {
  // getRandomValues works everywhere (randomUUID needs https, which a phone on the dev server lacks)
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `op-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const store = new EconomyStore({
  sandbox: SANDBOX,
  allowDevReset: typeof import.meta.env !== 'undefined' && import.meta.env.DEV,
  storage: {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
  },
  clock: () => Date.now(),
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  newOperationId,
});

/** game/saves/cloud.ts plugs in the authenticated /api/items call. */
export function registerEconomyTransport(t: Transport | null) { store.setTransport(t); }
/** Every server answer for a Player ID passes through here (cloud.ts), so coins stay current for free. */
export function receiveServerView(address: string | null, view: Record<string, unknown>) {
  if (address && typeof import.meta.env !== 'undefined' && import.meta.env.DEV && store.resetDevState(address, view.devFishingResetId)) { resetVerifiedBook(address); resetFishingDeck(); }
  if (store.receiveView(address, view) && address) { resetVerifiedBook(address); resetFishingDeck(); }
  receiveFishBook(address, view);
}
/** Switch to a Player ID's cooler + server cache (null = guest). Called by game/saves/cloud.ts. */
export function attachWallet(address: string | null) { store.attach(address); attachFishBook(address); }

export function getWallet(): Wallet { return store.getWallet(); }
export function useWallet(): Wallet {
  return useSyncExternalStore((l) => store.subscribe(l), () => store.getWallet(), () => store.getWallet());
}
export function getEconomyStatus(): EconomyStatus { return store.getStatus(); }
export function useEconomyStatus(): EconomyStatus {
  return useSyncExternalStore((l) => store.subscribe(l), () => store.getStatus(), () => store.getStatus());
}
/** Game time (the server's clock in server mode). Use it for anything compared with catch times. */
export function gameNow(): number { return store.now(); }

/** Drop spoiled fish / expired goods and roll the day (call when a shop, the bag or the cooler opens). */
export function refreshWallet(): Wallet { return store.refresh(); }
/** Fetch the latest coins/goods from the server (1 read). Opening a counter calls this. */
export function syncEconomy(): Promise<void> { return store.sync(); }

/** The line a character says when something is refused. */
export function reasonLine(r: Fail): string {
  return REASON_LINES[r.reason];
}

/** Free fishing calls this for every catch. Off in the live game. */
export function catchToCooler(fishId: string, sizeCm: number | null, stamp?: CatchStamp) {
  if (!ECONOMY_ON) return null;
  return store.addCatch(fishId, sizeCm, stamp);
}
export const sellableFishNow = () => store.sellableFish();
export const saleProblemNow = (c: CoolerFish) => store.saleProblem(c);
export const quoteSellNow = (uids: string[]) => store.quoteSell(uids);
export const quoteBuyNow = (cart: CartLine[], vendor: Vendor) => store.quoteBuy(cart, vendor);
export const sellToGen = (uids: string[]): Promise<TradeOutcome> => store.sell(uids);
export const buyFrom = (cart: CartLine[], vendor: Vendor, expectedTotal: number): Promise<TradeOutcome> => store.buy(cart, vendor, expectedTotal);
export const useBagItem = (uid: string): Promise<TradeOutcome> => store.useItem(uid);
export const retryTrade = (): Promise<TradeOutcome> => store.retry();
export const takeBagItem = (uid: string) => store.take(uid);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void store.sync(); });
}

// ---- dev console (npm run dev only; not in the production bundle) ----------------------------
// In the browser console:  __shop.wallet()  __shop.status()  __shop.sellAll()  __shop.coins(500) (sandbox only)
if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__shop = {
    wallet: () => store.refresh(),
    status: () => store.getStatus(),
    sellAll: () => store.sell(store.getWallet().cooler.map((c) => c.uid)),
    quote: () => store.quoteSell(store.getWallet().cooler.map((c) => c.uid)),
    buy: (id: string, qty = 1, vendor?: Vendor) => {
      const v = vendor ?? (id.startsWith('sashimi') || id === 'chef_special' ? 'minato' : 'gen');
      return store.buy([{ id, qty }], v, store.quoteBuy([{ id, qty }], v).total);
    },
    sync: () => store.sync(),
    coins: (n: number) => (SANDBOX ? store.devCoins(n) : console.warn('Server coins can only be earned: sell fish to Gen.')),
    reset: () => store.devReset(),
  };
}
