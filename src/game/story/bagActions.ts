// What you can DO with an item from the Bag. Every change to the carried items goes through here
// (the Bag UI never edits the story save itself), so later steps — a server-checked inventory
// (AI_CONTEXT ID-01) — only have one place to guard.
//
// Only real mechanics are offered:
//   Eat   — items with an `energy` value (eatItem in dalbitPrologue.ts does the work)
//   Check — every item: the facts the game really knows about it (where it lives, best catch,
//           who buys it, what it dries into, whether it is a key item)

import { ITEM_IDS, ITEMS, pocketOf, type Habitat, type ItemDef, type ItemId, type PocketId } from './items';
import { getStory } from './storyStore';
import { eatItem } from './dalbitPrologue';

export type ItemActionId = 'eat' | 'check';

export const ACTION_LABEL: Record<ItemActionId, string> = { eat: 'Eat', check: 'Check' };

/** One line for the description box when the cursor is on an action row. */
export const ACTION_HINT: Record<ItemActionId | 'cancel', string> = {
  eat: 'Eat it now to get energy back.',
  check: 'Look closely at it.',
  cancel: 'Go back to the bag.',
};

const MAX_ENERGY = 10;

/** What is carried in one pocket, in icon-sheet order (the order the Bag lists it). */
export function carriedIn(bag: Partial<Record<ItemId, number>>, pocket: PocketId): ItemId[] {
  return ITEM_IDS.filter((id) => (bag[id] ?? 0) > 0 && pocketOf(id) === pocket);
}

/** The valid actions for this item (Cancel is added by the menu). */
export function itemActionsFor(id: ItemId): ItemActionId[] {
  const actions: ItemActionId[] = [];
  if (ITEMS[id].energy) actions.push('eat');
  actions.push('check');
  return actions;
}

const WHERE: Record<Habitat, string> = {
  near: 'Found near the pier posts.',
  mid: 'Found in open water.',
  far: 'Found in deep water.',
  any: 'Found anywhere.',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The few facts worth reading. Short on purpose: it has to fit the description box. */
export function itemFacts(id: ItemId, bestCm?: number): string {
  const item: ItemDef = ITEMS[id];
  if (item.key) return `${item.name} is a key item. It can't be sold or given away.`;

  const parts: string[] = [];
  if (item.catch) {
    parts.push(item.catch.rarity === 'junk' ? 'Junk.' : `${cap(item.catch.rarity)}.`);
    parts.push(WHERE[item.catch.where]);
    if (bestCm) parts.push(`Best catch: ${bestCm} cm.`);
  }
  if (item.energy) parts.push(`Eating it gives ${item.energy} energy.`);
  const gu = item.sell?.gu;
  const inn = item.sell?.inn;
  if (gu && inn) parts.push(`Gu pays ${gu}c, the inn ${inn}c.`);
  else if (gu) parts.push(`Gu pays ${gu}c.`);
  else if (inn) parts.push(`The inn pays ${inn}c.`);
  if (item.driesTo) parts.push(`Dries into ${ITEMS[item.driesTo].name.toLowerCase()}.`);
  if (!parts.length && item.buy) parts.push(`Costs ${item.buy}c to buy.`);
  return parts.length ? parts.join(' ') : 'Nothing more to learn about it.';
}

/** Do the action to the real game state. Returns the one line the menu shows afterwards. */
export function runItemAction(id: ItemId, action: ItemActionId): string {
  const item = ITEMS[id];
  const name = item.name.toLowerCase();

  if (action === 'eat') {
    const before = getStory().energy;
    if (before >= MAX_ENERGY) return `Your energy is already full. Keep the ${name} for later.`;
    if (!eatItem(id)) return `You can't eat the ${name}.`;
    const gained = getStory().energy - before;
    return `You ate the ${name}. Energy +${gained}.`;
  }

  return itemFacts(id, getStory().records[id]);
}
