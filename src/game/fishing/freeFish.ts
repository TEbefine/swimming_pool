// FREE FISHING — just for fun with friends, separate from the story (no energy, no story save).
// 64 kinds (4 sheets of 16) in 5 tiers: Common → Rare → Epic → Legend → God.
//   A real fish · B myth, history & treasure · C season fish · D other water animals
// Icons: 4×4 ChatGPT sheets cut by scripts/process_fish_sheet.py into public/sprites/fish/<id>.webp
// (order = the order below). A sheet only joins the game once its art is cut: see READY_SHEETS.

import { useSyncExternalStore } from 'react';
import type { FishTable, Species } from '../story/fishing';

export type FreeTier = 'common' | 'rare' | 'epic' | 'legend' | 'god';

export const TIERS: Record<FreeTier, { label: string; color: string; weight: number; nice: number; weak: number; announce: boolean }> = {
  common: { label: 'Common', color: '#9AA3A8', weight: 60, nice: 0.8, weak: 1.3, announce: false },
  rare: { label: 'Rare', color: '#4F8FD8', weight: 26, nice: 1.2, weak: 0.7, announce: false },
  epic: { label: 'Epic', color: '#9B5DE5', weight: 10, nice: 1.5, weak: 0.4, announce: true },
  legend: { label: 'Legend', color: '#E0A526', weight: 3.5, nice: 1.8, weak: 0.2, announce: true },
  god: { label: 'God', color: '#FF6FB5', weight: 0.3, nice: 2.0, weak: 0.05, announce: true },
};

export type Sheet = 'a' | 'b' | 'c' | 'd';
/** Thailand's three seasons (Thai Meteorological Department, approximate):
 *  hot mid-Feb → mid-May · rainy mid-May → mid-Oct · cool mid-Oct → mid-Feb. */
export type Season = 'hot' | 'rainy' | 'cool';

export interface FreeFish extends Species {
  tier: FreeTier;
  name: string;
  /** One line shown on the catch card and in the Fish Book. */
  note: string;
  /** Which icon sheet + cell (0–15). */
  sheet: Sheet;
  cell: number;
  /** Only bites in this Thai season (Bangkok date). */
  season?: Season;
  /** A protected animal: logged in the Fish Book, then let go gently. */
  release?: boolean;
}

/** Sheets whose art has been cut into icons. Add 'c' / 'd' here after running process_fish_sheet.py. */
export const READY_SHEETS: Sheet[] = ['a', 'b'];

export const SEASONS: Record<Season, { label: string; color: string; months: string }> = {
  hot: { label: 'Hot season', color: '#E8743B', months: 'mid-Feb – mid-May' },
  rainy: { label: 'Rainy season', color: '#3E8FC4', months: 'mid-May – mid-Oct' },
  cool: { label: 'Cool season', color: '#7FB7C9', months: 'mid-Oct – mid-Feb' },
};

/** Every kind, planned or ready. Order = sheet, then the ChatGPT prompt order. */
export const ALL_FREE_FISH: FreeFish[] = [
  // ---- sheet A: real fish -------------------------------------------------------------
  { id: 'sardine', name: 'Sardine', tier: 'common', where: 'any', size: [12, 22], difficulty: 1, sheet: 'a', cell: 0, note: 'Small, silver, and never alone.' },
  { id: 'tilapia', name: 'Tilapia', tier: 'common', where: 'near', size: [15, 35], difficulty: 1, sheet: 'a', cell: 1, note: 'The fish every market in the world knows.' },
  { id: 'carp', name: 'Carp', tier: 'common', where: 'mid', size: [30, 70], difficulty: 2, sheet: 'a', cell: 2, note: 'Patient, clever, and heavier than it looks.' },
  { id: 'catfish', name: 'Catfish', tier: 'common', where: 'near', size: [30, 80], difficulty: 2, sheet: 'a', cell: 3, note: 'Whiskers first. Always whiskers first.' },
  { id: 'snakehead', name: 'Snakehead', tier: 'rare', where: 'near', size: [30, 90], difficulty: 3, sheet: 'a', cell: 4, note: 'Pla chon. It can breathe air and it is not happy to see you.' },
  { id: 'pomfret', name: 'Silver Pomfret', tier: 'common', where: 'mid', size: [15, 30], difficulty: 2, sheet: 'a', cell: 5, note: 'Flat as a plate, shiny as a coin.' },
  { id: 'barramundi', name: 'Barramundi', tier: 'rare', where: 'mid', size: [40, 120], difficulty: 3, sheet: 'a', cell: 6, note: 'Pla kapong. Starts life as a boy, becomes a girl later. Really.' },
  { id: 'red_snapper', name: 'Red Snapper', tier: 'rare', where: 'far', size: [30, 80], difficulty: 3, sheet: 'a', cell: 7, note: 'Bright red, even in deep water where red is invisible.' },
  { id: 'grouper', name: 'Grouper', tier: 'rare', where: 'far', size: [40, 150], difficulty: 4, sheet: 'a', cell: 8, note: 'A big mouth with a big fish attached.' },
  { id: 'pufferfish', name: 'Pufferfish', tier: 'rare', where: 'near', size: [10, 30], difficulty: 2, sheet: 'a', cell: 9, note: 'Please do not eat this one raw.' },
  { id: 'giant_gourami', name: 'Giant Gourami', tier: 'rare', where: 'mid', size: [30, 70], difficulty: 3, sheet: 'a', cell: 10, note: 'Pla raet. Builds a nest and guards it like a parent.' },
  { id: 'bluefin_tuna', name: 'Bluefin Tuna', tier: 'epic', where: 'far', size: [100, 300], difficulty: 5, sheet: 'a', cell: 11, note: 'Warm-blooded and faster than a car on the highway.' },
  { id: 'arowana', name: 'Asian Arowana', tier: 'epic', where: 'mid', size: [50, 90], difficulty: 4, sheet: 'a', cell: 12, note: 'The "dragon fish". People say it brings good luck.' },
  { id: 'mekong_catfish', name: 'Mekong Giant Catfish', tier: 'epic', where: 'far', size: [150, 300], difficulty: 5, sheet: 'a', cell: 13, note: 'One of the biggest river fish on Earth. Handle with respect.' },
  { id: 'oarfish', name: 'Oarfish', tier: 'epic', where: 'far', size: [300, 800], difficulty: 4, sheet: 'a', cell: 14, note: 'The "king of herrings" — the longest bony fish in the sea.' },
  { id: 'coelacanth', name: 'Coelacanth', tier: 'legend', where: 'far', size: [100, 200], difficulty: 5, sheet: 'a', cell: 15, note: 'Thought extinct for 66 million years, until 1938.' },

  // ---- sheet B: myth, history & treasure ----------------------------------------------------
  { id: 'armorfish', name: 'Ancient Armorfish', tier: 'legend', where: 'far', size: [300, 600], difficulty: 5, sheet: 'b', cell: 0, note: 'A plated giant from 360 million years ago. Its bite could crack shells.' },
  { id: 'megalodon_pup', name: 'Megalodon Pup', tier: 'legend', where: 'far', size: [200, 400], difficulty: 5, sheet: 'b', cell: 1, note: 'Just a baby. Its mother is not in this lake. Probably.' },
  { id: 'ammonite', name: 'Ammonite', tier: 'epic', where: 'near', size: [5, 30], difficulty: 2, sheet: 'b', cell: 2, note: 'A spiral shell from the age of dinosaurs, still swimming.' },
  { id: 'fossil_fish', name: 'Fossil Fish Stone', tier: 'rare', where: 'near', difficulty: 1, sheet: 'b', cell: 3, note: 'A fish that swam here long before anyone had a name.' },
  { id: 'dragon_gate_carp', name: 'Dragon Gate Carp', tier: 'legend', where: 'mid', size: [60, 120], difficulty: 5, sheet: 'b', cell: 4, note: 'The old tale: the carp that leaps the waterfall gate becomes a dragon.' },
  { id: 'jade_moon_koi', name: 'Jade Moon Koi', tier: 'legend', where: 'mid', size: [50, 100], difficulty: 4, time: 'night', sheet: 'b', cell: 5, note: 'Only rises when the moon is up. Its scales are cool as jade.' },
  { id: 'lantern_fish', name: 'Krathong Lantern Fish', tier: 'epic', where: 'near', size: [15, 30], difficulty: 3, time: 'night', sheet: 'b', cell: 6, note: 'Glows like a little floating lantern on a festival night.' },
  { id: 'abyss_angler', name: 'Abyss Angler', tier: 'epic', where: 'far', size: [20, 60], difficulty: 4, sheet: 'b', cell: 7, note: 'Carries its own lamp into the dark.' },
  { id: 'ghost_pirate_fish', name: 'Ghost Pirate Fish', tier: 'legend', where: 'far', size: [40, 90], difficulty: 4, time: 'night', sheet: 'b', cell: 8, note: 'Wears a tiny tricorn. Nobody knows who gave it one.' },
  { id: 'pearl_oyster', name: 'Pearl Oyster', tier: 'epic', where: 'near', size: [10, 20], difficulty: 2, sheet: 'b', cell: 9, note: 'Something round and bright is hiding inside.' },
  { id: 'baby_kraken', name: 'Baby Kraken', tier: 'legend', where: 'far', size: [80, 200], difficulty: 5, sheet: 'b', cell: 10, note: 'The sailors’ legend, only much smaller and a bit shy.' },
  { id: 'star_swallower', name: 'Star Swallower', tier: 'legend', where: 'far', size: [30, 70], difficulty: 5, time: 'night', sheet: 'b', cell: 11, note: 'Its belly holds a tiny night sky.' },
  { id: 'sun_carp', name: 'Sun Carp', tier: 'god', where: 'far', size: [100, 180], difficulty: 5, time: 'day', sheet: 'b', cell: 12, note: 'Warm to the touch. The water shines where it swam.' },
  { id: 'moon_whale', name: 'Moon Whale Calf', tier: 'god', where: 'far', size: [400, 700], difficulty: 5, time: 'night', sheet: 'b', cell: 13, note: 'It sings once, softly, and the whole lake goes still.' },
  { id: 'bottle_message', name: 'Message in a Bottle', tier: 'common', where: 'any', difficulty: 1, sheet: 'b', cell: 14, note: 'A note from someone far away.' },
  { id: 'treasure_chest', name: 'Sunken Treasure Chest', tier: 'legend', where: 'any', difficulty: 4, sheet: 'b', cell: 15, note: 'Heavy, old, and definitely not empty.' },

  // ---- sheet C: season fish (Thai seasons, Bangkok date) -------------------------------------
  // hot season
  { id: 'mango_threadfin', name: 'Mango Threadfin', tier: 'common', where: 'near', size: [15, 25], difficulty: 1, season: 'hot', sheet: 'c', cell: 0, note: 'Golden as a ripe mango, with long whisker threads to feel the sand.' },
  { id: 'flying_fish', name: 'Flying Fish', tier: 'common', where: 'far', size: [20, 35], difficulty: 2, season: 'hot', sheet: 'c', cell: 1, note: 'Glides over the waves on wing-fins when something chases it.' },
  { id: 'mahi_mahi', name: 'Mahi-mahi', tier: 'rare', where: 'far', size: [60, 150], difficulty: 4, season: 'hot', sheet: 'c', cell: 2, note: 'Green and gold in the water; the colours fade fast in the air.' },
  { id: 'sailfish', name: 'Sailfish', tier: 'epic', where: 'far', size: [150, 300], difficulty: 5, season: 'hot', sheet: 'c', cell: 3, note: 'Raises a sail on its back and slices through the sea like a spear.' },
  { id: 'mirage_fish', name: 'Mirage Fish', tier: 'legend', where: 'mid', size: [30, 60], difficulty: 4, time: 'day', season: 'hot', sheet: 'c', cell: 4, note: 'Made of heat haze. Blink, and it might not be there.' },
  // rainy season
  { id: 'climbing_perch', name: 'Climbing Perch', tier: 'common', where: 'near', size: [10, 25], difficulty: 1, season: 'rainy', sheet: 'c', cell: 5, note: 'Pla mo. After heavy rain it wriggles across wet ground to find new ponds.' },
  { id: 'swamp_eel', name: 'Swamp Eel', tier: 'common', where: 'near', size: [30, 90], difficulty: 2, season: 'rainy', sheet: 'c', cell: 6, note: 'Pla lai na. Slippery. Very, very slippery.' },
  { id: 'betta', name: 'Siamese Fighting Fish', tier: 'rare', where: 'near', size: [5, 8], difficulty: 3, season: 'rainy', sheet: 'c', cell: 7, note: 'Pla kat, Thailand\u2019s national aquatic animal. Small fish, huge fins, bigger attitude.' },
  { id: 'giant_stingray', name: 'Giant Freshwater Stingray', tier: 'epic', where: 'far', size: [150, 400], difficulty: 5, season: 'rainy', sheet: 'c', cell: 8, release: true, note: 'A river giant, wide as a table. Measured, thanked, and let go.' },
  { id: 'rain_naga', name: 'Rain Naga', tier: 'legend', where: 'far', size: [200, 500], difficulty: 5, time: 'night', season: 'rainy', sheet: 'c', cell: 9, note: 'A little serpent of the old river tales, said to bring the rain.' },
  { id: 'rainbow_koi', name: 'Rainbow Koi', tier: 'god', where: 'mid', size: [60, 120], difficulty: 5, time: 'day', season: 'rainy', sheet: 'c', cell: 10, note: 'Appears when the sun comes out after rain. The colours are real.' },
  // cool season
  { id: 'pla_thu', name: 'Pla Thu Mackerel', tier: 'common', where: 'mid', size: [15, 22], difficulty: 1, season: 'cool', sheet: 'c', cell: 11, note: 'The little mackerel on every Thai table, with nam prik and rice.' },
  { id: 'saury', name: 'Pacific Saury', tier: 'common', where: 'far', size: [25, 35], difficulty: 2, season: 'cool', sheet: 'c', cell: 12, note: 'A slim blade of a fish, best grilled when the air turns cool.' },
  { id: 'rainbow_trout', name: 'Rainbow Trout', tier: 'rare', where: 'mid', size: [30, 70], difficulty: 3, season: 'cool', sheet: 'c', cell: 13, note: 'Likes its water cold and its colours pink.' },
  { id: 'yellowtail', name: 'Yellowtail', tier: 'epic', where: 'far', size: [60, 120], difficulty: 5, season: 'cool', sheet: 'c', cell: 14, note: 'A strong winter swimmer with a bright yellow stripe.' },
  { id: 'snowflake_fish', name: 'Snowflake Fish', tier: 'legend', where: 'mid', size: [20, 45], difficulty: 4, time: 'night', season: 'cool', sheet: 'c', cell: 15, note: 'No two have the same pattern. It melts into the dark if you look away.' },

  // ---- sheet D: water friends (other animals) --------------------------------------------
  { id: 'hermit_crab', name: 'Hermit Crab', tier: 'common', where: 'near', size: [3, 10], difficulty: 1, sheet: 'd', cell: 0, note: 'Borrowed its house. Will move again when it grows.' },
  { id: 'blue_crab', name: 'Blue Swimmer Crab', tier: 'common', where: 'near', size: [10, 20], difficulty: 2, sheet: 'd', cell: 1, note: 'Pu ma. Paddle legs, blue claws, and a bad temper.' },
  { id: 'river_prawn', name: 'Giant River Prawn', tier: 'rare', where: 'mid', size: [15, 30], difficulty: 3, sheet: 'd', cell: 2, note: 'Kung mae nam. Those long blue claws are mostly for show.' },
  { id: 'mantis_shrimp', name: 'Mantis Shrimp', tier: 'rare', where: 'near', size: [8, 18], difficulty: 3, sheet: 'd', cell: 3, note: 'Punches faster than you can blink. Admire from a distance.' },
  { id: 'moon_jelly', name: 'Moon Jellyfish', tier: 'common', where: 'mid', size: [10, 30], difficulty: 1, sheet: 'd', cell: 4, note: 'Drifts wherever the water goes. Seems at peace with that.' },
  { id: 'seahorse', name: 'Seahorse', tier: 'rare', where: 'near', size: [5, 20], difficulty: 2, sheet: 'd', cell: 5, release: true, note: 'The dads carry the babies. This one was let go to get back to work.' },
  { id: 'starfish', name: 'Starfish', tier: 'common', where: 'near', size: [8, 25], difficulty: 1, sheet: 'd', cell: 6, note: 'Five arms, no brain, no problem.' },
  { id: 'horseshoe_crab', name: 'Horseshoe Crab', tier: 'epic', where: 'near', size: [20, 50], difficulty: 3, sheet: 'd', cell: 7, release: true, note: 'Older than the dinosaurs, with blue blood. Gently put back.' },
  { id: 'sea_turtle', name: 'Green Sea Turtle', tier: 'epic', where: 'far', size: [70, 120], difficulty: 4, sheet: 'd', cell: 8, release: true, note: 'It gave you one slow look, then swam home. Released.' },
  { id: 'paddy_frog', name: 'Rice Paddy Frog', tier: 'common', where: 'near', size: [4, 10], difficulty: 1, season: 'rainy', sheet: 'd', cell: 9, note: 'Sings all night when the fields fill with rain.' },
  { id: 'night_squid', name: 'Night Squid', tier: 'rare', where: 'far', size: [15, 40], difficulty: 3, time: 'night', sheet: 'd', cell: 10, note: 'Follows the lamps of the night boats. Watch out for the ink.' },
  { id: 'manta_ray', name: 'Manta Ray', tier: 'epic', where: 'far', size: [300, 600], difficulty: 5, sheet: 'd', cell: 11, release: true, note: 'Flies through the water like a giant kite. Released.' },
  { id: 'axolotl', name: 'Axolotl', tier: 'epic', where: 'near', size: [15, 25], difficulty: 3, time: 'night', sheet: 'd', cell: 12, release: true, note: 'Always smiling. Can regrow its own legs. Let go with a smile back.' },
  { id: 'blue_lobster', name: 'Blue Lobster', tier: 'legend', where: 'far', size: [25, 50], difficulty: 4, sheet: 'd', cell: 13, note: 'People say only about one lobster in two million is born blue.' },
  { id: 'dugong', name: 'Dugong', tier: 'legend', where: 'far', size: [250, 350], difficulty: 5, sheet: 'd', cell: 14, release: true, note: 'The gentle sea cow that grazes on seagrass. Released with a wave.' },
  { id: 'island_turtle', name: 'Ancient Island Turtle', tier: 'god', where: 'far', size: [1000, 2000], difficulty: 5, sheet: 'd', cell: 15, release: true, note: 'A whole tiny island on its back, palm tree and all. It let you say hello.' },
];

/** The kinds in the game right now (their sheet art is cut). */
export const FREE_FISH: FreeFish[] = ALL_FREE_FISH.filter((f) => READY_SHEETS.includes(f.sheet));

export const FREE_BY_ID: Record<string, FreeFish> = Object.fromEntries(ALL_FREE_FISH.map((f) => [f.id, f]));

const FREE_TIERS = (['god', 'legend', 'epic', 'rare', 'common'] as FreeTier[]).map((t) => ({ id: t, weight: TIERS[t].weight, nice: TIERS[t].nice, weak: TIERS[t].weak }));

/** The table for every season at once (test forcing, simulations). */
export const FREE_TABLE: FishTable = {
  species: FREE_FISH,
  // order = rarest first … lowest tier last (the lowest tier is never dampened by zone fit)
  tiers: FREE_TIERS,
};

/** Thai season for a date, by the Bangkok calendar. Test with ?season=hot|rainy|cool. */
export function thaiSeason(now: Date = new Date()): Season {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('season');
    if (q === 'hot' || q === 'rainy' || q === 'cool') return q;
  }
  const bkk = new Date(now.getTime() + 7 * 3600_000); // Bangkok = UTC+7, no DST
  const md = (bkk.getUTCMonth() + 1) * 100 + bkk.getUTCDate(); // e.g. 5 Mar → 305
  if (md >= 216 && md <= 515) return 'hot';
  if (md >= 516 && md <= 1015) return 'rainy';
  return 'cool';
}

/** What can bite right now: fish without a season, plus this season's fish. (Day/night is checked in the roll.) */
export function freeTableNow(season: Season = thaiSeason()): FishTable {
  return { species: FREE_FISH.filter((f) => !f.season || f.season === season), tiers: FREE_TIERS };
}

/** Messages found in bottles (fun, random). */
export const BOTTLE_NOTES = [
  'If you find this, the tide remembers you.',
  'Dear finder: the café makes the best cocoa. Tell no one.',
  'I caught a fish THIS big. You had to be there.',
  'Be kind today. That is the whole message.',
  'Treasure is under the third lamp. (It is not. Sorry.)',
  'Whoever reads this: you are doing better than you think.',
];

export function freeIcon(id: string): string {
  return `/sprites/fish/${id}.webp`;
}

// ---- the Fish Book (collection), saved per browser ----------------------------------------
export interface FishBookEntry {
  count: number;
  best: number | null; // cm
  first: number; // timestamp of the first catch
}
export interface FishBook {
  version: 1;
  entries: Record<string, FishBookEntry>;
  total: number;
}

// test mode (?test=...) keeps its own book so testing never fills the real one
const KEY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test')
  ? 'free_fishing_book_test'
  : 'free_fishing_book_v1';
function load(): FishBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as FishBook;
      if (d.version === 1) return d;
    }
  } catch {
    // storage blocked — start fresh for this visit
  }
  return { version: 1, entries: {}, total: 0 };
}
let book: FishBook = load();
const listeners = new Set<() => void>();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}
export function getFishBook(): FishBook {
  return book;
}
export function useFishBook(): FishBook {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => book, () => book);
}
/** Add a catch. Returns { isNew: first ever of this kind, record: beat the best size }. */
export function addToFishBook(id: string, sizeCm: number | null): { isNew: boolean; record: boolean } {
  const old = book.entries[id];
  const record = !!old && sizeCm !== null && (old.best === null || sizeCm > old.best);
  const entry: FishBookEntry = old
    ? { ...old, count: old.count + 1, best: sizeCm !== null && (old.best === null || sizeCm > old.best) ? sizeCm : old.best }
    : { count: 1, best: sizeCm, first: Date.now() };
  book = { ...book, entries: { ...book.entries, [id]: entry }, total: book.total + 1 };
  save();
  return { isNew: !old, record };
}
export function resetFishBook() {
  book = { version: 1, entries: {}, total: 0 };
  save();
}
