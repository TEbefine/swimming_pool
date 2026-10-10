// Every story flag and counter key the Dalbit story may write — shared by the game (setFlag / addCounter
// only accept these, so a new key is a compile error until it is listed here) and by the save server
// (server/saves/rules.ts refuses saves with any other key). No imports: the server loads this file.

/** Plain flags (one-off facts). */
export const STORY_FLAGS = [
  'ate_breakfast', 'asked_rice_jar', 'asked_father_hands', 'looked_rice_jar', 'reached_pier_end',
  'first_catch', 'visited_market', 'asked_gu_price', 'met_innkeeper', 'bought_yeot', 'ate_yeot',
  'yeot_halves', 'read_rice_board', 'heard_frog_story', 'asked_about_mother', 'day1_done', 'gave_coins_mother',
] as const;
type Person = 'mother' | 'father';
type Buyer = 'gu' | 'inn';
/** Flags with a variable part (the item / person / day). `string` here; the patterns below are exact. */
export type StoryFlag = (typeof STORY_FLAGS)[number] | `caught_${string}` | `gave_${string}_${Person}` | `gift_${Person}_d${number}`;
export type StoryCounter = `sold_${Buyer}` | `inn_sold_d${number}`;

const FLAG_SET: ReadonlySet<string> = new Set(STORY_FLAGS);
const ITEM = '[a-z][a-z_]{1,30}';
const FLAG_PATTERNS = [
  new RegExp(`^caught_${ITEM}$`),
  new RegExp(`^gave_(?:${ITEM}|coins)_(?:mother|father)$`),
  /^gift_(?:mother|father)_d[1-9]\d{0,2}$/,
];
const COUNTER_PATTERNS = [/^sold_(?:gu|inn)$/, /^inn_sold_d[1-9]\d{0,2}$/];

export function isStoryFlag(key: string): boolean {
  return FLAG_SET.has(key) || FLAG_PATTERNS.some((p) => p.test(key));
}
export function isStoryCounter(key: string): boolean {
  return COUNTER_PATTERNS.some((p) => p.test(key));
}
