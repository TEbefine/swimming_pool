// The wallet on THIS device: loads/saves the pure wallet (wallet.ts) in localStorage, per Player ID,
// and lets React read it (useWallet). Game code calls the small actions below; all rules live in wallet.ts.
//
// ⚠️ ECO-01 step 1–7 = device only. The money system is OFF in the live game until the save server
// holds the wallet (step 8): a phone-only wallet can be edited by anyone. It runs on `npm run dev`
// (TEST Player ID) and on the sandbox pages ?test=shop / ?test=free (their own wallet, never synced).

import { useSyncExternalStore } from 'react';
import { CURRENCY } from './economyConfig';
import type { Vendor } from './shopCatalog';
import {
  REASON_LINES, addCatch, buy, freshWallet, parseWallet, quoteBuy, quoteSell, sellFish, settle, takeGoods, useGoods,
} from './wallet';
import type { CartLine, Fail, Wallet } from './wallet';

import { ECONOMY_ON, ECONOMY_SANDBOX as SANDBOX } from './flags';

export { ECONOMY_ON };

const keyFor = (scope: string | null) => (SANDBOX ? 'sp_wallet_test' : `sp_wallet_v1_${scope ?? 'guest'}`);
let scope: string | null = null;
let wallet: Wallet = load();
const listeners = new Set<() => void>();

function load(): Wallet {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    return parseWallet(raw ? JSON.parse(raw) : null, Date.now());
  } catch {
    return freshWallet(Date.now()); // storage blocked (private window): play on in memory
  }
}
function commit(next: Wallet) {
  wallet = next;
  try { localStorage.setItem(keyFor(scope), JSON.stringify(wallet)); } catch { /* in memory only */ }
  listeners.forEach((l) => l());
}

/** Switch to a Player ID's wallet (null = guest). Called by game/saves/cloud.ts. */
export function attachWallet(address: string | null) {
  if (SANDBOX || address === scope) return;
  scope = address;
  wallet = load();
  listeners.forEach((l) => l());
}

export function getWallet(): Wallet {
  return wallet;
}
export function useWallet(): Wallet {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getWallet, getWallet);
}
/** Drop spoiled fish / expired goods and roll the day (call when a shop, the bag or the cooler opens). */
export function refreshWallet(): Wallet {
  const { wallet: next, spoiled, expired } = settle(wallet, Date.now());
  if (next !== wallet || spoiled.length || expired.length) commit(next);
  return wallet;
}

/** "120 coins" / "1 coin". */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? CURRENCY.one : CURRENCY.many}`;
}
/** The line a character says when something is refused. */
export function reasonLine(r: Fail): string {
  return REASON_LINES[r.reason];
}

// ---- actions (each one: pure rule → save → tell the UI) -------------------------------------
function run<R extends { wallet: Wallet }>(r: R): R {
  if (r.wallet !== wallet) commit(r.wallet);
  return r;
}

/** Free fishing calls this for every catch. Off in the live game. */
export function catchToCooler(fishId: string, sizeCm: number | null) {
  if (!ECONOMY_ON) return null;
  return run(addCatch(wallet, fishId, sizeCm, { now: Date.now() }));
}
export const quoteSellNow = (uids: string[]) => quoteSell(wallet, uids, Date.now()).quote;
export const sellToGen = (uids: string[]) => run(sellFish(wallet, uids, { now: Date.now() }));
export const quoteBuyNow = (cart: CartLine[], vendor: Vendor) => quoteBuy(wallet, cart, vendor, Date.now()).quote;
export const buyFrom = (cart: CartLine[], vendor: Vendor) => run(buy(wallet, cart, vendor, { now: Date.now() }));
export const useBagItem = (uid: string) => run(useGoods(wallet, uid, { now: Date.now() }));
export const takeBagItem = (uid: string) => run(takeGoods(wallet, uid, Date.now()));

// ---- dev console (npm run dev only; not in the production bundle) ----------------------------
// In the browser console:  __shop.wallet()  __shop.sellAll()  __shop.buy('sashimi_akami')  __shop.coins(500)
if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__shop = {
    wallet: () => refreshWallet(),
    sellAll: () => sellToGen(wallet.cooler.map((c) => c.uid)),
    quote: () => quoteSellNow(wallet.cooler.map((c) => c.uid)),
    buy: (id: string, qty = 1, vendor?: Vendor) => buyFrom([{ id, qty }], vendor ?? (id.startsWith('sashimi') || id === 'chef_special' ? 'minato' : 'gen')),
    coins: (n: number) => commit({ ...wallet, coins: wallet.coins + n }),
    reset: () => commit(freshWallet(Date.now())),
  };
}
