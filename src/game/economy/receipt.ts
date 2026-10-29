// The receipt slip (ECO-01, client only). Pure: no React, no storage, so TOWN-01 and the server can reuse
// `vatIncluded` and the slip shape. A receipt never changes money; it explains what just happened.
//
// VAT is INSIDE the price: a 150-coin plate already contains 10 coins of VAT. One rule, once per receipt:
//   vat = round(total × rate / (1 + rate))      → always 0 ≤ vat < total, and net + vat = total.

import { VAT } from './economyConfig.js';
import { SHOP_BY_ID } from './shopCatalog.js';
import type { Vendor } from './shopCatalog.js';
import { FREE_BY_ID } from '../fishing/freeFishCatalog.js';
import type { BuyLine, SellLine } from './wallet.js';

/** Coins of VAT already inside `total` (0 for nothing / bad input). Never more than the total. */
export function vatIncluded(total: number, rate: number = VAT.rate): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  const t = Math.floor(total);
  return Math.min(t - 1, Math.max(0, Math.round((t * rate) / (1 + rate))));
}

/** "VAT 7%" from the rate, so the label can never disagree with the maths. */
export const vatLabel = (rate: number = VAT.rate) => `VAT ${Math.round(rate * 1000) / 10}%`;

export interface ReceiptLine {
  name: string;
  /** "×2", "18 cm" — the small grey part after the name. */
  detail: string;
  amount: number;
}

export interface Receipt {
  kind: 'buy' | 'sell';
  vendor: Vendor;
  at: number;
  lines: ReceiptLine[];
  total: number;
  /** Buying: VAT inside the total. Selling: null (not taxed). */
  vat: number | null;
  /** Coins after this receipt. */
  balance: number;
  /** One extra line, e.g. fish Gen could not take today. */
  note?: string;
}

export function buyReceipt(vendor: Vendor, lines: BuyLine[], balance: number, at: number): Receipt {
  const rows = lines.map((l) => ({
    name: SHOP_BY_ID[l.id]?.name ?? l.id,
    detail: `×${l.qty}${l.special ? ' special' : ''}`,
    amount: l.total,
  }));
  const total = lines.reduce((s, l) => s + l.total, 0);
  return { kind: 'buy', vendor, at, lines: rows, total, vat: vatIncluded(total), balance };
}

/** Why fish were not sold: a count (all kept by the daily cap) or the server's keptLines. */
export type KeptInfo = number | readonly { reason: 'spoiled' | 'daily_cap' | string }[];

export function keptNote(kept: KeptInfo): string | undefined {
  const lines = typeof kept === 'number' ? Array.from({ length: kept }, () => ({ reason: 'daily_cap' })) : kept;
  const bad = lines.filter((l) => l.reason === 'spoiled').length;
  const capped = lines.length - bad;
  const parts: string[] = [];
  if (bad) parts.push(`${bad} fish went bad on the way.`);
  if (capped) parts.push(`${capped} fish stay in your cooler: Gen's ice boxes are full for today.`);
  return parts.length ? parts.join(' ') : undefined;
}

export function sellReceipt(sold: SellLine[], kept: KeptInfo, balance: number, at: number): Receipt {
  const rows = sold.map((l) => ({
    name: FREE_BY_ID[l.fishId]?.name ?? l.fishId,
    detail: `${l.fresh.label.toLowerCase()}${l.wanted > 1 ? ', wanted' : ''}`,
    amount: l.price,
  }));
  const total = sold.reduce((s, l) => s + l.price, 0);
  const note = keptNote(kept);
  return { kind: 'sell', vendor: 'gen', at, lines: rows, total, vat: null, balance, note };
}

/** "28 Oct · 17:42" in Bangkok time (the game's clock), whatever the phone's time zone is. */
export function receiptTime(at: number): string {
  const d = new Date(at + 7 * 3_600_000);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${mon} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
