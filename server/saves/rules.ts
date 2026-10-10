// ID-01 (c) — what a Player ID's save may contain, and which changes the server accepts.
// Pure functions (no Firebase): server/saves/handlers.ts runs them inside one Firestore transaction.
// The client is never trusted with totals: it sends small facts (a catch, an end-of-day story state)
// and the server checks them against the shared catalogue, sensible bounds, time and rate.
import { ALL_FREE_FISH, READY_SHEETS, bangkokHourAt, isDayHourAt, thaiSeasonAt } from '../../src/game/fishing/freeFishCatalog.js';
import type { FreeFish } from '../../src/game/fishing/freeFishCatalog.js';
import { ITEMS, ITEM_IDS } from '../../src/game/story/items.js';
import type { ItemId } from '../../src/game/story/items.js';

export class SaveError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---- limits (tune here) -------------------------------------------------------------------------
export const LIMITS = {
  /** Catches per fishbook.record request (the client sends its pending list in chunks). */
  catchesPerRequest: 40,
  /** A real cast → wait → bite → reel takes ≥ ~3.8 s (fishing.ts TUNING); 3 s leaves room for clocks. */
  minCatchGapMs: 3_000,
  /** Pending catches older than this are refused (show them to a Fishing Guide within a week). */
  maxCatchAgeMs: 7 * 24 * 3600_000,
  /** How far a device clock may run ahead of the server. */
  clockSkewMs: 60_000,
  /** Day/night and season boundaries: a catch this close to the line counts for either side. */
  timeSlackMs: 10 * 60_000,
  seasonSlackMs: 24 * 3600_000,
  /** Catches accepted per Bangkok day (the gap rule alone would allow 28,800). */
  catchesPerDay: 2_000,
  /** Save operations per player per minute (the IP limiter is per server instance only). */
  opsPerMinute: 30,
  /** Accepted (written) operations per player per Bangkok day: bounds Firestore writes per ID (2 per op). */
  opsPerDay: 200,
  /** Story bounds per saved day. */
  coinGainPerDay: 300,
  itemGainPerDay: 60,
  /** Any single item may grow by at most this per day (so 60 mackerel can't become 60 rice sacks). */
  perItemGainPerDay: 30,
  maxCoins: 100_000,
  maxStackSize: 99,
  maxFlags: 200,
  maxCounters: 100,
  maxLedger: 200,
  maxLedgerText: 240,
  maxStoryBytes: 16_384,
};

const FISH: ReadonlyMap<string, FreeFish> = new Map(ALL_FREE_FISH.map(f => [f.id, f]));
// Firestore reserves names that start and end with "__"; never accept a leading "__".
const KEY_PATTERN = /^(?!__)[a-z0-9_]{1,48}$/;
const OPERATION_PATTERN = /^(?!__)[A-Za-z0-9_-]{16,64}$/;
/** The last Dalbit day the game has. Raise `lastDay` when a new day ships (saves beyond it are refused). */
export const STORY = { lastDay: 1 };

// ---- the saved document --------------------------------------------------------------------------
export interface FishBookEntry { count: number; best: number | null; first: number; last: number }
export interface LedgerEntry { day: number; text: string }
/** Mirrors src/game/story/storyStore.ts StoryState v1 (validated field by field below). */
export interface StoryState {
  version: 1;
  step: string;
  day: number;
  coins: number;
  energy: number;
  bag: Partial<Record<ItemId, number>>;
  flags: Record<string, boolean>;
  ledger: LedgerEntry[];
  records: Partial<Record<ItemId, number>>;
  counters: Record<string, number>;
}
export interface StorySave { day: number; step: string; revision: number; savedAt: number; state: StoryState }
export interface PlayerDoc {
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
  /** Bumped on every accepted change. */
  revision: number;
  fishBook: Record<string, FishBookEntry>;
  fishTotal: number;
  /** caughtAt of the newest recorded catch: new catches must come after it (no replays). */
  lastCatchAt: number | null;
  catchDay: { day: string; count: number };
  storyWorlds: { dalbit?: StorySave };
  /** Reserved for cards and Lumen Bay memory (ID-01 plan); nothing writes them yet. */
  ownedCards: Record<string, never>;
  communityMemory: Record<string, never>;
  opWindow: { start: number; count: number };
  /** Accepted operations today (Bangkok day): the per-ID write budget. */
  writeDay: { day: string; count: number };
}
export interface LogEntry {
  at: number;
  op: string;
  requestHash: string;
  changes: Record<string, unknown>;
  prevRevision: number;
  newRevision: number;
}

export function emptyPlayer(now: number): PlayerDoc {
  return {
    schemaVersion: 1, createdAt: now, updatedAt: now, revision: 0,
    fishBook: {}, fishTotal: 0, lastCatchAt: null, catchDay: { day: '', count: 0 },
    storyWorlds: {}, ownedCards: {}, communityMemory: {}, opWindow: { start: 0, count: 0 }, writeDay: { day: '', count: 0 },
  };
}

/** Reads a stored document defensively (missing fields get defaults; nothing unknown is kept). */
export function normalizePlayer(raw: unknown, now: number): PlayerDoc {
  const base = emptyPlayer(now);
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<PlayerDoc>;
  return {
    ...base,
    createdAt: num(d.createdAt, now),
    updatedAt: num(d.updatedAt, now),
    revision: num(d.revision, 0),
    fishBook: d.fishBook && typeof d.fishBook === 'object' ? d.fishBook : {},
    fishTotal: num(d.fishTotal, 0),
    lastCatchAt: typeof d.lastCatchAt === 'number' ? d.lastCatchAt : null,
    catchDay: d.catchDay && typeof d.catchDay.day === 'string' ? { day: d.catchDay.day, count: num(d.catchDay.count, 0) } : base.catchDay,
    storyWorlds: d.storyWorlds && typeof d.storyWorlds === 'object' ? d.storyWorlds : {},
    opWindow: d.opWindow ? { start: num(d.opWindow.start, 0), count: num(d.opWindow.count, 0) } : base.opWindow,
    writeDay: d.writeDay && typeof d.writeDay.day === 'string' ? { day: d.writeDay.day, count: num(d.writeDay.count, 0) } : base.writeDay,
  };
}
function num(v: unknown, fallback: number) { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }

/** What the player's own device may see (everything but internal counters). */
export function playerView(doc: PlayerDoc | null) {
  if (!doc) return { revision: 0, fishBook: {}, fishTotal: 0, lastCatchAt: null, story: { dalbit: null } };
  return { revision: doc.revision, fishBook: doc.fishBook, fishTotal: doc.fishTotal, lastCatchAt: doc.lastCatchAt, story: { dalbit: doc.storyWorlds.dalbit ?? null } };
}

export function bangkokDay(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

export function checkOperationId(value: unknown): string {
  if (typeof value !== 'string' || !OPERATION_PATTERN.test(value)) throw new SaveError(400, 'Invalid save request.');
  return value;
}

/** Per-player rate window + daily write budget, kept in the document (works across server instances).
 *  Only accepted operations are written, so handlers.ts ALSO limits every request per uid in memory. */
export function countOperation(doc: PlayerDoc, now: number): Pick<PlayerDoc, 'opWindow' | 'writeDay'> {
  const w = now - doc.opWindow.start >= 60_000 || doc.opWindow.start > now ? { start: now, count: 0 } : { ...doc.opWindow };
  if (++w.count > LIMITS.opsPerMinute) throw new SaveError(429, 'Saving too often. Please wait a minute.');
  const today = bangkokDay(now);
  const d = doc.writeDay.day === today ? { ...doc.writeDay } : { day: today, count: 0 };
  if (++d.count > LIMITS.opsPerDay) throw new SaveError(429, 'That is a lot of saving for one day. Please come back tomorrow.');
  return { opWindow: w, writeDay: d };
}

// ---- Fish Book: catches shown to a Fishing Guide -------------------------------------------------
export interface Catch { fish: string; sizeCm: number | null; caughtAt: number }

export function parseCatches(raw: unknown): Catch[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > LIMITS.catchesPerRequest) throw new SaveError(400, 'Invalid catch list.');
  return raw.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new SaveError(400, 'Invalid catch.');
    const keys = Object.keys(item);
    if (keys.length !== 3 || !['fish', 'sizeCm', 'caughtAt'].every(k => keys.includes(k))) throw new SaveError(400, 'Invalid catch.');
    const { fish, sizeCm, caughtAt } = item as Record<string, unknown>;
    if (typeof fish !== 'string' || fish.length > 40) throw new SaveError(400, 'Invalid catch.');
    if (sizeCm !== null && typeof sizeCm !== 'number') throw new SaveError(400, 'Invalid catch.');
    if (typeof caughtAt !== 'number' || !Number.isSafeInteger(caughtAt)) throw new SaveError(400, 'Invalid catch.');
    return { fish, sizeCm: sizeCm as number | null, caughtAt };
  }).map((c, i, all) => {
    if (i > 0 && c.caughtAt <= all[i - 1].caughtAt) throw new SaveError(400, 'Catches must be in time order.');
    return c;
  });
}

function fitsTime(f: FreeFish, at: number): boolean {
  if (!f.time) return true;
  const want = f.time === 'day';
  return [at - LIMITS.timeSlackMs, at, at + LIMITS.timeSlackMs].some(t => isDayHourAt(bangkokHourAt(t)) === want);
}
function fitsSeason(f: FreeFish, at: number): boolean {
  if (!f.season) return true;
  return [at - LIMITS.seasonSlackMs, at, at + LIMITS.seasonSlackMs].some(t => thaiSeasonAt(t) === f.season);
}

/** Checks one catch on its own (catalogue, size, date, time of day, season). Returns why it fails, or null. */
export function catchProblem(c: Catch, now: number): string | null {
  const f = FISH.get(c.fish);
  if (!f || !READY_SHEETS.includes(f.sheet)) return 'not a fish this bay knows';
  if (f.size) {
    if (c.sizeCm === null || !Number.isInteger(c.sizeCm) || c.sizeCm < f.size[0] || c.sizeCm > f.size[1]) return `the size of a ${f.name} looks wrong`;
  } else if (c.sizeCm !== null) return `a ${f.name} has no size`;
  if (c.caughtAt > now + LIMITS.clockSkewMs) return 'dated in the future (check the device clock)';
  if (c.caughtAt < now - LIMITS.maxCatchAgeMs) return 'older than a week';
  if (!fitsTime(f, c.caughtAt)) return `a ${f.name} does not bite at that time of day`;
  if (!fitsSeason(f, c.caughtAt)) return `a ${f.name} does not bite in that season`;
  return null;
}

/** Accepts every valid catch (each must also come ≥ minCatchGapMs after the previous accepted one) and
 *  reports the rest by index. Throws 422 only when none is valid, 429 past the daily cap. */
export function applyCatches(doc: PlayerDoc, catches: Catch[], now: number) {
  let prev = doc.lastCatchAt;
  const accepted: Catch[] = [];
  const rejected: { index: number; reason: string }[] = [];
  catches.forEach((c, index) => {
    const reason = catchProblem(c, now) ?? (prev !== null && c.caughtAt - prev < LIMITS.minCatchGapMs ? 'too soon after another catch' : null);
    if (reason) { rejected.push({ index, reason }); return; }
    accepted.push(c);
    prev = c.caughtAt;
  });
  if (!accepted.length) throw new SaveError(422, `These catches can't be recorded: ${rejected[0]?.reason ?? 'invalid'}.`);
  const today = bangkokDay(now);
  const dayCount = (doc.catchDay.day === today ? doc.catchDay.count : 0) + accepted.length;
  if (dayCount > LIMITS.catchesPerDay) throw new SaveError(429, 'That is more fish than one day can hold. Come back tomorrow.');

  const fishBook = { ...doc.fishBook };
  const newKinds: string[] = [];
  const records: string[] = [];
  for (const c of accepted) {
    const old = fishBook[c.fish];
    if (!old) newKinds.push(c.fish);
    else if (c.sizeCm !== null && (old.best === null || c.sizeCm > old.best)) records.push(c.fish);
    fishBook[c.fish] = old
      ? { count: old.count + 1, best: c.sizeCm !== null && (old.best === null || c.sizeCm > old.best) ? c.sizeCm : old.best, first: old.first, last: c.caughtAt }
      : { count: 1, best: c.sizeCm, first: c.caughtAt, last: c.caughtAt };
  }
  return {
    fields: { fishBook, fishTotal: doc.fishTotal + accepted.length, lastCatchAt: prev, catchDay: { day: today, count: dayCount } },
    changes: { recorded: accepted.length, kinds: accepted.map(c => c.fish), newKinds, records, rejected },
  };
}

// ---- Dalbit story: one validated save at the end of each day -------------------------------------
function plainObject(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SaveError(422, `Story ${what} is invalid.`);
  return v as Record<string, unknown>;
}
function int(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw new SaveError(422, `Story ${what} is out of range.`);
  return v;
}
function bagTotal(bag: Partial<Record<string, number>>): number {
  return Object.values(bag).reduce<number>((a, n) => a + (n ?? 0), 0);
}

/** Checks an end-of-day story state and returns a clean copy built only from accepted fields.
 *  relational=false runs only the checks that need no stored save (handlers.ts does that before the
 *  transaction, so junk costs no Firestore reads); the transaction runs it again with the stored save. */
export function validateStoryDay(raw: unknown, prev: StorySave | undefined, relational = true): StoryState {
  const s = plainObject(raw, 'save');
  if (Buffer.byteLength(JSON.stringify(s)) > LIMITS.maxStoryBytes) throw new SaveError(413, 'Story save is too large.');
  const fields = ['version', 'step', 'day', 'coins', 'energy', 'bag', 'flags', 'ledger', 'records', 'counters'];
  if (Object.keys(s).some(k => !fields.includes(k)) || fields.some(k => !(k in s))) throw new SaveError(422, 'Story save has unexpected fields.');
  if (s.version !== 1) throw new SaveError(422, 'Story save version is not supported.');

  const day = int(s.day, 1, STORY.lastDay, 'day');
  // Only the end of a day is saved, never the same day twice (no replaying a day for coins). A missed
  // day-end save (offline) is caught up by the next one, with the bounds scaled by the days covered.
  if (s.step !== `d${day}_end`) throw new SaveError(409, 'The story only saves at the end of a day.');
  if (relational && prev && day <= prev.day) throw new SaveError(409, `Day ${day} is already saved.`);
  const days = relational ? day - (prev?.day ?? 0) : day;

  const prevState = relational ? prev?.state : undefined;
  const coins = int(s.coins, 0, LIMITS.maxCoins, 'coins');
  if (coins > (prevState?.coins ?? 0) + LIMITS.coinGainPerDay * days) throw new SaveError(422, 'Story coins grew more than the days allow.');
  const energy = int(s.energy, 0, 10, 'energy');

  const bagIn = plainObject(s.bag, 'bag');
  const bag: Partial<Record<ItemId, number>> = {};
  for (const [id, n] of Object.entries(bagIn)) {
    if (!(ITEM_IDS as readonly string[]).includes(id)) throw new SaveError(422, 'Story bag has an unknown item.');
    const item = ITEMS[id as ItemId];
    bag[id as ItemId] = int(n, 1, item.key ? 1 : LIMITS.maxStackSize, 'bag');
    if (bag[id as ItemId]! > (prevState?.bag[id as ItemId] ?? 0) + LIMITS.perItemGainPerDay * days) throw new SaveError(422, 'Story bag grew more than the days allow.');
  }
  if (bagTotal(bag) > bagTotal(prevState?.bag ?? {}) + LIMITS.itemGainPerDay * days) throw new SaveError(422, 'Story bag grew more than the days allow.');

  const flagsIn = plainObject(s.flags, 'flags');
  if (Object.keys(flagsIn).length > LIMITS.maxFlags) throw new SaveError(422, 'Story flags are invalid.');
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flagsIn)) {
    if (!KEY_PATTERN.test(k) || typeof v !== 'boolean') throw new SaveError(422, 'Story flags are invalid.');
    if (v) flags[k] = true;
  }

  if (!Array.isArray(s.ledger) || s.ledger.length > LIMITS.maxLedger) throw new SaveError(422, 'Story ledger is invalid.');
  const ledger: LedgerEntry[] = s.ledger.map(e => {
    const entry = plainObject(e, 'ledger');
    if (Object.keys(entry).length !== 2 || typeof entry.text !== 'string') throw new SaveError(422, 'Story ledger is invalid.');
    const text = entry.text;
    // eslint-disable-next-line no-control-regex
    if (text.length < 1 || text.length > LIMITS.maxLedgerText || /[\u0000-\u001f\u007f]/.test(text)) throw new SaveError(422, 'Story ledger is invalid.');
    return { day: int(entry.day, 1, day, 'ledger'), text };
  });
  // The Ledger only grows: everything already saved must still be there, in order.
  const old = relational ? prevState?.ledger ?? [] : [];
  if (ledger.length < old.length || old.some((e, i) => e.day !== ledger[i].day || e.text !== ledger[i].text)) throw new SaveError(422, 'Story ledger lost earlier entries.');

  const recordsIn = plainObject(s.records, 'records');
  const records: Partial<Record<ItemId, number>> = {};
  for (const [id, cm] of Object.entries(recordsIn)) {
    const size = (ITEM_IDS as readonly string[]).includes(id) ? ITEMS[id as ItemId].catch?.size : undefined;
    if (!size) throw new SaveError(422, 'Story records are invalid.');
    records[id as ItemId] = int(cm, size[0], size[1], 'records');
  }

  const countersIn = plainObject(s.counters, 'counters');
  if (Object.keys(countersIn).length > LIMITS.maxCounters) throw new SaveError(422, 'Story counters are invalid.');
  const counters: Record<string, number> = {};
  for (const [k, v] of Object.entries(countersIn)) {
    if (!KEY_PATTERN.test(k)) throw new SaveError(422, 'Story counters are invalid.');
    counters[k] = int(v, 0, 100_000, 'counters');
  }

  return { version: 1, step: s.step as string, day, coins, energy, bag, flags, ledger, records, counters };
}
