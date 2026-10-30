import './register-api-ts.mjs';
const { issueFishingDeck } = await import('../server/fishing/deck.ts');
const { rollDeckCatch } = await import('../src/game/fishing/deckRoll.ts');
export const TEST_SECRET = 'emulator-only-stable-secret-0123456789abcdef';
export const saleEnv = { FISHING_DECK_SECRET: TEST_SECRET, FISHING_DECK_REDEEM_FROM_DECK_ID: '0' };
/** Search only in test fixtures; production rolls/redeems the client's explicit index. */
export function fixtureCatch(owner, caughtAt, { fish = 'sardine', size, castAt = caughtAt - 1000, startIndex = 0, secret = TEST_SECRET, distance = .85 } = {}) {
  const deck = issueFishingDeck(owner, castAt, secret), castInfo = { distance, nice: distance >= .8 && distance <= .92 };
  for (let castIndex = startIndex; castIndex < deck.casts; castIndex++) {
    const roll = rollDeckCatch({ ...deck, castIndex, castInfo, castAt });
    if ((!fish || roll.fish === fish) && (size === undefined || roll.sizeCm === size)) return {
      fish: roll.fish, sizeCm: roll.sizeCm, caughtAt, ticket: { version: deck.version, deckId: deck.deckId, castIndex, castInfo, castAt },
    };
  }
  throw new Error(`No fixture for ${fish}/${size} at ${castAt} after ${startIndex}`);
}
