// ECO-02(d) Bag: when the money system is on, the Bag shows what you really CARRY.
// - FISH  = the fish in your cooler right now (sold or spoiled fish are gone). The Fish Book keeps the collection.
// - ITEMS = story items + things you bought at the shop (ice can be used from here).
// Row ids carry a prefix so the menu model can tell them apart from story items: "cooler:<uid>" / "goods:<uid>".
// The menu model (useGameMenu) and the screen (BagScreen) both build their rows from THESE functions, so the
// cursor and the drawing always agree.

import { ECONOMY_ON } from '../../game/economy/flags';
import { freshnessOf, iceMinutesFor } from '../../game/economy/market';
import { SHOP_BY_ID, shopIcon } from '../../game/economy/shopCatalog';
import type { Wallet } from '../../game/economy/wallet';
import { FREE_BY_ID, TIERS } from '../../game/fishing/freeFishCatalog';
import { freeIcon } from '../../game/fishing/freeFish';

export const COOLER_PREFIX = 'cooler:';
export const GOODS_PREFIX = 'goods:';

/** The Bag uses the cooler/goods view (not the Fish Book list) in free-fishing rooms when the economy is on. */
export function bagUsesEconomy(isStoryRoom: boolean): boolean {
  return ECONOMY_ON && !isStoryRoom;
}

export const coolerIds = (w: Wallet) => w.cooler.map((c) => COOLER_PREFIX + c.uid);
export const goodsIds = (w: Wallet) => w.goods.filter((g) => SHOP_BY_ID[g.id]).map((g) => GOODS_PREFIX + g.uid);

const mmss = (min: number) => {
  const s = Math.max(0, Math.floor(min * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export interface EconomyRow { id: string; name: string; count: number; right?: string; icon?: string; note: string; meta: string }

export function coolerRows(w: Wallet, now: number): EconomyRow[] {
  return w.cooler.map((c) => {
    const f = FREE_BY_ID[c.fishId];
    const fr = freshnessOf(c.caughtAt, iceMinutesFor(c.caughtAt, w.iceUsedAt), now);
    const bits = [f ? `${TIERS[f.tier].label} tier` : '', c.sizeCm !== null ? `${c.sizeCm} cm` : '', fr ? `${fr.label} · ${mmss(fr.leftMin)} left` : 'Spoiled'];
    return {
      id: COOLER_PREFIX + c.uid,
      name: f?.name ?? c.fishId,
      count: 1,
      right: fr ? mmss(fr.leftMin) : '–',
      icon: freeIcon(c.fishId),
      note: `${f?.note ?? ''} Sell it to Gen before it goes bad.`.trim(),
      meta: bits.filter(Boolean).join(' · '),
    };
  });
}

export function goodsRows(w: Wallet, now: number): EconomyRow[] {
  return w.goods.filter((g) => SHOP_BY_ID[g.id]).map((g) => {
    const it = SHOP_BY_ID[g.id];
    const leftMin = it.perishMin ? Math.max(0, it.perishMin - (now - g.at) / 60_000) : null;
    const bits = [leftMin !== null ? `${mmss(leftMin)} left` : 'Keeps', it.use === 'ice' ? '◯ Use: ice every fish in your cooler' : ''];
    return {
      id: GOODS_PREFIX + g.uid,
      name: it.name,
      count: g.qty,
      icon: shopIcon(g.id),
      note: it.note,
      meta: bits.filter(Boolean).join(' · '),
    };
  });
}
