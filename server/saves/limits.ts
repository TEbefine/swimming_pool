// Shared save limits: pure configuration used by the browser and server.
import { ECONOMY_SAVE } from '../../src/game/economy/economyConfig.js';

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
  opsPerDay: ECONOMY_SAVE.opsPerDay,
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
