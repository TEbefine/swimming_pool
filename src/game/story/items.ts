// THE ITEM CONTRACT — every thing Yunseul can carry, in one table.
// Fishing makes items, the market buys them, the drying rack changes them, NPCs receive them,
// and the battle uses them. All of those systems read from here, so a price or a taste is
// changed in ONE place.
//
// Icons: `icon` = the cell on the 4×4 item sheet (0 = top-left, 3 = top-right, 15 = bottom-right),
// in the same order as the ChatGPT prompt. `scripts/process_items.py` cuts the sheet
// (src/assets/dalbit_items_sheet.webp) into public/sprites/items/<id>.webp — see itemIcon().
// `color` is the fallback swatch if an icon file is missing.

/** Every item id, in the order of the icon sheet. */
export const ITEM_IDS = [
  // row 1 — fresh catch
  'mackerel', 'yellow_croaker', 'anchovy', 'flounder',
  // row 2 — special catch
  'sea_bream', 'eel', 'blue_crab', 'clams',
  // row 3 — dried goods
  'dried_mackerel', 'dried_croaker', 'dried_anchovy', 'kelp',
  // row 4 — everyday things
  'yeot', 'small_net', 'straw_sandal', 'rice_sack',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];

export type ItemKind = 'fish' | 'dried' | 'food' | 'tool' | 'junk' | 'goods';

/** Who buys fish in the Prologue. Gu always buys (cheap); the inn pays more but only a few, before noon. */
export type Buyer = 'gu' | 'inn';

export type GiftTaste = 'love' | 'like' | 'dislike';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'junk';

/** Casting distance zones: near = by the pier posts, mid = open water, far = deep water. 'any' = everywhere. */
export type Habitat = 'near' | 'mid' | 'far' | 'any';

export interface ItemDef {
  name: string;
  /** Short line shown in the bag. */
  note: string;
  kind: ItemKind;
  /** Cell on the 4×4 item icon sheet. */
  icon: number;
  /** Fallback swatch colour if the icon file is missing. */
  color: string;
  /** Coins a buyer pays for one. Missing buyer = they won't take it. */
  sell?: Partial<Record<Buyer, number>>;
  /** Coins to buy one in a shop (rice shop, yeot cart). */
  buy?: number;
  /** One night on the drying rack turns it into this. */
  driesTo?: ItemId;
  /** Eating it outside battle gives energy back (0–10 scale). */
  energy?: number;
  /** Using it in battle heals this much HP. */
  heal?: number;
  /** Can come out of the water. `difficulty` 1–5 = how hard the fishing timing is. */
  catch?: {
    rarity: Rarity;
    difficulty: 1 | 2 | 3 | 4 | 5;
    /** Where it lives, by how far you cast: near the pier posts, the middle, or far deep water. */
    where: Habitat;
    /** Real-life size range in cm (none for junk). */
    size?: [number, number];
  };
  /** How each NPC feels about it as a gift (NPC id → taste). Anyone not listed = neutral. */
  gift?: Partial<Record<string, GiftTaste>>;
  /** Story item: can't be sold, given or thrown away. */
  key?: boolean;
  /** Word before the name in sentences ("a mackerel", "an eel", "some clams"). Default "a". */
  article?: 'a' | 'an' | 'some';
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // ---- row 1: fresh catch ---------------------------------------------------
  mackerel: {
    name: 'Mackerel', kind: 'fish', icon: 0, color: '#5E8A8C',
    note: 'Fresh from the river mouth. Master Gu pays 2 coins.',
    sell: { gu: 2, inn: 4 }, driesTo: 'dried_mackerel',
    catch: { rarity: 'common', difficulty: 2, where: 'mid', size: [25, 45] },
    gift: { father: 'like' },
  },
  yellow_croaker: {
    name: 'Yellow croaker', kind: 'fish', icon: 1, color: '#D9B44A',
    note: 'Golden and proud. Dried, it becomes a gift for important people.',
    sell: { gu: 3, inn: 5 }, driesTo: 'dried_croaker',
    catch: { rarity: 'uncommon', difficulty: 3, where: 'far', size: [20, 40] },
  },
  anchovy: {
    name: 'Anchovies', kind: 'fish', icon: 2, article: 'some', color: '#B8C4C8',
    note: 'A handful of tiny silver fish. Small, but every kitchen needs them.',
    sell: { gu: 1, inn: 2 }, driesTo: 'dried_anchovy',
    catch: { rarity: 'common', difficulty: 1, where: 'any', size: [8, 15] },
  },
  flounder: {
    name: 'Flounder', kind: 'fish', icon: 3, color: '#A88B63',
    note: 'Flat as a sandal, both eyes on one side. It hides in the sand.',
    sell: { gu: 3, inn: 6 },
    catch: { rarity: 'uncommon', difficulty: 3, where: 'mid', size: [25, 60] },
  },

  // ---- row 2: special catch -------------------------------------------------
  sea_bream: {
    name: 'Red sea bream', kind: 'fish', icon: 4, color: '#D46A6A',
    note: 'A fish for celebrations. The inn would pay well... or you could bring it home.',
    sell: { gu: 6, inn: 12 },
    catch: { rarity: 'rare', difficulty: 5, where: 'far', size: [30, 70] },
    gift: { mother: 'love', father: 'love' },
  },
  eel: {
    name: 'Eel', kind: 'fish', icon: 5, article: 'an', color: '#5A4632',
    note: 'Slippery and strong. People say it gives you strength for a hard day.',
    sell: { gu: 4, inn: 8 },
    catch: { rarity: 'uncommon', difficulty: 4, where: 'near', size: [40, 90] },
    gift: { father: 'love' },
  },
  blue_crab: {
    name: 'Blue crab', kind: 'fish', icon: 6, color: '#6E86A6',
    note: 'It pinched you once. You will remember that.',
    sell: { gu: 2, inn: 4 },
    catch: { rarity: 'uncommon', difficulty: 2, where: 'near', size: [10, 20] },
  },
  clams: {
    name: 'Clams', kind: 'fish', icon: 7, article: 'some', color: '#CDB99A',
    note: 'Dug from the wet sand. Good for a clear soup.',
    sell: { gu: 1, inn: 2 },
    catch: { rarity: 'common', difficulty: 1, where: 'near', size: [4, 8] },
    gift: { mother: 'like' },
  },

  // ---- row 3: dried goods ---------------------------------------------------
  dried_mackerel: {
    name: 'Dried mackerel', kind: 'dried', icon: 8, color: '#8C6B4A',
    note: 'A day on the rack. Worth more than fresh.',
    sell: { gu: 4, inn: 6 },
    gift: { father: 'like' },
  },
  dried_croaker: {
    name: 'Dried croakers', kind: 'dried', icon: 9, article: 'some', color: '#B8914A',
    note: 'Tied in a row on straw rope. The kind of gift you bring to someone you respect.',
    sell: { gu: 7, inn: 10 },
    gift: { mother: 'love', father: 'like' },
  },
  dried_anchovy: {
    name: 'Dried anchovies', kind: 'dried', icon: 10, article: 'some', color: '#9EA3A0',
    note: 'Salty and small. Mother makes broth from these.',
    sell: { gu: 2, inn: 4 },
    gift: { mother: 'like' },
  },
  kelp: {
    name: 'Kelp', kind: 'goods', icon: 11, article: 'some', color: '#3F5E3A',
    note: 'Came up tangled in the line. Seaweed soup is for birthdays and new mothers.',
    sell: { gu: 1 },
    catch: { rarity: 'junk', difficulty: 1, where: 'any' },
    gift: { mother: 'like' },
  },

  // ---- row 4: everyday things -----------------------------------------------
  yeot: {
    name: 'Yeot', kind: 'food', icon: 12, color: '#E3B66B',
    note: 'Sticky rice candy. Sticks to your teeth, sticks to your heart.',
    buy: 1, energy: 2, heal: 8,
    gift: { mother: 'like', father: 'like' },
  },
  small_net: {
    name: 'Small net', kind: 'tool', icon: 13, color: '#C9A56B',
    note: 'Father\'s old net. "Big fish are for big hands."',
    key: true,
  },
  straw_sandal: {
    name: 'Old straw sandal', kind: 'junk', icon: 14, article: 'an', color: '#B3A06E',
    note: 'The river gives back what people lose. Nobody wants this one.',
    catch: { rarity: 'junk', difficulty: 1, where: 'any' },
    gift: { mother: 'dislike', father: 'dislike' },
  },
  rice_sack: {
    name: 'Rice sack', kind: 'goods', icon: 15, color: '#E8DDC4',
    note: 'A small sack of rice. It costs more every week.',
    buy: 30,
  },
};

// ---- helpers every system shares --------------------------------------------

/** Price a buyer pays for one, or null if they won't take it. */
export function sellPrice(id: ItemId, buyer: Buyer): number | null {
  const item = ITEMS[id];
  if (item.key) return null;
  return item.sell?.[buyer] ?? null;
}

/** How an NPC feels about this gift. Key items can't be given (returns null). */
export function giftTaste(id: ItemId, npcId: string): GiftTaste | 'neutral' | null {
  const item = ITEMS[id];
  if (item.key) return null;
  return item.gift?.[npcId] ?? 'neutral';
}

/** Everything that can come out of the water with this rarity. */
export function catchPool(rarity: Rarity): ItemId[] {
  return ITEM_IDS.filter((id) => ITEMS[id].catch?.rarity === rarity);
}

/** URL of the item's pixel icon (64×64, shown at 32 px). */
export function itemIcon(id: ItemId): string {
  return `/sprites/items/${id}.webp`;
}

/** "a mackerel", "an eel", "some clams" — for sentences. */
export function withArticle(id: ItemId): string {
  return `${ITEMS[id].article ?? 'a'} ${ITEMS[id].name.toLowerCase()}`;
}

/** True for any id we know (old saves, dev tools). */
export function isItemId(id: string): id is ItemId {
  return (ITEM_IDS as readonly string[]).includes(id);
}
