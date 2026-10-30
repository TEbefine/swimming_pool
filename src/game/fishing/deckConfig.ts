// Current pre-launch protocol: dev datasets switch through the coherent local reset.
// Retained roll versions are not a live ticket-transition policy.
export const FISHING_DECK = Object.freeze({
  version: 2,
  windowMs: 6 * 60 * 60_000,
  casts: 8_192,
  maxCastDurationMs: 5 * 60_000,
  requestsPerIpMinute: 10,
  requestsPerPlayerMinute: 5,
  requestBodyBytes: 1_024,
  requestTimeoutMs: 20_000,
  // null = no additional tier limit; the existing daily coin/operation limits still apply.
  // Gen will derive counts from econ.soldToday and apply these in the existing sale transaction.
  dailySaleLimits: Object.freeze({ common: null, rare: null, epic: 10, legend: 2, god: 0 }),
});

/** Retained roll kernels; sale/cache readers separately require FISHING_DECK.version. */
export function isFishingDeckVersion(version: unknown): version is 1 | 2 {
  return version === 1 || version === 2;
}
