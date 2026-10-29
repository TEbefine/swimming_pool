// Shared save limits: pure configuration used by the browser and server.
import { ECONOMY_SAVE } from '../../src/game/economy/economyConfig.js';

export const LIMITS = {
  /** Obsolete client pending-list spacing; removed with the guide flow in step 3. Not a sale rule. */
  minCatchGapMs: 3_000,
  /** Maximum verified fish sold per Bangkok day. */
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
