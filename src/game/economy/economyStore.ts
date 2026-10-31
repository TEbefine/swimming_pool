import { rodOf } from './rodConfig.js';
import { rodLevelOf } from './rodConfig.js';
// ECO-02(d) — the phone's side of the money system, as a small store with injected dependencies (testable
// in plain Node). walletStore.ts makes the one real instance and the React hooks.
//
// Two modes:
// - SANDBOX (?test=shop|free): everything on this device, the pure wallet.ts rules, its own storage key.
// - SERVER (npm run dev with the TEST Player ID, and dev-test-id previews): the SERVER owns coins, goods,
//   cooler level, daily counters and ice events. This store keeps only
//     (1) the cooler: catches not sold yet, the phone's own business (they rot in 30 min anyway), and
//     (2) a cache of the last server answer, so screens draw instantly. Server wins, silently.
//   Every Sell / Pay / Use ice is ONE request with ONE operationId made before sending. If the answer is
//   lost, the exact request is kept (also across a reload) and the player taps Retry: the server replays the
//   original result instead of paying or charging twice. Nothing is queued or sent automatically.

import { parseSalePolicy, saleProblem } from '../fishing/saleEligibility.js';
import type { SalePolicy } from '../fishing/saleEligibility.js';
import { parseCatchTicket } from '../fishing/catchTicket.js';
import type { CatchStamp, CatchTicket } from '../fishing/catchTicket.js';
import { CURRENCY, ICE } from './economyConfig.js';
import type { Vendor } from './shopCatalog.js';
import { SHOP_BY_ID } from './shopCatalog.js';
import {
  REASON_LINES, addCatch, buy, fishIceMin, freshWallet, iceHelps, parseWallet, quoteBuy, quoteSell, sellFish, settle, takeGoods, useGoods,
} from './wallet.js';
import type { BuyLine, CartLine, CoolerFish, Fail, SellLine, Wallet } from './wallet.js';
import { buyReceipt, sellReceipt } from './receipt.js';
import type { Receipt } from './receipt.js';
import { coolerSlots } from './wallet.js';

export interface KeyValue { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
/** Sends one /api/items request. Throws an error with `status` (0 = no HTTP answer) and optional `data`. */
export type Transport = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
export interface StoreDeps {
  sandbox: boolean;
  allowDevReset?: boolean;
  storage: KeyValue;
  clock: () => number;
  online: () => boolean;
  newOperationId: () => string;
}

export type TradeOp = 'shop.sell' | 'shop.buy' | 'bag.use';
export interface PendingTrade {
  op: TradeOp;
  body: Record<string, unknown>;
  /** shop.sell: cooler uids in the same order as body.catches (result indices point here). */
  uids?: string[];
  /** Same-order ticket metadata; the persisted body is always retried unchanged. */
  tickets?: (CatchTicket | null)[];
  vendor?: Vendor;
  at: number;
}
export interface EconomyStatus {
  econEpoch: number | null;
  shopOpen: boolean | null;
  /** Server mode (false = sandbox page). */
  server: boolean;
  signedIn: boolean;
  /** A request is on its way: buttons are locked. */
  busy: boolean;
  /** A trade whose answer never arrived: Retry resends it exactly. */
  pending: PendingTrade | null;
}
export type TradeOutcome =
  | { ok: true; message: string; receipt: Receipt | null; earned: number; spent: number; sold: number; bought: number }
  | { ok: false; kind: 'busy' | 'pending' | 'signin' | 'offline' | 'uncertain' | 'closed' | 'refused'; message: string };

interface ServerGoods { uid: string; id: string; qty: number; at: number; expiresAt: number | null }
interface ServerEconomy {
  salePolicy: SalePolicy | null;
  revision: number;
  coins: number;
  econEpoch: number;
  shopOpen?: boolean;
  coolerLevel: number;
  rodLevel: number;
  goods: ServerGoods[];
  econ: { day: number; soldToday: Record<string, number>; earnedToday: number; boughtToday: Record<string, number> };
  iceUsedAt: number[];
}

export const TRADE_LINES = {
  offline: { gen: 'No signal, no sale. Come back when you are online.', minato: 'My till is offline. Come back when you have signal!' },
  uncertain: 'No answer came back. It may have gone through: tap Retry to check.',
  pendingFirst: 'Finish the last trade first: tap Retry.',
  signin: 'Coins live on your Player ID. Unlock it first.',
  closed: "The shop is closed today.",
} as const;

/** "120 coins" / "1 coin". */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? CURRENCY.one : CURRENCY.many}`;
}

// Compiled out of production; also keeps a reset acknowledgement when browser storage is blocked.
const devResets = typeof import.meta.env === 'undefined' || import.meta.env.DEV ? new WeakMap<object, { address: string; id: string }>() : null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (isNum(n) && n > 0) out[k] = Math.floor(n);
  return out;
}
/** Read the economy part of a server answer (or a cached copy). Anything malformed → null. */
export function parseServerEconomy(v: unknown): ServerEconomy | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!isNum(r.revision) || !isNum(r.coins) || !Array.isArray(r.goods) || !r.econ || typeof r.econ !== 'object') return null;
  const e = r.econ as Record<string, unknown>;
  return {
    salePolicy: parseSalePolicy((r.salePolicy ?? r) as Record<string, unknown>),
    shopOpen: typeof r.shopOpen === 'boolean' ? r.shopOpen : undefined,
    econEpoch: isNum(r.econEpoch) ? r.econEpoch : 0,
    revision: r.revision,
    coins: Math.max(0, Math.floor(r.coins)),
    rodLevel: rodLevelOf(r.rodLevel),
    coolerLevel: isNum(r.coolerLevel) ? Math.max(0, Math.floor(r.coolerLevel)) : 0,
    goods: r.goods.filter((g): g is ServerGoods => !!g && typeof g === 'object' && typeof (g as ServerGoods).uid === 'string'
      && typeof (g as ServerGoods).id === 'string' && isNum((g as ServerGoods).qty) && isNum((g as ServerGoods).at) && !!SHOP_BY_ID[(g as ServerGoods).id])
      .map(({ uid, id, qty, at, expiresAt }) => ({ uid, id, qty, at, expiresAt: isNum(expiresAt) ? expiresAt : null })),
    econ: { day: isNum(e.day) ? e.day : 0, soldToday: counts(e.soldToday), earnedToday: isNum(e.earnedToday) ? e.earnedToday : 0, boughtToday: counts(e.boughtToday) },
    iceUsedAt: Array.isArray(r.iceUsedAt) ? r.iceUsedAt.filter(isNum) : [],
  };
}

function parseCooler(v: unknown): CoolerFish[] {
  if (!Array.isArray(v)) return [];
  return v.filter((c): c is CoolerFish => !!c && typeof c === 'object' && typeof c.uid === 'string' && typeof c.fishId === 'string'
    && isNum(c.caughtAt) && (c.sizeCm === null || isNum(c.sizeCm)))
    .map(({ uid, fishId, sizeCm, caughtAt, ticket }) => {
      const parsed = parseCatchTicket(ticket, caughtAt);
      return { uid, fishId, sizeCm, caughtAt, ...(parsed ? { ticket: parsed } : {}) };
    });
}
function parsePending(v: unknown): PendingTrade | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as PendingTrade;
  if (!['shop.sell', 'shop.buy', 'bag.use'].includes(p.op) || !p.body || typeof p.body !== 'object' || typeof p.body.operationId !== 'string') return null;
  return { op: p.op, body: p.body, tickets: p.tickets, uids: Array.isArray(p.uids) ? p.uids.filter((u) => typeof u === 'string') : undefined, vendor: p.vendor, at: isNum(p.at) ? p.at : 0 };
}

interface ErrorLike { status?: number; message?: string; data?: Record<string, unknown> }

export class EconomyStore {
  private deps: StoreDeps;
  private scope: string | null = null;
  private epochConfirmed = false;
  private transport: Transport | null = null;
  // sandbox
  private local: Wallet;
  // server
  private cooler: CoolerFish[] = [];
  private snap: ServerEconomy | null = null;
  private pending: PendingTrade | null = null;
  private busy = false;
  private offsetMs = 0;
  // derived
  private wallet: Wallet;
  private status: EconomyStatus;
  private listeners = new Set<() => void>();

  constructor(deps: StoreDeps) {
    this.deps = deps;
    const off = Number(this.read('sp_clock_offset_v1'));
    this.offsetMs = Number.isFinite(off) && Math.abs(off) < 86_400_000 ? off : 0;
    this.local = deps.sandbox ? parseWallet(this.json('sp_wallet_test'), this.now()) : freshWallet(this.now());
    if (!deps.sandbox) this.loadScope();
    this.wallet = this.derive();
    this.status = this.makeStatus();
  }

  // ---- small helpers ----
  /** Game time: this device's clock moved to the server's (sandbox: the device clock). */
  now(): number { return this.deps.clock() + (this.deps.sandbox ? 0 : this.offsetMs); }
  private read(key: string): string | null { try { return this.deps.storage.get(key); } catch { return null; } }
  private json(key: string): unknown { try { const raw = this.read(key); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  private write(key: string, value: unknown) { try { if (value === null) this.deps.storage.remove(key); else this.deps.storage.set(key, JSON.stringify(value)); } catch { /* memory only */ } }
  private key(kind: 'cooler' | 'econ' | 'pending') { return `sp_${kind}_v2_${this.scope ?? 'guest'}`; }

  subscribe(l: () => void): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  getWallet(): Wallet { return this.wallet; }
  getStatus(): EconomyStatus { return this.status; }
  private makeStatus(): EconomyStatus {
    return { econEpoch: this.snap?.econEpoch ?? null, shopOpen: this.snap?.shopOpen ?? null, server: !this.deps.sandbox, signedIn: this.scope !== null, busy: this.busy, pending: this.pending };
  }
  private emit() {
    this.wallet = this.derive();
    this.status = this.makeStatus();
    this.listeners.forEach((l) => l());
  }

  /** The wallet screens draw: sandbox = the local wallet; server = cooler + the server cache. */
  private derive(): Wallet {
    const now = this.now();
    if (this.deps.sandbox) return settle(this.local, now).wallet;
    const s = this.snap;
    const base = freshWallet(now);
    const w: Wallet = {
      ...base,
      coins: s?.coins ?? 0,
      coolerLevel: s?.coolerLevel ?? 0, rodLevel: s?.rodLevel ?? 0,
      cooler: this.cooler,
      goods: (s?.goods ?? []).map(({ uid, id, qty, at, expiresAt }) => ({ uid, id, qty, at, expiresAt })), // the server's food clock
      day: s?.econ.day ?? base.day,
      soldToday: s?.econ.soldToday ?? {},
      earnedToday: s?.econ.earnedToday ?? 0,
      boughtToday: s?.econ.boughtToday ?? {},
      iceUsedAt: s?.iceUsedAt ?? [],
    };
    return settle(w, now).wallet;
  }

  // ---- accounts and server answers ----
  setTransport(t: Transport | null) { this.transport = t; }

  /** Switch to a Player ID (null = guest). Sandbox pages ignore this. */
  attach(address: string | null) {
    if (this.deps.sandbox || address === this.scope) return;
    this.scope = address; this.epochConfirmed = false;
    this.loadScope();
    this.emit();
  }
  private loadScope() {
    this.snap = parseServerEconomy(this.json(this.key('econ')));
    this.pending = parsePending(this.json(this.key('pending')));
    const stored = this.json(this.key('cooler'));
    if (stored !== null) this.cooler = parseCooler(stored);
    else {
      // One-time move from the old device wallet: keep ONLY the cooler. Its coins, goods, upgrades and ice
      // were never real and are not imported.
      const oldKey = `sp_wallet_v1_${this.scope ?? 'guest'}`;
      const old = this.json(oldKey);
      this.cooler = old ? parseWallet(old, this.now()).cooler : [];
      this.write(this.key('cooler'), this.cooler);
      if (old) this.write(oldKey, null);
    }
  }

  /** Explicit local-dev reset only. A new server reset token drops matching game caches, never identity. */
  resetDevState(address: string | null, id: unknown): boolean {
    if (typeof import.meta.env !== 'undefined' && !import.meta.env.DEV) return false;
    if (!this.deps.allowDevReset || !this.scope || address !== this.scope || typeof id !== 'string' || id.length > 80 || !id) return false;
    const key = `sp_dev_fishing_reset_${this.scope}`;
    const seen = devResets?.get(this);
    if ((seen?.address === this.scope && seen.id === id) || this.json(key) === id) return false;
    devResets?.set(this, { address: this.scope, id });
    this.snap = null; this.pending = null; this.cooler = [];
    this.write(this.key('econ'), null); this.write(this.key('pending'), null); this.write(this.key('cooler'), []); this.write(key, id);
    this.emit(); return true;
  }

  /** Every /api/items answer for `address` passes through here (load, Fish Book, story, trades). */
  receiveView(address: string | null, view: Record<string, unknown>) {
    if (this.deps.sandbox || address === null || address !== this.scope) return; // an answer for another Player ID
    if (isNum(view.serverNow)) {
      this.offsetMs = view.serverNow - this.deps.clock();
      this.write('sp_clock_offset_v1', this.offsetMs);
    }
    const next = parseServerEconomy(view);
    if (!next) return;
    if (this.epochConfirmed && this.snap && next.econEpoch < this.snap.econEpoch) return;
    const changedEpoch = next.econEpoch > (this.snap?.econEpoch ?? 0) || (!this.epochConfirmed && !!this.snap && next.econEpoch !== this.snap.econEpoch);
    const resetProjections = changedEpoch || (!this.epochConfirmed && !!this.snap && next.revision < this.snap.revision);
    if (changedEpoch) {
      this.cooler = []; this.write(this.key('cooler'), []);
      // Pending request bytes remain available only for explicit receipt reconciliation via Retry.
    }
    if (this.epochConfirmed && !changedEpoch && this.snap && next.revision < this.snap.revision) return; // a slow, older answer never overwrites a newer one
    this.epochConfirmed = true;
    this.snap = next;
    this.write(this.key('econ'), next);
    this.emit();
    return resetProjections;
  }

  /** Drop spoiled fish / expired goods and roll the day. Call when a shop, the bag or the cooler opens. */
  refresh(): Wallet {
    const now = this.now();
    if (this.deps.sandbox) {
      const { wallet, spoiled, expired } = settle(this.local, now);
      if (wallet !== this.local || spoiled.length || expired.length) this.setLocal(wallet);
      else this.emit();
      return this.wallet;
    }
    const fresh = this.derive().cooler; // settle() already dropped the spoiled fish
    // While an ice use is unresolved (in flight, or its answer was lost), a fish that looks spoiled HERE may have
    // been iced on the server just in time. Never forget it until the server's ice events have arrived.
    if (fresh.length !== this.cooler.length && !this.iceUnresolved()) this.setCooler(fresh);
    else this.emit();
    return this.wallet;
  }

  /** Ask the server for the latest economy (one read). Quietly does nothing offline or as a guest. */
  async sync(): Promise<void> {
    if (this.deps.sandbox || !this.scope || !this.transport || !this.deps.online()) return;
    const who = this.scope;
    try { this.receiveView(who, await this.transport({ op: 'load' })); } catch { /* the cache stays */ }
  }

  private setLocal(w: Wallet) {
    this.local = w;
    this.write('sp_wallet_test', w);
    this.emit();
  }
  private setCooler(c: CoolerFish[]) {
    this.cooler = c;
    this.write(this.key('cooler'), c);
    this.emit();
  }

  // ---- fishing ----
  /** Free fishing calls this for every catch. Returns the pure result (ok + wallet, or a reason). */
  addCatch(fishId: string, sizeCm: number | null, stamp?: CatchStamp) {
    const r = addCatch(this.wallet, fishId, sizeCm, { now: this.now() }, stamp);
    if (r.ok) {
      if (this.deps.sandbox) this.setLocal(r.wallet);
      // Ice unresolved: keep every stored fish (see refresh) and just add the new one.
      else this.setCooler(this.iceUnresolved() ? [...this.cooler, r.fish] : r.wallet.cooler);
    }
    return r;
  }

  // ---- quotes (draw only; the server prices for real) ----
  saleProblem(c: CoolerFish): string | null { return this.deps.sandbox ? null : saleProblem(c, this.snap?.salePolicy ?? null, this.now()); }
  sellableFish(): CoolerFish[] {
    const seen = new Set<string>();
    return this.wallet.cooler.filter(c => {
      if (this.saleProblem(c)) return false;
      const key = c.ticket ? `${c.ticket.version}:${c.ticket.deckId}:${c.ticket.castIndex}` : c.uid;
      if (seen.has(key)) return false; seen.add(key); return true;
    });
  }
  quoteSell(uids: string[]) { return quoteSell({ ...this.wallet, cooler: this.sellableFish() }, uids, this.now()).quote; }
  quoteBuy(cart: CartLine[], vendor: Vendor) { return quoteBuy(this.wallet, cart, vendor, this.now()).quote; }

  // ---- trades ----
  async sell(uids: string[]): Promise<TradeOutcome> {
    if (this.deps.sandbox) {
      const r = sellFish(this.local, uids, { now: this.now() });
      if (!r.ok) { this.setLocal(r.wallet); return refused(REASON_LINES[r.reason]); }
      this.setLocal(r.wallet);
      return sellDone(r.sold, r.kept, r.earned, r.wallet.coins, this.now());
    }
    const block = this.blocked('gen');
    if (block) return block;
    const waiting = new Set(this.pending?.uids ?? []);
    const fish = this.sellableFish().filter((c) => uids.includes(c.uid) && !waiting.has(c.uid));
    if (!fish.length) {
      const selected = this.wallet.cooler.find(c => uids.includes(c.uid));
      return refused(selected ? this.saleProblem(selected) ?? REASON_LINES.nothing_selected : REASON_LINES.nothing_selected);
    }
    const catches = fish.map((c) => ({ fish: c.fishId, sizeCm: c.sizeCm, caughtAt: c.caughtAt, ...(c.ticket ? { ticket: c.ticket } : {}) }));
    return this.send({ op: 'shop.sell', body: { econEpoch: this.snap?.econEpoch ?? 0, op: 'shop.sell', operationId: this.deps.newOperationId(), catches }, uids: fish.map((c) => c.uid), tickets: fish.map((c) => c.ticket ?? null), vendor: 'gen', at: this.now() });
  }

  /** `expectedTotal` = the total the Pay bar showed. The server never charges more than that. */
  async buy(cart: CartLine[], vendor: Vendor, expectedTotal: number): Promise<TradeOutcome> {
    if (this.deps.sandbox) {
      const r = buy(this.local, cart, vendor, { now: this.now() });
      if (!r.ok) { this.setLocal(r.wallet); return failLine(r); }
      this.setLocal(r.wallet);
      return buyDone(vendor, r.lines, r.spent, r.wallet, this.now());
    }
    const block = this.blocked(vendor);
    if (block) return block;
    const q = this.quoteBuy(cart, vendor);
    if (q.problem) return failLine({ ok: false, wallet: this.wallet, reason: q.problem, item: q.problemItem });
    const clean = cart.filter((l) => l.qty > 0).map(({ id, qty }) => ({ id, qty }));
    return this.send({ op: 'shop.buy', body: { econEpoch: this.snap?.econEpoch ?? 0, op: 'shop.buy', operationId: this.deps.newOperationId(), vendor, cart: clean, expectedTotal }, vendor, at: this.now() });
  }

  async useItem(uid: string): Promise<TradeOutcome> {
    if (this.deps.sandbox) {
      const r = useGoods(this.local, uid, { now: this.now() });
      if (!r.ok) { this.setLocal(r.wallet); return failLine(r); }
      this.setLocal(r.wallet);
      return done(ICE_LINE, null, { });
    }
    const g = this.wallet.goods.find((x) => x.uid === uid);
    if (!g) return refused(REASON_LINES.not_owned);
    if (SHOP_BY_ID[g.id]?.use !== 'ice') return refused('Eating and gifts come later.');
    if (!iceHelps(this.wallet, this.now())) return refused(REASON_LINES.nothing_to_cool); // don't waste the player's ice
    if (this.wallet.iceUsedAt.length >= ICE.maxEvents) return refused('Enough ice for now. Try again a little later.');
    const block = this.blocked('gen');
    if (block) return block;
    return this.send({ op: 'bag.use', body: { econEpoch: this.snap?.econEpoch ?? 0, op: 'bag.use', operationId: this.deps.newOperationId(), uid }, at: this.now() });
  }

  /** Resend the trade whose answer never came, byte for byte (same operationId). */
  async retry(): Promise<TradeOutcome> {
    if (!this.pending) return refused('Nothing to retry.');
    if (this.busy) return { ok: false, kind: 'busy', message: '' };
    if (!this.deps.online()) return { ok: false, kind: 'offline', message: TRADE_LINES.offline[this.pending.vendor ?? 'gen'] };
    return this.send(this.pending, true);
  }

  /** Taking a bag item out for a gift (later). Sandbox only until the gift system has its server op. */
  take(uid: string) {
    if (!this.deps.sandbox) return { ok: false as const, wallet: this.wallet, reason: 'cant_use' as const };
    const r = takeGoods(this.local, uid, this.now());
    if (r.ok) this.setLocal(r.wallet);
    return r;
  }

  /** Dev console only: add sandbox coins (server coins can only be earned). */
  devCoins(n: number) { if (this.deps.sandbox) this.setLocal({ ...this.local, coins: Math.max(0, this.local.coins + n) }); }
  devReset() { if (this.deps.sandbox) this.setLocal(freshWallet(this.now())); else this.setCooler([]); }

  /** A Block of ice was sent and the server's answer is not in yet (or was lost). */
  private iceUnresolved(): boolean { return this.pending?.op === 'bag.use'; }

  private blocked(vendor: Vendor): TradeOutcome | null {
    if (this.busy) return { ok: false, kind: 'busy', message: '' };
    if (this.pending) return { ok: false, kind: 'pending', message: TRADE_LINES.pendingFirst };
    if (!this.scope || !this.transport) return { ok: false, kind: 'signin', message: TRADE_LINES.signin };
    if (!this.deps.online()) return { ok: false, kind: 'offline', message: TRADE_LINES.offline[vendor] }; // sends nothing, changes nothing
    return null;
  }

  private async send(p: PendingTrade, isRetry = false): Promise<TradeOutcome> {
    const who = this.scope;
    const transport = this.transport;
    if (!transport) return { ok: false, kind: 'signin', message: TRADE_LINES.signin };
    // Keep the exact request BEFORE sending: a crash or a lost answer can always be retried, never doubled.
    if (!isRetry) { this.pending = p; this.write(this.key('pending'), p); }
    this.busy = true;
    this.emit();
    try {
      const view = await transport(p.body);
      if (who !== this.scope) return { ok: false, kind: 'refused', message: '' }; // switched Player ID meanwhile
      this.receiveView(who, view);
      this.clearPending();
      return this.finish(p, (view.result ?? {}) as Record<string, unknown>);
    } catch (raw) {
      if (who !== this.scope) return { ok: false, kind: 'refused', message: '' };
      const err = raw as ErrorLike;
      let refusalMessage = err.message;
      const status = typeof err.status === 'number' ? err.status : 0;
      // Does this answer SETTLE the trade (prove it never happened)?
      // - 400/409/422 come from validation/pricing, which the server runs AFTER looking up the operationId: had the
      //   first attempt committed, it would have replayed that result instead. Settled, also on a Retry.
      // - 401/403/429 are checked BEFORE the lookup. On the first attempt they prove nothing was written (this was
      //   the only attempt); on a Retry they say nothing about the first attempt, so the trade stays pending.
      // - No answer, 5xx, or an unreadable 200: it MAY have committed. Keep it for Retry.
      const settles = status === 400 || status === 409 || status === 422 || (!isRetry && (status === 401 || status === 403 || status === 429));
      if (!settles) {
        if (status === 401) return { ok: false, kind: 'signin', message: `${TRADE_LINES.signin} Then tap Retry: your last trade is kept.` };
        if (status === 403 && err.data?.shopClosed) return { ok: false, kind: 'closed', message: `${TRADE_LINES.closed} Your last trade is kept for Retry.` };
        if (status === 429) return { ok: false, kind: 'uncertain', message: 'Busy right now. Wait a minute, then tap Retry.' };
        return { ok: false, kind: 'uncertain', message: TRADE_LINES.uncertain };
      }
      // A real answer that says no: nothing was written. Forget the request.
      this.clearPending();
      if (err.data && isNum(err.data.serverNow)) this.receiveView(who, { serverNow: err.data.serverNow });
      if (status === 403 && err.data?.shopClosed) return { ok: false, kind: 'closed', message: TRADE_LINES.closed };
      if (status === 401) return { ok: false, kind: 'signin', message: TRADE_LINES.signin };
      if (p.op === 'shop.sell' && Array.isArray(err.data?.rejectedCatches)) {
        const gone = new Set<string>();
        for (const line of err.data.rejectedCatches as { index?: unknown; reason?: unknown; message?: unknown }[]) {
          if (Number.isSafeInteger(line.index) && (line.index as number) >= 0 && ['invalid', 'already_paid'].includes(String(line.reason))) {
            const uid = p.uids?.[line.index as number];
            if (uid) { gone.add(uid); if (typeof line.message === 'string') refusalMessage = line.message; }
          }
        }
        if (gone.size) this.setCooler(this.cooler.filter(c => !gone.has(c.uid)));
      }
      if (p.op === 'shop.sell' && err.data?.result) this.reconcileSale(p, err.data.result as Record<string, unknown>); // all kept: drop the spoiled ones
      void this.sync();
      return refused(refusalMessage || 'Not today, sorry.');
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  private clearPending() {
    this.pending = null;
    this.write(this.key('pending'), null);
  }

  /** Remove the fish the server sold or found spoiled; capped (and unselected) fish stay in the cooler. */
  private reconcileSale(p: PendingTrade, result: Record<string, unknown>) {
    const uids = p.uids ?? [];
    const gone = new Set<string>();
    for (const l of (Array.isArray(result.sold) ? result.sold : []) as { index?: number }[]) if (isNum(l.index) && uids[l.index]) gone.add(uids[l.index]);
    for (const l of (Array.isArray(result.keptLines) ? result.keptLines : []) as { index?: number; reason?: string }[]) {
      if (l.reason === 'spoiled' && isNum(l.index) && uids[l.index]) gone.add(uids[l.index]);
    }
    if (gone.size) this.setCooler(this.cooler.filter((c) => !gone.has(c.uid)));
  }

  private finish(p: PendingTrade, result: Record<string, unknown>): TradeOutcome {
    if (p.op === 'shop.sell') {
      this.reconcileSale(p, result);
      const sold = (Array.isArray(result.sold) ? result.sold : []) as SellLine[];
      const keptLines = (Array.isArray(result.keptLines) ? result.keptLines : []) as { reason: string }[];
      const earned = isNum(result.earned) ? result.earned : 0;
      const balance = isNum(result.balanceAfter) ? result.balanceAfter : this.wallet.coins;
      const at = isNum(result.pricedAt) ? result.pricedAt : this.now();
      return sellDone(sold, keptLines, earned, balance, at);
    }
    if (p.op === 'shop.buy') {
      const lines = (Array.isArray(result.bought) ? result.bought : []) as BuyLine[];
      const spent = isNum(result.spent) ? result.spent : 0;
      const balance = isNum(result.balanceAfter) ? result.balanceAfter : this.wallet.coins;
      const at = isNum(result.pricedAt) ? result.pricedAt : this.now();
      return buyDone(p.vendor ?? 'gen', lines, spent, { ...this.wallet, coins: balance }, at);
    }
    return done(ICE_LINE, null, {});
  }
}

const ICE_LINE = 'Fresh ice on every fish: +15 minutes.';

function refused(message: string): TradeOutcome { return { ok: false, kind: 'refused', message }; }
function failLine(r: Fail): TradeOutcome {
  const who = r.item && SHOP_BY_ID[r.item] ? `${SHOP_BY_ID[r.item].name}: ` : '';
  return refused(who + REASON_LINES[r.reason]);
}
function done(message: string, receipt: Receipt | null, n: { earned?: number; spent?: number; sold?: number; bought?: number }): TradeOutcome {
  return { ok: true, message, receipt, earned: n.earned ?? 0, spent: n.spent ?? 0, sold: n.sold ?? 0, bought: n.bought ?? 0 };
}
function sellDone(sold: SellLine[], kept: number | readonly { reason: string }[], earned: number, balance: number, at: number): TradeOutcome {
  const keptN = typeof kept === 'number' ? kept : kept.length;
  const msg = keptN ? `+${formatMoney(earned)}. ${keptN} fish not sold (see the slip).` : `+${formatMoney(earned)}. Sold ${sold.length} fish to Gen.`;
  return done(msg, sellReceipt(sold, kept, balance, at), { earned, sold: sold.length });
}
function buyDone(vendor: Vendor, lines: BuyLine[], spent: number, after: Wallet, at: number): TradeOutcome {
  const n = lines.reduce((s, l) => s + l.qty, 0);
  const upgrade = lines.some((l) => SHOP_BY_ID[l.id]?.use === 'cooler_upgrade');
  const rodUpgrade = lines.some(l => SHOP_BY_ID[l.id]?.use === 'rod_upgrade');
  const msg = rodUpgrade ? `${rodOf(after.rodLevel).name}! Ready for your next cast.` : upgrade ? `Bigger cooler! It now holds ${coolerSlots(after)} fish.` : `−${formatMoney(spent)}. ${n} ${n === 1 ? 'thing' : 'things'} in your bag.`;
  return done(msg, buyReceipt(vendor, lines, after.coins, at), { spent, bought: n });
}

export { fishIceMin };
