# ECO-03 — final verification packet

2026-10-30 · dev-test-id · Reviewed application commit **b87ba82c3c61b1c145c6a39b54da7c4f7c229e5c**.

Teera reports Claude independently approved the deck integration, verified sales, paid bits, tier caps and new Book. This packet completes step 4 of the approved stage-5/Book plan. No application, test, rules, price, odds or minigame changes were needed. Stage 6 is a separate proposal awaiting approval.

## Fresh verification

Fast-forwarded a clean disposable checkout to the current remote dev-test-id head above. No reset of Teera's saves. Node 24.15.0, npm 11.12.1, TypeScript from the locked installation; Java 21.0.12.1, Firebase CLI 13.15.1 and cached Firestore emulator 1.19.7.

| Command | Result |
| --- | --- |
| `npm test` | **283 passed; 0 failed, cancelled or skipped** |
| `npx tsc -b` | Exit 0 |
| `npm run build` | Exit 0; production Vite bundle and all four compiled Vercel API smoke checks pass |
| `npm run test:rules` | **9 passed; 0 failed, cancelled or skipped; command exits 0** |

The four API smoke checks load built nonce/login/items/fishing-deck functions with require(ESM) disabled and check JSON method refusal; login also checks RSA/JWKS verification. Production browser output contains none of the dev fishing secret, devFishingPolicy module name, local policy filename or reset command name.

The first emulator run passed all nine assertions but the older CLI failed while saving its global local settings on shutdown. Reran cleanly with isolated local configuration, without changing the repository or global config:

```sh
XDG_CONFIG_HOME=/tmp/lumen-eco03-final-4iEttx/firebase-config \
FIREBASE_CLI_DISABLE_UPDATE_CHECK=1 CI=1 npm run test:rules
```

The only project used was **demo-lumen-bay**, with local emulator credentials. No shared Firestore, Preview or production write, deployment, environment change, main merge or economy-gate activation.

## Evidence map

| Requirement | Existing tests rerun |
| --- | --- |
| Frozen v1, deterministic protocol, browser/server agreement, calendar and five cast states | `tests/fishing-deck.test.mjs`: golden vectors; 7,680 legacy parity cases; 7,680 built browser/NodeNext cases; boundaries/retirement |
| One economy clock; actual Nice edges 0.80/0.92 and neighbours; graceful no-deck/storage fallback | `tests/fishing-deck-integration.test.mjs`, `tests/fishing-deck-store.test.mjs` |
| Fish/size/owner/seed/index/version/quality/time verification; whole-batch refusal; exact five minutes | `tests/verified-sales.test.mjs` |
| Current/previous paid-index retention, duplicate prevention, malformed state, fixed size | `tests/deck-redemptions.test.mjs`, `tests/verified-sales.test.mjs` |
| Paid-only `{best,sold}`, max best, thresholds 24/25, 11/12, 5/6, 2/3; hidden counts; 27 kinds | `tests/fishbook.test.mjs`, `tests/fishbook-client.test.mjs` |
| Actual minigame → real verified Gen sale → authoritative Book; lost answer, exact Retry and second device | `tests/fishing-deck-integration.test.mjs` whole-loop test; client/cloud suites |
| Species-only 1.15× strike; unchanged roll/wait/reel/story; retired guide/pending flow | `tests/fishbook-client.test.mjs`, integration and server verified-sale tests |
| Account/revision scope, storage faults, safe selection/indexed rejection; pending ice and Bag | `tests/fishbook-client.test.mjs`, `tests/economy-client.test.mjs`, integration tests |
| Zero-setup current-window DEV issue/sale/Retry; coherent reset; production refusal | `tests/dev-fishing-policy.test.mjs`, `tests/fishing-deck-api.test.mjs` |

Nine real emulator tests in `tests/firestore-rules.emulator.mjs` cover:

1. Owner reads; other player/anonymous and all client writes refused.
2. Concurrent create-only nonce consumption.
3. Competing shop/bag spends cannot double-spend coins or the last ice.
4. Plan scenario 1: two devices redeeming one index pay once; identical operation IDs replay one commit.
5. Plan scenario 2: distinct indices at identical timestamps accumulate count/max best and cross a species star.
6. Plan scenario 3: last-ms casts, inclusive five-minute boundary/freshness, confirmed ice, rollover/midnight and historical receipt replay after bit retirement.
7. Plan scenario 4: competing final tier allowance/coin budget retry atomically; invalid/all-kept requests write nothing.
8. Plan scenario 5: forged best/sold/bits/logs denied; retired fishbook.record does no DB access.
9. Extra clock-boundary case: fast writer E+2 ms stores next-window bits; slow worker E−2 ms gets 503 with **no write or bit loss**. At exact E both windows survive; paid indices get 409; original operation replays its receipt without payment.

Accepted sale still uses player + operation log: **2 reads + 2 writes**, before contention retries. Book and bits share that transaction. Retry/refusal adds no write. Gen buys fish; Minato sells food. No reward/card/town implementation.

## Retirement proof

For a window ending E, castAt < E and cast duration ≤5 min give caughtAt < E+5 min. Maximum confirmed-ice life is 30+30=60 min. Conservatively adding 10 s sale clock tolerance bounds a fresh new redemption before **E+65 min 10 s**. The previous-window bits retire at **E+360 min**, leaving **294 min 50 s**. The server's window test can only refuse earlier; it cannot extend this tail. Exact already-committed operations replay their saved receipt before these checks, without paying again.

## What is and is not verified

This run adds **no new tests**: the existing 283 unit/integration tests and nine emulator tests all passed unchanged. There was no unexplained count change from Claude's 283.

Step 3 already recorded a local 390×844 headless browser fixture sale → rendered 1/27/best → second-context Book load, with screenshot inspection and no page errors. That is prior evidence, not a fresh browser or physical-device run in this packet. The actual minigame loop is exercised by today's integration suite. Physical iPhone/Safari touch feel, network handoff/background behavior on a phone, and production deployment/kill-switch behavior remain unverified here. Teera's manual phone review and ECO-04 release work remain separate.

No failed check required a behavior change. One future tuning hazard was identified: `SELL.dailyCap` also sets the saved-balance ceiling through `balanceCapDays`. The stage-6 plan must separate those limits before reducing daily earnings, preserving the existing absolute 2,000,000 balance ceiling.

## Frozen-source fingerprints

SHA-256 at the reviewed commit, unchanged by this documentation packet:

| File | SHA-256 |
| --- | --- |
| `src/game/fishing/deckRollV1.ts` | `e46b07768359dac43668a34a2e4b4fce854c87d8e95085efd9565939838504ee` |
| `src/game/fishing/deckRoll.ts` | `dfac01eccf665043433d6ee02ac8853dcd0172c292bc2ee32dd1ad3dbf0701dc` |
| `src/game/fishing/deckConfig.ts` | `1af563516034cc986750355f173979d73ff488c35c53ab1d5bbd31e028c79526` |
| `src/game/story/fishing.ts` | `04ba70a1468b6bea4b0423396f785f8c75f2c5ff1d9614b6588f039b084dcd47` |

Step 4 is complete locally. Keep dev-test-id isolated until ECO-04; stage-6 runtime work requires Teera's approval of the separate plan.
