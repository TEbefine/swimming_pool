// ECO-03 protocol and approved policy. Stage 2 only: no route, allocation or sale enforcement yet.
// Changing roll version/parameters must preserve the old version while its tickets can still be sold.
export const FISHING_DECK = Object.freeze({
  version: 1,
  windowMs: 6 * 60 * 60_000,
  casts: 8_192,
  maxCastDurationMs: 5 * 60_000,
  // null = no additional tier limit; the existing daily coin/operation limits still apply.
  // Gen will derive counts from econ.soldToday and apply these in the existing sale transaction.
  dailySaleLimits: Object.freeze({ common: null, rare: null, epic: 10, legend: 2, god: 0 }),
});
