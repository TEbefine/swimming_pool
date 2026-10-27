import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyGate, menuInputFromKey } from '../gameMenu/menuInput';
import { sound } from '../../game/audio';
import { triggerHaptic } from '../../game/haptics';
import { FREE_BY_ID, freeIcon } from '../../game/fishing/freeFish';
import { COOLER, BAG } from '../../game/economy/economyConfig';
import { freshnessOf, itemPrice, marketOf } from '../../game/economy/market';
import { SHOP_BY_ID, shopIcon, stockOf } from '../../game/economy/shopCatalog';
import type { ShopItem, Vendor } from '../../game/economy/shopCatalog';
import type { CartLine, SellLine } from '../../game/economy/wallet';
import { coolerSlots, goodsFreshRatio } from '../../game/economy/wallet';
import {
  buyFrom, formatMoney, quoteBuyNow, quoteSellNow, reasonLine, refreshWallet, sellToGen, useBagItem, useWallet,
} from '../../game/economy/walletStore';
import type { ShopTab, ShopVisit } from '../../game/economy/shopTalk';
import './shop.css';

// The Harbour Fish Shop counter (ECO-01 steps 3–4). Drawn INSIDE the game screen, in the START-menu /
// Bag look (navy, cream, gold): fills the Game Boy screen on phones, a framed box on desktop.
//
//  Gen:    Sell fish (your cooler, each price shown in parts) · Supplies · My bag
//  Minato: Sashimi · Meals & drinks · My bag
//
// Input: touch everywhere, plus the controller (App forwards ◯ / ✕ / D-pad through `inputRef`) and the
// keyboard (arrows/WASD, Enter/E/O, X/Esc — handled here while open). ↑ to the top reaches the tabs;
// ←/→ there (or anywhere on Sell / My bag) changes tab; on a shop item ←/→ changes how many.
// All rules live in game/economy/wallet.ts — this screen only shows them and calls the store.

export type ShopInput = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

interface Props {
  vendor: Vendor;
  tab: ShopTab;
  compact: boolean;
  inputRef: React.MutableRefObject<((input: ShopInput) => void) | null>;
  onClose: (visit: ShopVisit) => void;
}

const TABS: Record<Vendor, { id: ShopTab; label: string }[]> = {
  gen: [{ id: 'sell', label: 'Sell fish' }, { id: 'supplies', label: 'Supplies' }, { id: 'bag', label: 'My bag' }],
  minato: [{ id: 'sashimi', label: 'Sashimi' }, { id: 'meals', label: 'Meals' }, { id: 'bag', label: 'My bag' }],
};
const TITLE: Record<Vendor, string> = { gen: "GEN'S COUNTER", minato: "MINATO'S KITCHEN" };

const sfx = {
  move: () => { sound.playCursor(); triggerHaptic(10); },
  select: () => { sound.playSelect(); triggerHaptic(15); },
  back: () => { sound.playBack(); triggerHaptic(15); },
  no: () => { sound.playBuzzer(); triggerHaptic(30); },
};

const mmss = (min: number) => {
  const s = Math.max(0, Math.floor(min * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const x2 = (n: number) => `×${n.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}`;
const fishName = (id: string) => FREE_BY_ID[id]?.name ?? id;

/** One-line "what is this item" + how long it keeps. */
function itemFacts(it: ShopItem): string {
  const keeps = it.perishMin ? `Keeps ${it.perishMin >= 60 ? `${it.perishMin / 60} h` : `${it.perishMin} min`}.` : 'Keeps.';
  return `${it.note} ${keeps}`;
}

const CoinIcon = () => <span className="sp-coin" aria-hidden="true" />;

export const ShopCounter: React.FC<Props> = ({ vendor, tab: firstTab, compact, inputRef, onClose }) => {
  const wallet = useWallet();
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<ShopTab>(firstTab);
  const [focus, setFocus] = useState(1);
  const [keys, setKeys] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'no' } | null>(null);
  const visit = useRef<ShopVisit>({ vendor, soldFish: 0, earned: 0, boughtItems: 0, spent: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const msgTimer = useRef<number | undefined>(undefined);

  // Fish age while you look at them: tick once a second, and drop what spoiled.
  useEffect(() => {
    refreshWallet();
    const t = window.setInterval(() => { setNow(Date.now()); refreshWallet(); }, 1000);
    return () => { window.clearInterval(t); window.clearTimeout(msgTimer.current); };
  }, []);

  const say = (text: string, tone: 'ok' | 'no' = 'ok') => {
    setMsg({ text, tone });
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 2800);
  };

  const market = useMemo(() => marketOf(now), [now]);
  const tabs = TABS[vendor];
  const priceOf = (id: string) => itemPrice(id, market, wallet.coolerLevel, COOLER.upgradePrices);

  // ---- what each tab lists ----
  const stock = useMemo(() => {
    if (tab === 'supplies') return stockOf('gen');
    if (tab === 'sashimi') return stockOf('minato').filter((i) => i.sheet === 'sashimi');
    if (tab === 'meals') return stockOf('minato').filter((i) => i.sheet === 'meals');
    return [];
  }, [tab]);
  const isStock = stock.length > 0;
  const sellQuote = useMemo(() => (tab === 'sell' ? quoteSellNow(wallet.cooler.map((c) => c.uid)) : null), [tab, wallet, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const linesByUid = useMemo(() => new Map<string, SellLine>((sellQuote?.lines ?? []).map((l) => [l.uid, l])), [sellQuote]);
  const pickedNow = wallet.cooler.filter((c) => picked.has(c.uid)).map((c) => c.uid);
  const pickedQuote = useMemo(() => (tab === 'sell' && pickedNow.length ? quoteSellNow(pickedNow) : null), [tab, wallet, now, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const iceStacks = wallet.goods.filter((g) => SHOP_BY_ID[g.id]?.use === 'ice');
  const iceCount = iceStacks.reduce((s, g) => s + g.qty, 0);
  const cartQty = (id: string) => cart.find((l) => l.id === id)?.qty ?? 0;
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const buyQuote = useMemo(() => (cart.length ? quoteBuyNow(cart, vendor) : null), [cart, vendor, wallet, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const cartTotal = cart.reduce((s, l) => s + (priceOf(l.id) ?? 0) * l.qty, 0);

  /** Everything the D-pad can land on, top → bottom. */
  const targets = useMemo<string[]>(() => {
    const t = ['tabs'];
    if (tab === 'sell') {
      if (wallet.cooler.length) t.push('all', ...wallet.cooler.map((c) => `fish:${c.uid}`), 'sell');
      if (iceCount) t.push('ice');
    } else if (tab === 'bag') {
      t.push(...wallet.goods.map((g) => `goods:${g.uid}`));
    } else {
      t.push(...stock.map((i) => `item:${i.id}`));
      if (cart.length) t.push('pay');
    }
    return t;
  }, [tab, wallet, stock, cart.length, iceCount]);
  const focusIdx = Math.min(focus, targets.length - 1);
  const focusKey = targets[focusIdx] ?? 'tabs';
  const isFocus = (key: string) => (keys && focusKey === key ? ' is-focus' : '');

  // keep the focused row on screen
  useEffect(() => {
    if (!keys) return;
    const el = rootRef.current?.querySelector(`[data-sp="${CSS.escape(focusKey)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusKey, keys]);

  // ---- actions ----
  const switchTab = (dir: number) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    setTab(next.id);
    setFocus(focusKey === 'tabs' ? 0 : 1);
    setMsg(null);
    sfx.move();
  };
  const goTab = (id: ShopTab) => { if (id !== tab) { setTab(id); setFocus(1); setMsg(null); sfx.move(); } };

  const togglePick = (uid: string) => {
    setPicked((p) => { const n = new Set(p); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
    sfx.move();
  };
  const pickAll = () => {
    const all = wallet.cooler.map((c) => c.uid);
    setPicked((p) => (all.every((u) => p.has(u)) ? new Set() : new Set(all)));
    sfx.move();
  };
  const sell = () => {
    const uids = pickedNow.length ? pickedNow : [];
    if (!uids.length) { sfx.no(); say('Pick the fish first. Tap them, or "Select all".', 'no'); return; }
    const r = sellToGen(uids);
    if (!r.ok) { sfx.no(); say(reasonLine(r), 'no'); return; }
    visit.current.soldFish += r.sold.length;
    visit.current.earned += r.earned;
    setPicked(new Set());
    setFocus(1);
    sfx.select();
    say(r.kept ? `+${formatMoney(r.earned)}. ${r.kept} fish wait: my ice boxes are full for today.` : `+${formatMoney(r.earned)}. Sold ${r.sold.length} fish to Gen.`);
  };
  const iceCooler = () => {
    const g = iceStacks[0];
    if (!g) return;
    const r = useBagItem(g.uid);
    if (!r.ok) { sfx.no(); say(reasonLine(r), 'no'); return; }
    sfx.select();
    say('Fresh ice on every fish: +15 minutes.');
  };
  const tapGoods = (uid: string) => {
    const g = wallet.goods.find((x) => x.uid === uid);
    if (!g) return;
    if (SHOP_BY_ID[g.id]?.use === 'ice') {
      const r = useBagItem(uid);
      if (!r.ok) { sfx.no(); say(reasonLine(r), 'no'); return; }
      sfx.select(); say('Fresh ice on every fish: +15 minutes.');
      return;
    }
    sfx.no();
    say('Eating and giving gifts come next. Keep it for now!', 'no');
  };
  const addToCart = (id: string, d: number) => {
    const it = SHOP_BY_ID[id];
    if (!it) return;
    if (it.soon) { sfx.no(); say(reasonLine({ ok: false, wallet, reason: 'not_for_sale' }), 'no'); return; }
    const q = cartQty(id);
    let next = Math.max(0, q + d);
    if (it.use === 'cooler_upgrade') next = Math.min(next, priceOf(id) === null ? 0 : 1);
    if (it.dailyLimit !== undefined) next = Math.min(next, Math.max(0, it.dailyLimit - (wallet.boughtToday[id] ?? 0)));
    if (d > 0 && cartCount - q + next > 10) next = q;
    if (next === q) {
      if (d > 0) {
        sfx.no();
        if (it.use === 'cooler_upgrade' && priceOf(id) === null) say(reasonLine({ ok: false, wallet, reason: 'cooler_max' }), 'no');
        else if (it.dailyLimit !== undefined && next >= it.dailyLimit - (wallet.boughtToday[id] ?? 0)) say(reasonLine({ ok: false, wallet, reason: 'daily_limit' }), 'no');
        else say(reasonLine({ ok: false, wallet, reason: 'too_many' }), 'no');
      }
      return;
    }
    setCart((c) => (next ? (q ? c.map((l) => (l.id === id ? { ...l, qty: next } : l)) : [...c, { id, qty: next }]) : c.filter((l) => l.id !== id)));
    sfx.move();
  };
  const pay = () => {
    if (!cart.length) return;
    const r = buyFrom(cart, vendor);
    if (!r.ok) {
      sfx.no();
      const who = r.item && SHOP_BY_ID[r.item] ? `${SHOP_BY_ID[r.item].name}: ` : '';
      say(who + reasonLine(r), 'no');
      return;
    }
    const n = r.lines.reduce((s, l) => s + l.qty, 0);
    visit.current.boughtItems += n;
    visit.current.spent += r.spent;
    setCart([]);
    setFocus(1);
    sfx.select();
    const upgrade = r.lines.some((l) => SHOP_BY_ID[l.id]?.use === 'cooler_upgrade');
    say(upgrade ? `Bigger cooler! It now holds ${coolerSlots(r.wallet)} fish.` : `−${formatMoney(r.spent)}. ${n} ${n === 1 ? 'thing' : 'things'} in your bag.`);
  };
  const close = () => { sfx.back(); onClose({ ...visit.current }); };

  // ---- controller / keyboard ----
  const handle = (input: ShopInput) => {
    setKeys(true);
    if (input === 'back') { close(); return; }
    const n = targets.length;
    if (input === 'up' || input === 'down') {
      const next = Math.max(0, Math.min(n - 1, focusIdx + (input === 'up' ? -1 : 1)));
      if (next !== focusIdx) { setFocus(next); sfx.move(); }
      return;
    }
    const dir = input === 'left' ? -1 : input === 'right' ? 1 : 0;
    const key = focusKey;
    if (key.startsWith('item:')) {
      addToCart(key.slice(5), dir || 1);
      return;
    }
    if (dir) { switchTab(dir); return; }
    if (key === 'tabs') { switchTab(1); return; }
    if (key === 'all') pickAll();
    else if (key.startsWith('fish:')) togglePick(key.slice(5));
    else if (key === 'sell') sell();
    else if (key === 'ice') iceCooler();
    else if (key.startsWith('goods:')) tapGoods(key.slice(6));
    else if (key === 'pay') pay();
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    inputRef.current = (i) => handleRef.current(i);
    return () => { inputRef.current = null; };
  }, [inputRef]);

  // Keyboard: while open, this screen owns the keys (capture phase, so the game never sees them)
  useEffect(() => {
    const gate = new KeyGate();
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const input = menuInputFromKey(e);
      e.stopPropagation();
      if (!input || input === 'start' || input === 'bag') {
        if (e.key === ' ' || e.key === 'Tab') e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!gate.accept(input, e.repeat, performance.now())) return;
      handleRef.current(input);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---- the description box: what the focused row means ----
  const describe = (): React.ReactNode => {
    if (msg) return <span className={`sp-msg is-${msg.tone}`}>{msg.text}</span>;
    const key = focusKey;
    if (key.startsWith('fish:')) {
      const l = linesByUid.get(key.slice(5));
      if (!l) return 'This one is gone.';
      return (
        <>
          <b>{fishName(l.fishId)}</b>: base {l.base} {x2(l.size)} size {x2(l.fresh.mult)} {l.fresh.label.toLowerCase()}
          {l.wanted > 1 ? ` ${x2(l.wanted)} wanted` : ''}{l.glut < 1 ? ` ${x2(l.glut)} many sold` : ''} = <b>{l.price}</b>.
          {' '}Spoils in {mmss(l.fresh.leftMin)}.
        </>
      );
    }
    if (key.startsWith('item:')) {
      const it = SHOP_BY_ID[key.slice(5)];
      if (!it) return null;
      return <>{itemFacts(it)} <span className="sp-hint">◀ ▶ how many</span></>;
    }
    if (key.startsWith('goods:')) {
      const g = wallet.goods.find((x) => x.uid === key.slice(6));
      const it = g && SHOP_BY_ID[g.id];
      if (!g || !it) return null;
      return <>{it.note}{it.use === 'ice' ? ' ◯ = ice your cooler now.' : ''}</>;
    }
    if (tab === 'sell') {
      if (!wallet.cooler.length) return 'Your cooler is empty. Catch fish at Quiet Bay, then bring them here within 30 minutes.';
      return <>Gen wants today: <b>{market.wanted.map(fishName).join(', ')}</b> (×1.5). Tap fish to pick them.</>;
    }
    if (tab === 'bag') return wallet.goods.length ? 'What you bought. Eating and gifts come next.' : 'Nothing yet. Things you buy here go in this bag.';
    if (key === 'pay' && buyQuote?.problem) return <span className="sp-msg is-no">{reasonLine({ ok: false, wallet, reason: buyQuote.problem })}</span>;
    if (market.special && tab === 'sashimi') return <>Today's special: <b>{SHOP_BY_ID[market.special]?.name}</b>, 20% off.</>;
    return 'Tap a dish to add it. ✕ to leave.';
  };

  // ---- rows ----
  const coolerCap = coolerSlots(wallet);
  const renderSell = () => (
    <>
      {wallet.cooler.length > 0 && (
        <button type="button" tabIndex={-1} data-sp="all" className={`sp-row sp-row-sub${isFocus('all')}`} onClick={() => { setFocus(targets.indexOf('all')); pickAll(); }}>
          <span className={`sp-check${wallet.cooler.every((c) => picked.has(c.uid)) ? ' is-on' : ''}`} />
          <span className="sp-name">Select all</span>
          <span className="sp-meta">Cooler {wallet.cooler.length}/{coolerCap}</span>
        </button>
      )}
      {wallet.cooler.map((c) => {
        const l = linesByUid.get(c.uid);
        const fr = freshnessOf(c.caughtAt, c.icedMin, now);
        const key = `fish:${c.uid}`;
        return (
          <button type="button" tabIndex={-1} key={c.uid} data-sp={key} className={`sp-row${isFocus(key)}`}
            onClick={() => { setFocus(targets.indexOf(key)); togglePick(c.uid); }}>
            <span className={`sp-check${picked.has(c.uid) ? ' is-on' : ''}`} />
            <img className="sp-icon" src={freeIcon(c.fishId)} alt="" />
            <span className="sp-name">
              {fishName(c.fishId)}{c.sizeCm !== null && <small> {c.sizeCm} cm</small>}
              {l && l.wanted > 1 && <em className="sp-tag sp-tag-gold">WANTED</em>}
            </span>
            {fr && <span className={`sp-fresh is-${fr.id}`}>{fr.label} {mmss(fr.leftMin)}</span>}
            <span className="sp-price">{l ? l.price : '–'}</span>
          </button>
        );
      })}
      {wallet.cooler.length > 0 && (
        <button type="button" tabIndex={-1} data-sp="sell" className={`sp-row sp-cta${isFocus('sell')}`} onClick={() => { setFocus(targets.indexOf('sell')); sell(); }}>
          <span className="sp-name">{pickedNow.length ? `Sell ${pickedNow.length} fish` : 'Sell (pick fish first)'}</span>
          <span className="sp-price"><CoinIcon />{pickedQuote ? pickedQuote.total : 0}</span>
        </button>
      )}
      {iceCount > 0 && (
        <button type="button" tabIndex={-1} data-sp="ice" className={`sp-row sp-row-sub${isFocus('ice')}`} onClick={() => { setFocus(targets.indexOf('ice')); iceCooler(); }}>
          <img className="sp-icon" src={shopIcon('ice_block')} alt="" />
          <span className="sp-name">Ice the cooler</span>
          <span className="sp-meta">have {iceCount}</span>
        </button>
      )}
      {!wallet.cooler.length && <p className="sp-empty">Cooler empty ({coolerCap} slots).</p>}
    </>
  );

  const renderStock = () => (
    <>
      {stock.map((it) => {
        const key = `item:${it.id}`;
        const p = priceOf(it.id);
        const q = cartQty(it.id);
        const left = it.dailyLimit !== undefined ? Math.max(0, it.dailyLimit - (wallet.boughtToday[it.id] ?? 0)) : null;
        const special = market.special === it.id;
        return (
          <button type="button" tabIndex={-1} key={it.id} data-sp={key} className={`sp-row${isFocus(key)}${it.soon || p === null ? ' is-off' : ''}`}
            onClick={() => { setFocus(targets.indexOf(key)); addToCart(it.id, 1); }}>
            <img className="sp-icon" src={shopIcon(it.id)} alt="" />
            <span className="sp-name">
              {it.name}
              {special && <em className="sp-tag sp-tag-gold">SPECIAL</em>}
              {it.soon && <em className="sp-tag">SOON</em>}
              {left !== null && <em className="sp-tag">{left} left</em>}
              {it.use === 'cooler_upgrade' && p === null && <em className="sp-tag">MAX</em>}
            </span>
            {q > 0 && (
              <span className="sp-qty">
                <span role="button" tabIndex={-1} className="sp-minus" onClick={(e) => { e.stopPropagation(); addToCart(it.id, -1); }}>−</span>
                {q}
              </span>
            )}
            <span className="sp-price">
              {special && <s>{it.price}</s>}
              {p ?? '–'}
            </span>
          </button>
        );
      })}
    </>
  );

  const renderBag = () => (
    <>
      {wallet.goods.map((g) => {
        const it = SHOP_BY_ID[g.id];
        const r = goodsFreshRatio(g, now);
        const key = `goods:${g.uid}`;
        const leftMin = it?.perishMin ? Math.max(0, it.perishMin - (now - g.at) / 60_000) : null;
        return (
          <button type="button" tabIndex={-1} key={g.uid} data-sp={key} className={`sp-row${isFocus(key)}`}
            onClick={() => { setFocus(targets.indexOf(key)); tapGoods(g.uid); }}>
            <img className="sp-icon" src={shopIcon(g.id)} alt="" />
            <span className="sp-name">{it?.name ?? g.id}</span>
            {leftMin !== null && <span className={`sp-fresh ${r !== null && r < 0.3 ? 'is-tired' : 'is-good'}`}>{mmss(leftMin)}</span>}
            <span className="sp-price">×{g.qty}</span>
          </button>
        );
      })}
      {!wallet.goods.length && <p className="sp-empty">Empty bag ({BAG.slots} slots).</p>}
    </>
  );

  return (
    <div ref={rootRef} className="sp-frame" data-compact={compact ? 'true' : 'false'} data-keys={keys ? 'true' : 'false'}
      onPointerDown={() => setKeys(false)}>
      <div className="sp-box" role="dialog" aria-label={TITLE[vendor]}>
        <div className="sp-title">
          <button type="button" tabIndex={-1} className="sp-x" onClick={close} aria-label="Leave the counter">✕</button>
          <span className="sp-heading">{TITLE[vendor]}</span>
          <span className="sp-coins"><CoinIcon />{wallet.coins.toLocaleString('en-US')}</span>
        </div>

        <div data-sp="tabs" className={`sp-tabs${isFocus('tabs')}`}>
          <span className="sp-arrow">◂</span>
          {tabs.map((t) => (
            <button type="button" tabIndex={-1} key={t.id} className={`sp-tab${t.id === tab ? ' is-on' : ''}`} onClick={() => goTab(t.id)}>
              {t.label}{t.id === 'bag' && wallet.goods.length ? ` ${wallet.goods.length}` : ''}
            </button>
          ))}
          <span className="sp-arrow">▸</span>
        </div>

        <div className="sp-list">
          {tab === 'sell' ? renderSell() : tab === 'bag' ? renderBag() : renderStock()}
        </div>

        {isStock && cart.length > 0 && (
          <button type="button" tabIndex={-1} data-sp="pay" className={`sp-paybar${isFocus('pay')}${buyQuote?.problem ? ' is-off' : ''}`} onClick={() => { setFocus(targets.indexOf('pay')); pay(); }}>
            <span>Pay · {cartCount} {cartCount === 1 ? 'thing' : 'things'}</span>
            <span className="sp-price"><CoinIcon />{cartTotal}</span>
          </button>
        )}

        <div className="sp-desc">{describe()}</div>
      </div>
    </div>
  );
};
