// Weekday Chill Café — the drink menu and the order (Café step 1–2, 2026-10-20).
//
// Flow: talk to the barista → "Order a drink" → the order app (components/cafe/CafeOrder.tsx)
//       → "Place order" → the barista reads the order back → "Here you are!" (fake for now:
//       no cup in the bag, no money taken, no cutscene yet).
//
// Pure data + helpers (no React, no imports), so the order screen, the barista's lines (cafeBarista.ts)
// and the unit tests (tests/cafe-menu.test.mjs) share one source.
//
// `strength` is how strong a drink TASTES (bold/bitter), shown on the menu so players learn
// "strong vs soft". Caffeine is deliberately NOT shown: it's the surprise for the later
// "guess while she brews" step (a 1 oz espresso shot ≈ 63 mg, an 8 oz brewed coffee ≈ 96 mg —
// Mayo Clinic, "Caffeine content for coffee, tea, soda and more").

export type CafeCategory = 'coffee' | 'milk' | 'thai' | 'nocoffee';
export type Temp = 'hot' | 'iced';
export type Sweet = 0 | 25 | 50 | 100;
export type Milk = 'fresh' | 'oat';

export const CATEGORIES: { id: CafeCategory; label: string }[] = [
  { id: 'coffee', label: 'Coffee' },
  { id: 'milk', label: 'With milk' },
  { id: 'thai', label: 'Thai classics' },
  { id: 'nocoffee', label: 'No coffee' },
];

/** One coloured layer in the pixel glass, bottom → top. `w` = relative height. */
export interface CupLayer { c: string; w: number }

export interface Drink {
  id: string;
  name: string;
  category: CafeCategory;
  /** One short line under the name. */
  blurb: string;
  /** Baht, hot / fresh-milk price. */
  price: number;
  /** How strong it tastes, 1 (soft) – 5 (strong). 0 = no coffee. */
  strength: 0 | 1 | 2 | 3 | 4 | 5;
  /** Allowed temperatures; the first one is the default. */
  temps: Temp[];
  /** Asks "how sweet?" */
  sweet: boolean;
  defaultSweet: Sweet;
  /** Asks fresh or oat milk. */
  milk: boolean;
  layers: CupLayer[];
}

export const ICED_EXTRA = 10;
export const OAT_EXTRA = 15;
/** Cups in one order. The "one cup a day" idea comes later; this only keeps the basket sane. */
export const MAX_CUPS = 5;
export const SWEET_LEVELS: Sweet[] = [0, 25, 50, 100];

const ESPRESSO = '#3B2416';
const CREMA = '#B9783E';

export const DRINKS: Drink[] = [
  // ---- Coffee ----
  { id: 'espresso', name: 'Espresso', category: 'coffee', blurb: 'One shot. Small, thick and bold.', price: 55, strength: 5,
    temps: ['hot'], sweet: false, defaultSweet: 0, milk: false, layers: [{ c: ESPRESSO, w: 5 }, { c: CREMA, w: 1 }] },
  { id: 'americano', name: 'Americano', category: 'coffee', blurb: 'A shot of espresso + water.', price: 60, strength: 4,
    temps: ['hot', 'iced'], sweet: true, defaultSweet: 0, milk: false, layers: [{ c: '#3E2617', w: 6 }, { c: '#7A4A28', w: 1 }] },
  { id: 'drip', name: 'Drip coffee', category: 'coffee', blurb: "Slow pour-over. Today's beans.", price: 70, strength: 3,
    temps: ['hot', 'iced'], sweet: true, defaultSweet: 0, milk: false, layers: [{ c: '#4A2C17', w: 6 }, { c: '#8A5A32', w: 1 }] },
  // ---- With milk ----
  { id: 'latte', name: 'Latte', category: 'milk', blurb: 'Espresso + lots of steamed milk.', price: 70, strength: 2,
    temps: ['hot', 'iced'], sweet: true, defaultSweet: 50, milk: true, layers: [{ c: '#5A3A22', w: 2 }, { c: '#C99A6B', w: 4 }, { c: '#F2E4CF', w: 1 }] },
  { id: 'cappuccino', name: 'Cappuccino', category: 'milk', blurb: 'Espresso, milk and a thick foam hat.', price: 70, strength: 3,
    temps: ['hot', 'iced'], sweet: true, defaultSweet: 50, milk: true, layers: [{ c: '#5A3A22', w: 2 }, { c: '#B98A5E', w: 3 }, { c: '#F4EADB', w: 2 }] },
  { id: 'mocha', name: 'Mocha', category: 'milk', blurb: 'Espresso + chocolate + milk.', price: 75, strength: 2,
    temps: ['hot', 'iced'], sweet: true, defaultSweet: 50, milk: true, layers: [{ c: '#3A2218', w: 2 }, { c: '#7A4B33', w: 4 }, { c: '#E8D2BC', w: 1 }] },
  // ---- Thai classics ----
  { id: 'oliang', name: 'Oliang', category: 'thai', blurb: 'Old-style Thai iced black coffee.', price: 45, strength: 4,
    temps: ['iced'], sweet: true, defaultSweet: 100, milk: false, layers: [{ c: '#2E1B10', w: 7 }] },
  { id: 'thai_coffee', name: 'Thai iced coffee', category: 'thai', blurb: 'Coffee with sweet condensed milk.', price: 50, strength: 3,
    temps: ['iced'], sweet: true, defaultSweet: 100, milk: false, layers: [{ c: '#5A371E', w: 4 }, { c: '#E3C9A3', w: 3 }] },
  // ---- No coffee ----
  { id: 'thai_tea', name: 'Thai milk tea', category: 'nocoffee', blurb: 'Orange Thai tea with sweet milk.', price: 50, strength: 0,
    temps: ['iced'], sweet: true, defaultSweet: 100, milk: false, layers: [{ c: '#D9772E', w: 4 }, { c: '#F0C9A0', w: 2 }] },
  { id: 'cocoa', name: 'Cocoa', category: 'nocoffee', blurb: 'Rich chocolate milk.', price: 60, strength: 0,
    temps: ['hot', 'iced'], sweet: true, defaultSweet: 50, milk: true, layers: [{ c: '#6B3F2A', w: 5 }, { c: '#E9D6C3', w: 1 }] },
];

export const drinkById = (id: string): Drink | undefined => DRINKS.find((d) => d.id === id);

/** One row in the basket. */
export interface OrderLine {
  drinkId: string;
  temp: Temp;
  sweet: Sweet;
  milk: Milk;
  qty: number;
}

/** The choices a fresh "add to basket" sheet starts with. */
export function defaultLine(d: Drink): OrderLine {
  return { drinkId: d.id, temp: d.temps[0], sweet: d.sweet ? d.defaultSweet : 0, milk: 'fresh', qty: 1 };
}

/** Price of ONE cup with these options. */
export function unitPrice(line: OrderLine): number {
  const d = drinkById(line.drinkId);
  if (!d) return 0;
  let p = d.price;
  if (line.temp === 'iced' && d.temps.length > 1) p += ICED_EXTRA; // iced-only drinks already include it
  if (d.milk && line.milk === 'oat') p += OAT_EXTRA;
  return p;
}

export const linePrice = (line: OrderLine) => unitPrice(line) * line.qty;
export const orderTotal = (lines: OrderLine[]) => lines.reduce((s, l) => s + linePrice(l), 0);
export const cupCount = (lines: OrderLine[]) => lines.reduce((s, l) => s + l.qty, 0);

/** "Iced Latte" — the temperature only when the drink comes both ways. */
export function lineName(line: OrderLine): string {
  const d = drinkById(line.drinkId);
  if (!d) return line.drinkId;
  if (d.temps.length < 2) return d.name;
  return `${line.temp === 'iced' ? 'Iced' : 'Hot'} ${d.name}`;
}

export function sweetLabel(s: Sweet): string {
  if (s === 0) return 'No sugar';
  if (s === 100) return 'Full sweet';
  return `${s}% sweet`;
}

/** "Oat milk · 50% sweet" (empty for an espresso). */
export function lineOptions(line: OrderLine): string {
  const d = drinkById(line.drinkId);
  if (!d) return '';
  const parts: string[] = [];
  if (d.milk) parts.push(line.milk === 'oat' ? 'Oat milk' : 'Fresh milk');
  if (d.sweet) parts.push(sweetLabel(line.sweet));
  return parts.join(' · ');
}

/** Same drink + same options = one basket row (its qty grows). */
const sameCup = (a: OrderLine, b: OrderLine) =>
  a.drinkId === b.drinkId && a.temp === b.temp && a.sweet === b.sweet && a.milk === b.milk;

/** Add a line, merging with an identical one. Never goes past MAX_CUPS in total. */
export function addLine(lines: OrderLine[], line: OrderLine): OrderLine[] {
  const room = MAX_CUPS - cupCount(lines);
  const qty = Math.min(line.qty, room);
  if (qty <= 0) return lines;
  const i = lines.findIndex((l) => sameCup(l, line));
  if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
  return [...lines, { ...line, qty }];
}

/** Change one row's quantity; 0 removes it. */
export function setLineQty(lines: OrderLine[], index: number, qty: number): OrderLine[] {
  const others = cupCount(lines) - (lines[index]?.qty ?? 0);
  const q = Math.max(0, Math.min(qty, MAX_CUPS - others));
  if (q === 0) return lines.filter((_, j) => j !== index);
  return lines.map((l, j) => (j === index ? { ...l, qty: q } : l));
}

// ---- the barista's lines -------------------------------------------------------

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'];

/** "One Iced Latte, oat milk, 50% sweet." */
export function readBackLine(line: OrderLine): string {
  const count = COUNT_WORDS[line.qty] ?? String(line.qty);
  const opts = lineOptions(line).toLowerCase().replace(' · ', ', ');
  const name = line.qty > 1 ? `${lineName(line)}s` : lineName(line); // every menu name takes a plain -s
  return `${count} ${name}${opts ? `, ${opts}` : ''}.`;
}
