// THE HARBOUR FISH SHOP — everything the shop sells, in the order of Teera's three icon sheets.
// Icons: src/assets/shop_{sashimi,meals,pantry}_sheet.webp → public/sprites/shop/<id>.webp
// (scripts/process_shop_sheet.py). `cell` = 0 (top-left) … 15 (bottom-right).
//
// Who sells what (Teera may change `vendor`): Minato = sashimi, sushi, meals, drinks ·
// Gen = pantry and supplies (and Gen is the one who BUYS your fish).
// Shop goods can never be sold back to the shop (no buy-low/sell-high loop).

export type ShopSheet = 'sashimi' | 'meals' | 'pantry';
export type ShopCategory = 'sashimi' | 'sushi' | 'meal' | 'snack' | 'drink' | 'ingredient' | 'supply' | 'gift';
export type Vendor = 'minato' | 'gen';
/** What "Use" does. Items without one are for eating/giving later. */
export type ItemUse = 'ice' | 'cooler_upgrade';

export interface ShopItem {
  id: string;
  name: string;
  sheet: ShopSheet;
  cell: number;
  category: ShopCategory;
  vendor: Vendor;
  /** Price in town coins. The cooler upgrade's real price comes from COOLER.upgradePrices. */
  price: number;
  /** One short line for the menu / bag. */
  note: string;
  /** Goes off after this many minutes (eat or give it before then). Missing = keeps. */
  perishMin?: number;
  /** Most one player can buy per Bangkok day. */
  dailyLimit?: number;
  use?: ItemUse;
  /** Not for sale yet (the system that uses it isn't built). Shown as "Coming soon". */
  soon?: boolean;
  /** Sashimi: the catches it can be cut from (the future "slice my fish" service). Saltwater only. */
  fromFish?: string[];
}

/** Freshwater kinds — never eaten raw. Raw freshwater fish (koi pla, pla som) carries the liver fluke
 *  Opisthorchis viverrini, which can lead to bile duct cancer (Ram Hospital, ram-hosp.co.th).
 *  Gen still buys them (for cooking), Minato never makes sashimi from them. */
export const FRESHWATER_FISH: readonly string[] = [
  'tilapia', 'carp', 'catfish', 'snakehead', 'giant_gourami', 'arowana', 'mekong_catfish',
  'climbing_perch', 'swamp_eel', 'betta', 'giant_stingray', 'rainbow_trout', 'river_prawn',
  'paddy_frog', 'axolotl', 'dragon_gate_carp', 'jade_moon_koi', 'rainbow_koi',
];

const SASHIMI_MIN = 60;
const MEAL_MIN = 60;

export const SHOP_ITEMS: ShopItem[] = [
  // ---- sheet 1: sashimi (Minato) ------------------------------------------------------------
  { id: 'sashimi_tai', name: 'Sea bream sashimi', sheet: 'sashimi', cell: 0, category: 'sashimi', vendor: 'minato', price: 90, perishMin: SASHIMI_MIN, fromFish: ['red_snapper'], note: 'Tai: the fish of celebrations. Clean and sweet.' },
  { id: 'sashimi_hirame', name: 'Flounder sashimi', sheet: 'sashimi', cell: 1, category: 'sashimi', vendor: 'minato', price: 90, perishMin: SASHIMI_MIN, note: 'Hirame: thin, clear slices. The frilly fin edge is the best part.' },
  { id: 'sashimi_grouper', name: 'Grouper sashimi', sheet: 'sashimi', cell: 2, category: 'sashimi', vendor: 'minato', price: 110, perishMin: SASHIMI_MIN, fromFish: ['grouper'], note: 'Thick and white, almost crunchy.' },
  { id: 'sashimi_ika', name: 'Squid sashimi', sheet: 'sashimi', cell: 3, category: 'sashimi', vendor: 'minato', price: 70, perishMin: SASHIMI_MIN, fromFish: ['night_squid'], note: 'Ika: cut into thin noodles so it is soft, not chewy.' },
  { id: 'sashimi_akami', name: 'Lean tuna sashimi', sheet: 'sashimi', cell: 4, category: 'sashimi', vendor: 'minato', price: 120, perishMin: SASHIMI_MIN, fromFish: ['bluefin_tuna'], note: 'Akami: the deep red back meat. Pure tuna taste.' },
  { id: 'sashimi_otoro', name: 'Fatty tuna sashimi', sheet: 'sashimi', cell: 5, category: 'sashimi', vendor: 'minato', price: 320, perishMin: SASHIMI_MIN, dailyLimit: 2, fromFish: ['bluefin_tuna'], note: 'Otoro: the belly. Only a small part of each tuna, so it costs the most.' },
  { id: 'sashimi_hamachi', name: 'Yellowtail sashimi', sheet: 'sashimi', cell: 6, category: 'sashimi', vendor: 'minato', price: 140, perishMin: SASHIMI_MIN, fromFish: ['yellowtail'], note: 'Hamachi: rich and buttery, best in the cool season.' },
  { id: 'sashimi_saba', name: 'Mackerel sashimi', sheet: 'sashimi', cell: 7, category: 'sashimi', vendor: 'minato', price: 60, perishMin: SASHIMI_MIN, fromFish: ['pla_thu', 'saury'], note: 'Saba: cured in salt and vinegar first, the old way.' },
  { id: 'sashimi_amaebi', name: 'Sweet shrimp sashimi', sheet: 'sashimi', cell: 8, category: 'sashimi', vendor: 'minato', price: 100, perishMin: SASHIMI_MIN, note: 'Ama-ebi: soft and sweet. From the boats, not the bay.' },
  { id: 'sashimi_hotate', name: 'Scallop sashimi', sheet: 'sashimi', cell: 9, category: 'sashimi', vendor: 'minato', price: 110, perishMin: SASHIMI_MIN, note: 'Hotate: creamy and gentle.' },
  { id: 'sashimi_uni', name: 'Sea urchin', sheet: 'sashimi', cell: 10, category: 'sashimi', vendor: 'minato', price: 260, perishMin: SASHIMI_MIN, dailyLimit: 2, note: 'Uni: tastes like the sea itself. Not everyone loves it.' },
  { id: 'sashimi_ikura', name: 'Salmon roe', sheet: 'sashimi', cell: 11, category: 'sashimi', vendor: 'minato', price: 180, perishMin: SASHIMI_MIN, note: 'Ikura: little pearls that pop.' },
  { id: 'sashimi_tako', name: 'Octopus sashimi', sheet: 'sashimi', cell: 12, category: 'sashimi', vendor: 'minato', price: 80, perishMin: SASHIMI_MIN, note: 'Tako: boiled first, then sliced. Chewy and mild.' },
  { id: 'sashimi_mixed', name: 'Mixed sashimi plate', sheet: 'sashimi', cell: 13, category: 'sashimi', vendor: 'minato', price: 150, perishMin: SASHIMI_MIN, note: 'Tuna, sea bream and sweet shrimp. A little of everything.' },
  { id: 'sashimi_boat', name: 'Sashimi boat', sheet: 'sashimi', cell: 14, category: 'sashimi', vendor: 'minato', price: 900, perishMin: SASHIMI_MIN, dailyLimit: 1, note: 'Funamori: a whole boat of it, for sharing.' },
  { id: 'chef_special', name: "Chef's special", sheet: 'sashimi', cell: 15, category: 'sashimi', vendor: 'minato', price: 2400, perishMin: SASHIMI_MIN, dailyLimit: 1, note: 'Minato picks the five best things of the day. One a day.' },

  // ---- sheet 2: ready meals & drinks (Minato) -----------------------------------------------
  { id: 'nigiri_tuna', name: 'Tuna nigiri', sheet: 'meals', cell: 0, category: 'sushi', vendor: 'minato', price: 60, perishMin: MEAL_MIN, note: 'Two pieces. Eat in one bite, fish side down.' },
  { id: 'nigiri_shrimp', name: 'Shrimp nigiri', sheet: 'meals', cell: 1, category: 'sushi', vendor: 'minato', price: 55, perishMin: MEAL_MIN, note: 'Cooked shrimp, so it is fine for everyone.' },
  { id: 'maki_roll', name: 'Sushi roll', sheet: 'meals', cell: 2, category: 'sushi', vendor: 'minato', price: 50, perishMin: MEAL_MIN, note: 'Tuna and cucumber, rolled in nori.' },
  { id: 'kaisen_don', name: 'Seafood rice bowl', sheet: 'meals', cell: 3, category: 'meal', vendor: 'minato', price: 180, perishMin: MEAL_MIN, note: 'Kaisen-don: the whole sea on a bowl of rice.' },
  { id: 'tuna_don', name: 'Tuna rice bowl', sheet: 'meals', cell: 4, category: 'meal', vendor: 'minato', price: 140, perishMin: MEAL_MIN, note: 'Tuna cubes and an egg yolk. Mix it all.' },
  { id: 'miso_soup', name: 'Miso soup', sheet: 'meals', cell: 5, category: 'meal', vendor: 'minato', price: 30, perishMin: MEAL_MIN, note: 'Warm, salty, simple. Made with fish stock.' },
  { id: 'onigiri', name: 'Rice balls', sheet: 'meals', cell: 6, category: 'snack', vendor: 'minato', price: 25, perishMin: 240, note: 'Onigiri: the fisherman\'s lunch.' },
  { id: 'shioyaki', name: 'Salt-grilled fish', sheet: 'meals', cell: 7, category: 'meal', vendor: 'minato', price: 90, perishMin: MEAL_MIN, note: 'Shioyaki: just salt and fire. Good fish needs nothing else.' },
  { id: 'himono', name: 'Dried fish', sheet: 'meals', cell: 8, category: 'snack', vendor: 'minato', price: 70, note: 'Himono: split, salted and dried in the sea wind. Keeps for days.' },
  { id: 'kamaboko', name: 'Fish cake', sheet: 'meals', cell: 9, category: 'snack', vendor: 'minato', price: 40, perishMin: 240, note: 'Kamaboko: white fish pounded smooth, pink on the outside.' },
  { id: 'tempura_shrimp', name: 'Shrimp tempura', sheet: 'meals', cell: 10, category: 'meal', vendor: 'minato', price: 80, perishMin: MEAL_MIN, note: 'Light, crispy batter. Eat it hot.' },
  { id: 'ika_yaki', name: 'Grilled squid', sheet: 'meals', cell: 11, category: 'snack', vendor: 'minato', price: 50, perishMin: MEAL_MIN, note: 'Ika-yaki: the smell of every Japanese harbour festival.' },
  { id: 'tamagoyaki', name: 'Rolled omelette', sheet: 'meals', cell: 12, category: 'snack', vendor: 'minato', price: 35, perishMin: MEAL_MIN, note: 'Tamagoyaki: thin layers of sweet egg, rolled one by one.' },
  { id: 'green_tea', name: 'Green tea', sheet: 'meals', cell: 13, category: 'drink', vendor: 'minato', price: 20, perishMin: MEAL_MIN, note: 'Free refills, if Minato likes you.' },
  { id: 'ramune', name: 'Ramune', sheet: 'meals', cell: 14, category: 'drink', vendor: 'minato', price: 30, note: 'Push the marble in to open it. Pop!' },
  { id: 'barley_tea', name: 'Barley tea', sheet: 'meals', cell: 15, category: 'drink', vendor: 'minato', price: 20, perishMin: MEAL_MIN, note: 'Mugicha: roasted barley, no caffeine. Japan\'s summer drink.' },

  // ---- sheet 3: pantry & supplies (Gen) -------------------------------------------------------
  { id: 'nori', name: 'Nori', sheet: 'pantry', cell: 0, category: 'ingredient', vendor: 'gen', price: 30, note: 'Dried seaweed sheets for rolling sushi.' },
  { id: 'wasabi_root', name: 'Wasabi root', sheet: 'pantry', cell: 1, category: 'ingredient', vendor: 'gen', price: 60, note: 'Real wasabi. Most "wasabi" in the world is horseradish.' },
  { id: 'soy_sauce', name: 'Soy sauce', sheet: 'pantry', cell: 2, category: 'ingredient', vendor: 'gen', price: 25, note: 'A little, on the fish side. Never drown the rice.' },
  { id: 'sushi_rice', name: 'Sushi rice', sheet: 'pantry', cell: 3, category: 'ingredient', vendor: 'gen', price: 40, note: 'Short, sticky grains.' },
  { id: 'daikon', name: 'Daikon radish', sheet: 'pantry', cell: 4, category: 'ingredient', vendor: 'gen', price: 20, note: 'Shredded under sashimi to keep it cool and crisp.' },
  { id: 'shiso', name: 'Shiso leaves', sheet: 'pantry', cell: 5, category: 'ingredient', vendor: 'gen', price: 15, note: 'The green leaf on every sashimi plate. Minty and bright.' },
  { id: 'yuzu', name: 'Yuzu', sheet: 'pantry', cell: 6, category: 'ingredient', vendor: 'gen', price: 35, note: 'A Japanese citrus: lemon, lime and mandarin at once.' },
  { id: 'katsuobushi', name: 'Dried bonito', sheet: 'pantry', cell: 7, category: 'ingredient', vendor: 'gen', price: 70, note: 'Katsuobushi: one of the hardest foods in the world. Shaved into flakes.' },
  { id: 'kombu', name: 'Kombu', sheet: 'pantry', cell: 8, category: 'ingredient', vendor: 'gen', price: 45, note: 'Dried kelp for soup stock. The secret of umami.' },
  { id: 'sea_salt', name: 'Sea salt', sheet: 'pantry', cell: 9, category: 'ingredient', vendor: 'gen', price: 20, note: 'Dried from this bay\'s own water.' },
  { id: 'ice_block', name: 'Block of ice', sheet: 'pantry', cell: 10, category: 'supply', vendor: 'gen', price: 15, use: 'ice', note: 'Put it in your cooler: every fish stays fresh 15 minutes longer.' },
  { id: 'cooler_box', name: 'Bigger cooler box', sheet: 'pantry', cell: 11, category: 'supply', vendor: 'gen', price: 400, use: 'cooler_upgrade', note: 'Carry 5 more fish. Gen has two sizes.' },
  { id: 'fish_crate', name: 'Fish crate', sheet: 'pantry', cell: 12, category: 'supply', vendor: 'gen', price: 30, soon: true, note: 'For your room, one day.' },
  { id: 'chef_knife', name: "Chef's knife", sheet: 'pantry', cell: 13, category: 'supply', vendor: 'gen', price: 1200, soon: true, note: 'Yanagiba: one long pull per slice, never saw back and forth.' },
  { id: 'whetstone', name: 'Whetstone', sheet: 'pantry', cell: 14, category: 'supply', vendor: 'gen', price: 300, soon: true, note: 'Soak it in water first. A sharp knife is a safe knife.' },
  { id: 'gift_box', name: 'Gift wrap', sheet: 'pantry', cell: 15, category: 'gift', vendor: 'gen', price: 50, note: 'Furoshiki: wrap a present in cloth, the Japanese way.' },
];

export const SHOP_BY_ID: Record<string, ShopItem> = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));

export function shopIcon(id: string): string {
  return `/sprites/shop/${id}.webp`;
}

/** What one vendor sells (for sale now, in sheet order). */
export function stockOf(vendor: Vendor): ShopItem[] {
  return SHOP_ITEMS.filter((i) => i.vendor === vendor);
}
