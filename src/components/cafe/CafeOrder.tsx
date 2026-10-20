import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyGate, menuInputFromKey } from '../gameMenu/menuInput';
import { sound } from '../../game/audio';
import { triggerHaptic } from '../../game/haptics';
import {
  CATEGORIES, DRINKS, ICED_EXTRA, MAX_CUPS, OAT_EXTRA, SWEET_LEVELS,
  addLine, cupCount, defaultLine, drinkById, lineName, lineOptions, linePrice, orderTotal, setLineQty, sweetLabel,
  type CafeCategory, type Drink, type Milk, type OrderLine, type Temp,
} from '../../game/cafe/cafeMenu';
import { CupIcon } from './CupIcon';
import './cafeOrder.css';

// The café's order app (Café step 2, 2026-10-20). Looks and works like a Thai food-delivery app:
// store header → menu by category → a drink's options sheet → basket bar → basket → "Place order".
// Drawn INSIDE the game screen: fills the Game Boy screen on phones, a phone-sized panel on desktop.
//
// Input: touch/click everywhere, plus the controller (App forwards ◯ / ✕ / D-pad through `inputRef`)
// and the keyboard (arrows/WASD, Enter/E/O, X/Esc — handled here while the app is open).
// The gold focus ring only shows while the D-pad or keyboard is in use.

export type CafeInput = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

interface CafeOrderProps {
  compact: boolean;
  /** App calls this with ◯ / ✕ / D-pad presses (one step per press). */
  inputRef: React.MutableRefObject<((input: CafeInput) => void) | null>;
  /** "Place order" finished: App hands the order to the barista. */
  onPlace: (lines: OrderLine[]) => void;
  /** Closed without ordering (the basket is kept for next time). */
  onClose: () => void;
}

type View =
  | { kind: 'menu' }
  | { kind: 'item'; draft: OrderLine }
  | { kind: 'basket' }
  | { kind: 'placed' };

/** The basket survives closing the app (like a real delivery app), until an order is placed. */
let keptBasket: OrderLine[] = [];

const STORE_NAME = 'Weekday Chill Café';
const STRENGTH_WORD = ['No coffee', 'Very soft', 'Soft', 'Medium', 'Strong', 'Very strong'];
const PLACED_MS = 1100;
const TOAST_MS = 1400;

const sfx = {
  move: () => { sound.playCursor(); triggerHaptic(10); },
  select: () => { sound.playSelect(); triggerHaptic(15); },
  back: () => { sound.playBack(); triggerHaptic(15); },
};

// ---- small icons (vector: this is an "app" inside the pixel world) ----------------------------

const Svg: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IconBack = () => <Svg><path d="M15 5l-7 7 7 7" /></Svg>;
const IconPlus = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>;
const IconMinus = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 12h14" /></Svg>;
const IconTrash = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></Svg>;
const IconClock = () => <Svg size={12}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
const IconCheck = () => <Svg size={40}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
const IconBag = () => <Svg size={20}><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></Svg>;
const IconStore = () => <Svg size={18}><path d="M4 10l1.5-5h13L20 10M4 10h16M4 10v1.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0V10M5.5 13.5V20h13v-6.5" /></Svg>;
const IconStar = () => (
  <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true">
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="#F2B233" />
  </svg>
);

const Strength: React.FC<{ value: number }> = ({ value }) =>
  value === 0 ? (
    <span className="co-strength co-strength-none">No coffee</span>
  ) : (
    <span className="co-strength" aria-label={`Taste: ${STRENGTH_WORD[value]}`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= value ? 'on' : ''} />)}
      <em>{STRENGTH_WORD[value]}</em>
    </span>
  );

const Stepper: React.FC<{
  value: number; canMinus: boolean; canPlus: boolean; trashAtOne?: boolean;
  onMinus: () => void; onPlus: () => void;
}> = ({ value, canMinus, canPlus, trashAtOne, onMinus, onPlus }) => (
  <span className="co-stepper">
    <button type="button" tabIndex={-1} disabled={!canMinus} onClick={onMinus} aria-label="Less">
      {trashAtOne && value === 1 ? <IconTrash size={15} /> : <IconMinus size={15} />}
    </button>
    <span className="co-stepper-n">{value}</span>
    <button type="button" tabIndex={-1} disabled={!canPlus} onClick={onPlus} aria-label="More"><IconPlus size={15} /></button>
  </span>
);

// ---- the app ------------------------------------------------------------------------------------

export const CafeOrder: React.FC<CafeOrderProps> = ({ compact, inputRef, onPlace, onClose }) => {
  const [basket, setBasket] = useState<OrderLine[]>(() => keptBasket);
  const [view, setView] = useState<View>({ kind: 'menu' });
  const [focus, setFocus] = useState(0);
  /** D-pad / keyboard in use → show the focus ring. A touch or click hides it again. */
  const [keys, setKeys] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<CafeCategory>('coffee');

  const rootRef = useRef<HTMLDivElement>(null);
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<CafeCategory, HTMLElement | null>>>({});
  const menuFocusRef = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => { keptBasket = basket; }, [basket]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  /** Menu order = category order, so ↑/↓ walks the list exactly as it is drawn. */
  const menuDrinks = useMemo(() => CATEGORIES.flatMap((c) => DRINKS.filter((d) => d.category === c.id)), []);
  const cups = cupCount(basket);
  const room = MAX_CUPS - cups;
  const total = orderTotal(basket);

  /** Everything the D-pad can land on in the current view, top → bottom. */
  const targets = useMemo<string[]>(() => {
    if (view.kind === 'menu') return [...menuDrinks.map((d) => `drink:${d.id}`), ...(basket.length ? ['basket'] : [])];
    if (view.kind === 'item') {
      const d = drinkById(view.draft.drinkId);
      if (!d) return [];
      return [...(d.temps.length > 1 ? ['temp'] : []), ...(d.sweet ? ['sweet'] : []), ...(d.milk ? ['milk'] : []), 'qty', 'add'];
    }
    if (view.kind === 'basket') return [...basket.map((_, i) => `line:${i}`), 'more', 'place'];
    return [];
  }, [view, basket, menuDrinks]);

  const focusKey = targets[Math.min(focus, targets.length - 1)] ?? '';
  const isFocus = (key: string) => (keys && focusKey === key ? ' is-focus' : '');

  // Keep the focused thing on screen while steering with the D-pad / keys
  useEffect(() => {
    if (!keys || !focusKey) return;
    // Measured by hand: scrollIntoView ignored scroll-margin here, and the sticky tabs / basket bar cover the edges
    const el = rootRef.current?.querySelector(`[data-co="${focusKey}"]`) as HTMLElement | null;
    const box = el?.closest('.co-scroll') as HTMLElement | null;
    if (el && box) {
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const topPad = view.kind === 'menu' ? 48 : 10;
      const bottomPad = view.kind === 'menu' && basket.length ? 80 : 10;
      if (r.top < b.top + topPad) box.scrollTop -= b.top + topPad - r.top;
      else if (r.bottom > b.bottom - bottomPad) box.scrollTop += r.bottom - (b.bottom - bottomPad);
    }
    if (view.kind === 'menu' && focusKey.startsWith('drink:')) {
      const d = drinkById(focusKey.slice(6));
      if (d) setActiveCat(d.category);
    }
  }, [focusKey, keys, view.kind, basket.length]);

  // The active category pill follows the scroll (touch)
  const onMenuScroll = useCallback(() => {
    const box = menuScrollRef.current;
    if (!box) return;
    const top = box.scrollTop + 56;
    let cur: CafeCategory = CATEGORIES[0].id;
    for (const c of CATEGORIES) {
      const el = sectionRefs.current[c.id];
      if (el && el.offsetTop <= top) cur = c.id;
    }
    setActiveCat((prev) => (prev === cur ? prev : cur));
  }, []);

  // Keep the active pill visible in the tab row
  useEffect(() => {
    const pill = rootRef.current?.querySelector(`[data-tab="${activeCat}"]`) as HTMLElement | null;
    const row = pill?.parentElement;
    if (!pill || !row) return;
    const left = pill.offsetLeft - 10;
    const right = pill.offsetLeft + pill.offsetWidth + 10 - row.clientWidth;
    if (row.scrollLeft > left) row.scrollLeft = left;
    else if (row.scrollLeft < right) row.scrollLeft = right;
  }, [activeCat]);

  // ---- actions ----

  const showToast = (text: string) => {
    setToast(text);
    later(() => setToast((t) => (t === text ? null : t)), TOAST_MS);
  };

  const openItem = (d: Drink) => {
    menuFocusRef.current = Math.max(0, menuDrinks.indexOf(d));
    const draft = defaultLine(d);
    draft.qty = Math.max(1, Math.min(draft.qty, room));
    setView({ kind: 'item', draft });
    setFocus(0);
    sfx.select();
  };

  const backToMenu = (focusIndex = menuFocusRef.current) => {
    setView({ kind: 'menu' });
    setFocus(focusIndex);
  };

  const openBasket = () => {
    if (!basket.length) return;
    setView({ kind: 'basket' });
    setFocus(0);
    sfx.select();
  };

  const addDraft = () => {
    if (view.kind !== 'item' || room <= 0) return;
    setBasket((b) => addLine(b, view.draft));
    showToast(`Added ${lineName(view.draft)}`);
    sfx.select();
    backToMenu();
  };

  const place = () => {
    if (!basket.length) return;
    const lines = basket;
    setBasket([]); // the order is placed: next visit starts with an empty basket
    setView({ kind: 'placed' });
    sfx.select();
    later(() => onPlace(lines), PLACED_MS);
  };

  const goBack = () => {
    if (view.kind === 'placed') return;
    sfx.back();
    if (view.kind === 'menu') onClose();
    else if (view.kind === 'item') backToMenu();
    else backToMenu(basket.length ? menuDrinks.length : menuFocusRef.current); // land on the basket bar
  };

  const setDraft = (patch: Partial<OrderLine>) =>
    setView((v) => (v.kind === 'item' ? { ...v, draft: { ...v.draft, ...patch } } : v));

  const changeLineQty = (i: number, qty: number) => setBasket((b) => setLineQty(b, i, qty));

  // The basket emptied while looking at it → back to the menu
  useEffect(() => {
    if (view.kind === 'basket' && basket.length === 0) backToMenu();
  }, [view.kind, basket.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- controller / keyboard ----

  const handle = (input: CafeInput) => {
    if (view.kind === 'placed') return;
    setKeys(true);
    if (input === 'back') { goBack(); return; }

    const n = targets.length;
    if (input === 'up' || input === 'down') {
      const next = Math.max(0, Math.min(n - 1, focus + (input === 'up' ? -1 : 1)));
      if (next !== focus) { setFocus(next); sfx.move(); }
      return;
    }
    const key = focusKey;
    const dir = input === 'left' ? -1 : input === 'right' ? 1 : 0;

    if (view.kind === 'menu') {
      if (dir) {
        // ←/→ jumps to the previous / next category
        const d = key.startsWith('drink:') ? drinkById(key.slice(6)) : menuDrinks[menuDrinks.length - 1];
        const ci = CATEGORIES.findIndex((c) => c.id === d?.category);
        const target = CATEGORIES[Math.max(0, Math.min(CATEGORIES.length - 1, ci + dir))];
        const first = menuDrinks.findIndex((x) => x.category === target.id);
        if (first >= 0 && first !== focus) { setFocus(first); sfx.move(); }
        return;
      }
      if (key === 'basket') openBasket();
      else { const d = drinkById(key.slice(6)); if (d) openItem(d); }
      return;
    }

    if (view.kind === 'item') {
      const draft = view.draft;
      const d = drinkById(draft.drinkId);
      if (!d) return;
      if (dir) {
        if (key === 'temp') {
          const i = d.temps.indexOf(draft.temp);
          const t = d.temps[Math.max(0, Math.min(d.temps.length - 1, i + dir))];
          if (t !== draft.temp) { setDraft({ temp: t }); sfx.move(); }
        } else if (key === 'sweet') {
          const i = SWEET_LEVELS.indexOf(draft.sweet);
          const s = SWEET_LEVELS[Math.max(0, Math.min(SWEET_LEVELS.length - 1, i + dir))];
          if (s !== draft.sweet) { setDraft({ sweet: s }); sfx.move(); }
        } else if (key === 'milk') {
          const m: Milk = dir < 0 ? 'fresh' : 'oat';
          if (m !== draft.milk) { setDraft({ milk: m }); sfx.move(); }
        } else if (key === 'qty') {
          const q = Math.max(1, Math.min(Math.max(1, room), draft.qty + dir));
          if (q !== draft.qty) { setDraft({ qty: q }); sfx.move(); }
        }
        return;
      }
      if (key === 'add') addDraft();
      else if (focus < n - 1) { setFocus(focus + 1); sfx.move(); } // ◯ on an option = next row
      return;
    }

    if (view.kind === 'basket') {
      if (key.startsWith('line:')) {
        const i = Number(key.slice(5));
        if (dir) { changeLineQty(i, (basket[i]?.qty ?? 0) + dir); sfx.move(); }
        else if (focus < n - 1) { setFocus(focus + 1); sfx.move(); }
        return;
      }
      if (dir) return;
      if (key === 'more') { sfx.select(); backToMenu(); }
      else if (key === 'place') place();
    }
  };

  // App's ◯ / ✕ / D-pad always reach the newest handler
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    inputRef.current = (i) => handleRef.current(i);
    return () => { inputRef.current = null; };
  }, [inputRef]);

  // Keyboard: while the app is open it owns the keys (capture phase, so the game never sees them)
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

  // ---- views ----

  const renderMenu = () => (
    <div className="co-view" aria-hidden={view.kind !== 'menu'}>
      <div className="co-scroll" ref={menuScrollRef} onScroll={onMenuScroll} data-pad={basket.length ? 'bar' : undefined}>
        <div className="co-cover">
          <button type="button" tabIndex={-1} className="co-round co-float" onClick={goBack} aria-label="Close menu"><IconBack /></button>
        </div>
        <div className="co-store">
          <div className="co-store-name">{STORE_NAME}</div>
          <div className="co-store-meta"><IconStar /> 4.9 <span className="co-dot">·</span> Coffee &amp; Thai drinks</div>
          <div className="co-store-tags">
            <span className="co-tag co-tag-green">Open now</span>
            <span className="co-tag"><IconClock /> 3–5 min</span>
            <span className="co-tag">Pick up at counter</span>
          </div>
        </div>

        <div className="co-tabs">
          {CATEGORIES.map((c) => (
            <button type="button" tabIndex={-1} key={c.id} data-tab={c.id} className={`co-tab${activeCat === c.id ? ' is-on' : ''}`}
              onClick={() => {
                const sec = sectionRefs.current[c.id];
                const box = menuScrollRef.current;
                const tabs = rootRef.current?.querySelector('.co-tabs') as HTMLElement | null;
                if (sec && box) {
                  const top = box.scrollTop + sec.getBoundingClientRect().top - box.getBoundingClientRect().top - (tabs?.offsetHeight ?? 0);
                  box.scrollTo({ top, behavior: 'smooth' });
                }
                setActiveCat(c.id);
                setFocus(Math.max(0, menuDrinks.findIndex((d) => d.category === c.id)));
              }}>
              {c.label}
            </button>
          ))}
        </div>

        {CATEGORIES.map((c) => (
          <section key={c.id} ref={(el) => { sectionRefs.current[c.id] = el; }} className="co-section">
            <h3 className="co-sec">{c.label}</h3>
            {DRINKS.filter((d) => d.category === c.id).map((d) => {
              const inBasket = basket.filter((l) => l.drinkId === d.id).reduce((s, l) => s + l.qty, 0);
              return (
                <button type="button" tabIndex={-1} key={d.id} data-co={`drink:${d.id}`} className={`co-row${isFocus(`drink:${d.id}`)}`}
                  onClick={() => { setFocus(menuDrinks.indexOf(d)); openItem(d); }}>
                  <span className="co-thumb"><CupIcon layers={d.layers} temp={d.temps[0]} size={compact ? 30 : 34} /></span>
                  <span className="co-row-main">
                    <span className="co-row-name">{d.name}</span>
                    <span className="co-row-blurb">{d.blurb}</span>
                    <Strength value={d.strength} />
                  </span>
                  <span className="co-row-side">
                    <span className="co-price">฿{d.price}</span>
                    {inBasket > 0
                      ? <span className="co-count">{inBasket}</span>
                      : <span className="co-plus"><IconPlus size={16} /></span>}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
        <p className="co-endnote">Made fresh by the barista. Pick up at the counter.</p>
      </div>

      {basket.length > 0 && (
        <button type="button" tabIndex={-1} data-co="basket" className={`co-basketbar${isFocus('basket')}`} onClick={openBasket}>
          <span className="co-bag"><IconBag /><span className="co-badge">{cups}</span></span>
          <span className="co-basketbar-label">View basket</span>
          <span className="co-basketbar-total">฿{total}</span>
        </button>
      )}
    </div>
  );

  const renderItem = (draft: OrderLine) => {
    const d = drinkById(draft.drinkId);
    if (!d) return null;
    const pill = (on: boolean, label: React.ReactNode, onClick: () => void, extra?: number) => (
      <button type="button" tabIndex={-1} className={`co-pill${on ? ' is-on' : ''}`} onClick={() => { onClick(); sfx.move(); }}>
        <span>{label}</span>
        {extra ? <small>+฿{extra}</small> : null}
      </button>
    );
    const maxQty = Math.max(1, room);
    return (
      <div className="co-view co-sheet">
        <div className="co-scroll">
          <div className="co-hero">
            <button type="button" tabIndex={-1} className="co-round co-float" onClick={goBack} aria-label="Back to menu"><IconBack /></button>
            <CupIcon layers={d.layers} temp={draft.temp} size={compact ? 62 : 76} />
          </div>
          <div className="co-item-head">
            <span className="co-item-name">{d.name}</span>
            <span className="co-item-price">฿{d.price}</span>
          </div>
          <p className="co-item-blurb">{d.blurb}</p>
          <div className="co-item-taste"><span>Taste</span><Strength value={d.strength} /></div>

          {d.temps.length > 1 ? (
            <div className={`co-group${isFocus('temp')}`} data-co="temp">
              <div className="co-group-head"><span>Hot or iced?</span><span className="co-pick">Pick 1</span></div>
              <div className="co-pills">
                {pill(draft.temp === 'hot', 'Hot', () => setDraft({ temp: 'hot' as Temp }))}
                {pill(draft.temp === 'iced', 'Iced', () => setDraft({ temp: 'iced' as Temp }), ICED_EXTRA)}
              </div>
            </div>
          ) : (
            <p className="co-note">Served {d.temps[0]} only.</p>
          )}

          {d.sweet && (
            <div className={`co-group${isFocus('sweet')}`} data-co="sweet">
              <div className="co-group-head"><span>How sweet?</span><span className="co-pick">Pick 1</span></div>
              <div className="co-pills">
                {SWEET_LEVELS.map((s) => <React.Fragment key={s}>{pill(draft.sweet === s, `${s}%`, () => setDraft({ sweet: s }))}</React.Fragment>)}
              </div>
              <p className="co-caption">{sweetLabel(draft.sweet)}</p>
            </div>
          )}

          {d.milk && (
            <div className={`co-group${isFocus('milk')}`} data-co="milk">
              <div className="co-group-head"><span>Milk</span><span className="co-pick">Pick 1</span></div>
              <div className="co-pills">
                {pill(draft.milk === 'fresh', 'Fresh milk', () => setDraft({ milk: 'fresh' }))}
                {pill(draft.milk === 'oat', 'Oat milk', () => setDraft({ milk: 'oat' }), OAT_EXTRA)}
              </div>
            </div>
          )}

          <div className={`co-group co-qty${isFocus('qty')}`} data-co="qty">
            <span>Cups</span>
            <Stepper value={draft.qty} canMinus={draft.qty > 1} canPlus={draft.qty < maxQty}
              onMinus={() => { setDraft({ qty: Math.max(1, draft.qty - 1) }); sfx.move(); }}
              onPlus={() => { setDraft({ qty: Math.min(maxQty, draft.qty + 1) }); sfx.move(); }} />
          </div>
          {room <= 0 && <p className="co-warn">Your basket is full ({MAX_CUPS} cups).</p>}
        </div>
        <div className="co-foot">
          <button type="button" tabIndex={-1} data-co="add" className={`co-cta${isFocus('add')}`} disabled={room <= 0} onClick={addDraft}>
            Add to basket · ฿{linePrice(draft)}
          </button>
        </div>
      </div>
    );
  };

  const renderBasket = () => (
    <div className="co-view co-sheet">
      <div className="co-bar">
        <button type="button" tabIndex={-1} className="co-round" onClick={goBack} aria-label="Back to menu"><IconBack /></button>
        <div>
          <div className="co-bar-title">Your order</div>
          <div className="co-bar-sub">{STORE_NAME}</div>
        </div>
      </div>
      <div className="co-scroll co-pad">
        <div className="co-card co-pickup">
          <span className="co-pickup-icon"><IconStore /></span>
          <div>
            <div>Pick up at the counter</div>
            <small>Ready in about 3 min.</small>
          </div>
        </div>

        <div className="co-card">
          {basket.map((l, i) => {
            const d = drinkById(l.drinkId);
            return (
              <div key={`${l.drinkId}-${l.temp}-${l.sweet}-${l.milk}`} data-co={`line:${i}`} className={`co-line${isFocus(`line:${i}`)}`}>
                <span className="co-thumb co-thumb-sm">{d && <CupIcon layers={d.layers} temp={l.temp} size={compact ? 24 : 28} />}</span>
                <div className="co-line-main">
                  <div className="co-line-name">{lineName(l)}</div>
                  {lineOptions(l) && <small>{lineOptions(l)}</small>}
                  <b>฿{linePrice(l)}</b>
                </div>
                <Stepper value={l.qty} trashAtOne canMinus canPlus={room > 0}
                  onMinus={() => { changeLineQty(i, l.qty - 1); sfx.move(); }}
                  onPlus={() => { changeLineQty(i, l.qty + 1); sfx.move(); }} />
              </div>
            );
          })}
          <button type="button" tabIndex={-1} data-co="more" className={`co-more${isFocus('more')}`} onClick={() => { sfx.select(); backToMenu(); }}>
            <IconPlus size={15} /> Add more
          </button>
        </div>

        <div className="co-card co-sum">
          <div><span>Subtotal ({cups} {cups === 1 ? 'cup' : 'cups'})</span><span>฿{total}</span></div>
          <div><span>Service fee</span><span>฿0</span></div>
          <div className="co-sum-total"><span>Total</span><span>฿{total}</span></div>
        </div>
        <div className="co-card co-pay"><span>Payment</span><span>Pay at the counter</span></div>
      </div>
      <div className="co-foot">
        <button type="button" tabIndex={-1} data-co="place" className={`co-cta${isFocus('place')}`} onClick={place}>
          Place order · ฿{total}
        </button>
      </div>
    </div>
  );

  const renderPlaced = () => (
    <div className="co-view co-placed">
      <div className="co-check"><IconCheck /></div>
      <div className="co-placed-title">Order sent!</div>
      <div className="co-placed-sub">The barista is reading it now...</div>
    </div>
  );

  return (
    <div ref={rootRef} className="co-root" data-compact={compact ? 'true' : 'false'} data-keys={keys ? 'true' : 'false'}
      onPointerDown={() => setKeys(false)}>
      {!compact && <div className="co-scrim" onClick={goBack} />}
      <div className="co-phone" role="dialog" aria-label={`${STORE_NAME} menu`}>
        {/* The menu stays mounted under the drink sheet and the basket, so its scroll position survives */}
        {view.kind !== 'placed' && renderMenu()}
        {view.kind === 'item' && renderItem(view.draft)}
        {view.kind === 'basket' && renderBasket()}
        {view.kind === 'placed' && renderPlaced()}
        {toast && view.kind === 'menu' && <div className="co-toast" data-bar={basket.length ? 'true' : 'false'}>{toast}</div>}
      </div>
    </div>
  );
};
