// What Gen and Minato say at the Harbour Fish Shop (ECO-01 step 2–4). Built fresh every time you talk,
// so the lines can use today's market (Gen's wanted fish, Minato's special) and your cooler.
// The counter screen (components/shop/ShopCounter.tsx) opens when the 'sell' / 'supplies' / 'menu'
// node's line closes (App.tsx, search "Fish shop counter").
//
// Gen = 74, the founder: buys your fish, strict about freshness, few words, warm underneath.
// Minato = 23, his grandson, a former idol: cool, a little playful, serious about knives and fish.

import type { DialogChoice, DialogScript } from '../content/dialogues';
import { npcName } from '../content/npcNames';
import { FREE_BY_ID } from '../fishing/freeFishCatalog';
import { itemPrice, marketOf } from './market';
import { SHOP_BY_ID } from './shopCatalog';
import type { Vendor } from './shopCatalog';
import { formatMoney, getWallet, refreshWallet } from './walletStore';
import { COOLER } from './economyConfig';

/** Which counter screen a dialogue node opens when its line closes. */
export type ShopTab = 'sell' | 'supplies' | 'sashimi' | 'meals' | 'bag';
export const SHOP_NODE_OPENS: Record<string, Record<string, ShopTab>> = {
  gen: { sell: 'sell', supplies: 'supplies' },
  minato: { menu: 'sashimi' },
};
export const SHOP_NPCS = new Set(['gen', 'minato']);

const ACCENT = '#2D458B'; // aizome indigo, the shop's colour
const fishName = (id: string) => FREE_BY_ID[id]?.name ?? id;
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const GEN_MENU: DialogChoice[] = [
  { label: 'Sell my fish', next: 'sell' },
  { label: 'Buy supplies', next: 'supplies' },
  { label: 'What do you want today?', next: 'wanted' },
  { label: 'How do you price fish?', next: 'price' },
  { label: 'Bye', next: 'bye' },
];

const MINATO_MENU: DialogChoice[] = [
  { label: 'See the menu', next: 'menu' },
  { label: "Today's special", next: 'special' },
  { label: 'Sashimi from river fish?', next: 'river' },
  { label: 'About you', next: 'about' },
  { label: 'Bye', next: 'bye' },
];

export function genScript(): DialogScript {
  const now = Date.now();
  const w = refreshWallet();
  const market = marketOf(now);
  const wanted = andList(market.wanted.map(fishName));
  const n = w.cooler.length;
  const cap = COOLER.baseSlots + COOLER.upgradeSlots * w.coolerLevel;
  return {
    name: npcName('gen'),
    accent: ACCENT,
    closePose: 'bow',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: '{greeting}. Gen. This is my shop.', pose: 'wave' },
          n
            ? { text: `${n} fish in your cooler. Show me while they're fresh.`, pose: 'talk' }
            : { text: 'Empty cooler? The bay is right there. Go on.', pose: 'thinking' },
        ],
        choices: GEN_MENU,
      },
      // App opens the counter on the "sell" screen when this line closes.
      sell: { lines: [{ text: n ? "Show me. I'll tell you what each one is worth." : 'Nothing to sell. Still, have a look.', pose: 'hold_fish' }] },
      supplies: { lines: [{ text: 'Ice, rice, salt... the things a kitchen runs on.', pose: 'talk' }] },
      wanted: {
        lines: [
          { text: `Today I pay half again for ${wanted}.`, pose: 'talk' },
          { text: 'Same for everyone in town. Tomorrow, something else.', pose: 'thinking' },
          { text: 'Many of one kind? The price drops. I can only sell so many.', pose: 'proud' },
        ],
        choices: GEN_MENU,
      },
      price: {
        lines: [
          { text: 'Four things. What kind it is. How big it is.', pose: 'talk' },
          { text: 'How fresh it is. And what the town wants today.', pose: 'thinking' },
          { text: 'Fresh for ten minutes. Tired by twenty. At thirty, gone.', pose: 'hold_fish' },
          { text: `Your cooler holds ${cap}. Ice buys you time. Remember that.`, pose: 'proud' },
        ],
        choices: GEN_MENU,
      },
      bye: { lines: [{ text: 'Mm. Mind the edge of the pier.', pose: 'bow' }] },
    },
  };
}

export function minatoScript(): DialogScript {
  const now = Date.now();
  const w = refreshWallet();
  const market = marketOf(now);
  const sp = market.special ? SHOP_BY_ID[market.special] : null;
  const spPrice = sp ? itemPrice(sp.id, market, w.coolerLevel, COOLER.upgradePrices) : null;
  return {
    name: npcName('minato'),
    accent: ACCENT,
    closePose: 'bow',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "{greeting}! Welcome. I'm Minato, the chef.", pose: 'wave' },
          { text: `You have ${formatMoney(getWallet().coins)}. Hungry?`, pose: 'talk' },
        ],
        choices: MINATO_MENU,
      },
      // App opens the counter on the sashimi screen when this line closes.
      menu: { lines: [{ text: 'Here. Everything was cut this morning.', pose: 'serve' }] },
      special: {
        lines: sp
          ? [
            { text: `Today's special: ${sp.name}.`, pose: 'serve' },
            { text: `Only ${spPrice ?? sp.price}, not ${sp.price}. 20% off.`, pose: 'talk' },
            { text: "Grandpa picks it. Secretly, it's my favourite too.", pose: 'peace' },
          ]
          : [{ text: 'No special today. The sea was quiet.', pose: 'thinking' }],
        choices: MINATO_MENU,
      },
      river: {
        lines: [
          { text: 'Never. River fish, I only cook.', pose: 'arms_crossed' },
          { text: 'Raw river fish can carry a liver fluke, a tiny parasite.', pose: 'talk' },
          { text: 'Koi pla uses it raw. It can hurt your liver for years.', pose: 'thinking' },
          { text: "Sea fish, very fresh, cut clean. That's my only sashimi.", pose: 'serve' },
        ],
        choices: MINATO_MENU,
      },
      about: {
        lines: [
          { text: 'Three years on a stage. Lights, cameras, everything.', pose: 'peace' },
          { text: 'Then Grandpa hurt his back. Somebody had to hold the knife.', pose: 'headband' },
          { text: 'Turns out the knife is louder than any crowd.', pose: 'arms_crossed' },
        ],
        choices: MINATO_MENU,
      },
      bye: { lines: [{ text: 'See you. Come back hungry.', pose: 'bow' }] },
    },
  };
}

/** What the counter screen reports when it closes. */
export interface ShopVisit {
  vendor: Vendor;
  soldFish: number;
  earned: number;
  boughtItems: number;
  spent: number;
}

/** The NPC's line after you close the counter screen. */
export function shopAfter(v: ShopVisit): DialogScript {
  const base = v.vendor === 'gen' ? genScript() : minatoScript();
  let lines;
  if (v.vendor === 'gen') {
    if (v.soldFish && v.boughtItems) lines = [{ text: `${v.soldFish} fish, ${formatMoney(v.earned)}. You shopped too. Good.`, pose: 'thumbsup' }];
    else if (v.soldFish) lines = [{ text: `${v.soldFish} fish. ${formatMoney(v.earned)}. Fair and fresh.`, pose: 'thumbsup' }, { text: 'Come back before the ice melts.', pose: 'proud' }];
    else if (v.boughtItems) lines = [{ text: 'Use them well.', pose: 'proud' }];
    else lines = [{ text: 'Mm. Another time.', pose: 'idle' }];
  } else if (v.boughtItems) {
    lines = [{ text: 'Thank you! Eat it soon. Sashimi waits for nobody.', pose: 'happy' }, { text: 'Itadakimasu.', pose: 'bow' }];
  } else {
    lines = [{ text: 'Just looking? Fine. Come back hungry.', pose: 'peace' }];
  }
  return { ...base, start: 'after', nodes: { after: { lines } } };
}
