# ECO-03 stage 6, step 2 — v2 odds, dispatch, local reset and 3,000 cap

2026-10-30 · dev-test-id · Base **a9977f3**, approved by Teera after Claude independently reran 285 tests. Pulled dev-test-id before implementation; no incoming changes.

## What changed

- Active/issued deck version **2**. New `deckRollV2.ts` uses legend weight **0.9**, all other frozen coefficients/species/size rules unchanged, and a distinct `fishing-roll/v2` random-stream domain. HMAC seeds already include the version; the retained seed helper accepts versions 1/2, while issuance is current-version only.
- `deckRoll.ts` explicitly dispatches by ticket.version. The old algorithm is extracted into `deckKernelV1.ts`, with its existing 8,192-card bound pinned instead of importing mutable active config. Apart from that bound and heading, extraction is byte-for-byte the old implementation. `deckRollV1.ts` stays byte-for-byte unchanged (SHA-256 e46b07768359dac43668a34a2e4b4fce854c87d8e95085efd9565939838504ee); old protocol vectors and 7,680 legacy parity cases remain intact.
- Shared **SELL.dailyCap = 3,000**. Step 1's independent **ECONOMY_SAVE.maxBalance = 2,000,000** stays intact. Prices, daily tier caps (legend2/epic10/god0), Book thresholds/counts and the 40 accepted-op budget are unchanged.
- Both dev middleware plugins use the same local fishing policy. A fresh policy records `version:2`, current-window first-sale cutoff and reset token. A v1/unversioned policy refuses startup with the reset instruction. A missing policy beside existing saves also refuses, rather than silently recreating policy around old paid state. Neither path rewrites the old files.
- Explicit `npm run dev:reset-fishing` still removes local policy + saves/logs together; restart creates v2 policy and a new reset token. Existing DEV response handling clears cooler, pending trade, economy/Book caches and deck cursor together, once per reset; identity/vault/recovery are untouched. No automatic save reset or old-request conversion.
- Existing cache/ticket/client-sale/paid-bit readers already require the active version, so they now accept v2 and refuse old v1 active state. They never turn unsafe paid bits into empty unpaid bits. No mixed-version windows, cutover env variable, timed switch, migration or rehearsal was added.

The sale wire/Book shape, player/log transaction, original-receipt Retry ordering, 2 reads + 2 writes, permissions, Gen/Minato roles, pending ice and Bag behavior are unchanged. No global TUNING, free minigame/session, UI, story or practice-fallback changes: the free-only profile and fallback table selection remain step 3. No card/reward/town/release work.

## Fresh checks

| Check | Result |
| --- | --- |
| `npm test` | **293 passed, 0 failed/cancelled/skipped** (285 + 8) |
| `npx tsc -b` | Pass, exit 0 |
| `npm run build` | Pass; nonce/login/items/fishing-deck production API smoke checks all pass |
| `npm run test:rules` | **10/10 pass**, exit 0, demo-lumen-bay emulator only |
| `git diff --check` | Pass |

Emulator uses isolated Firebase CLI settings (`XDG_CONFIG_HOME`, disabled update check), as in step 1. All existing transaction race/Book/star/tier/coin/Retry/ice/rollover/permissions and 4-ms future-slot tests now run with actual v2 fixtures. No new emulator test was necessary; the existing ten cover these invariants under the active version and 3,000 cap.

Production output has no dev secret, dev policy module or local policy path; compiled API tracing excludes server/dev. Lazy fishing chunk is 87.29 kB / gzip29.46 kB versus prior85.43/gzip29.35, retaining both kernels without new runtime dependencies. This is a build-size check, not a physical-phone performance claim.

The initial full unit run exposed three stale fixture assumptions: an expected 5,000 normalized daily cap and two tests assuming consecutive v1 card indices were both sellable. Updated the cap expectation and fixed the real-session fixture to two consecutive legitimate v2 sardines; no minigame behavior was changed to satisfy a test. Final full suite is green.

## Exact coverage added/expanded

Eight new tests:

1. V2 active coefficients/current version, immutable data, 3,000 daily earnings and separate2m balance.
2. Ticket-version dispatch, independent v2 RNG/complete-roll golden vectors, version-bound owner seeds and retained v1 vector.
3. V2 malformed seed/index/Nice/time refusal; legal kinds/sizes/baseDiff/big/time across full day/night decks; no ambient clock/random; exact Nice-band edges.
4. Active v2 refuses v1 tickets/caches/paid bits without erasing state or awarding a sale.
5. Actual v2 kernel matches the independently planned **ten 100,000-roll rows** (one million rolls), including sellable-legend/non-sellable counts and 1–2% Nice legend tiers.
6. Real-handler v2 pays up to3,000; buying cannot refill allowance; a further fish gets kept without Book/bit/log write; exact original Retry cannot pay or record again.
7. Old v1 policy/orphaned saves require coherent reset and remain byte-for-byte unchanged on refusal.
8. Actual Vite-compiled DEV client clears a cached v1 pending body/cooler, high-revision Book/economy and cursor together on the new reset response, applies revision0, preserves the identity sentinel, sends no old request and does not erase a later catch on the same token.

Expanded existing checks: strict NodeNext and Vite-built browser parity now covers **15,360 cases** (7,680 per version), with no ambient globals, across all five cast states and Bangkok time/season edges. Actual minigame casts at0.80/0.92 and neighbours use v2; real catch → verified Gen sale → Book/lost-answer Retry/second device remains green. Existing real Vite middleware test now seeds an old v1 dataset, resets it, loads an empty Book/balance, issues v2 and verifies one paid sale/one original receipt replay.

## Actual v2 roll report

100,000 draws per row, deterministic public fake owners/key, unique `(owner,window,index)` samples within a row. Treasures/gods remain in the roll; legend tier includes treasure chest. These are roll frequencies, not human catch/sale frequencies.

| Time | Cast | Common % | Rare % | Epic % | Legend % | God % | Sellable legend % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| day | weak-near | 77.864 | 18.130 | 3.948 | 0.055 | 0.003 | 0.031 |
| day | normal-near | 62.349 | 26.932 | 10.362 | 0.280 | 0.077 | 0.160 |
| day | normal-mid | 61.939 | 26.782 | 10.302 | 0.900 | 0.077 | 0.725 |
| day | normal-far | 61.780 | 26.722 | 10.280 | 0.911 | 0.307 | 0.846 |
| day | Nice-far | 49.671 | 32.522 | 15.548 | 1.641 | 0.618 | 1.516 |
| night | weak-near | 77.826 | 18.111 | 4.014 | 0.046 | 0.003 | 0.031 |
| night | normal-near | 62.395 | 26.805 | 10.450 | 0.285 | 0.065 | 0.200 |
| night | normal-mid | 61.984 | 26.666 | 10.325 | 0.961 | 0.064 | 0.844 |
| night | normal-far | 61.849 | 26.603 | 10.321 | 0.936 | 0.291 | 0.889 |
| night | Nice-far | 49.914 | 32.214 | 15.547 | 1.681 | 0.644 | 1.593 |

Nice analytic legend chance is **1.62/96.42 = 1.680%**; actual samples1.641% day/1.681% night. Exact counts match the prior independent planning kernel. Reproduce with `node docs/ai/analysis/ECO-03-v2-rolls.mjs`; JSON beside it contains all counts and source fingerprints. No actual secret, player data, network or DB is used. The earlier pacing/income model remains an estimate and is updated in step4 after the free profile exists.

## Local reset and smoke test

After pulling this step on Teera's machine, stop the dev server first, then:

```sh
npm run dev:reset-fishing
npm run dev
```

Reload **every game tab**. This intentionally discards local dev saves/Book/pending trades and their logs together; it does not preserve or migrate v1 dev fish. Identity/recovery are outside the reset. New machines still need zero setup. Never apply this local command/procedure to shared or production data.

Ran the actual reset CLI in the isolated review checkout (exit0), started actual npm run dev with zero environment setup, and probed localhost: v2 deck/load/sale/exact Retry all200, authoritative Book updated, saved lifetime sold1 and exactly one log. The smoke script searched a deterministic legitimate test index; it is not a manual minigame/iPhone catch. The separate real-session integration test drives the actual minigame. The test server was stopped afterward. No shared database/Preview write, production setting, main merge or physical iPhone test. Step3 pacing remains unstarted; commit/push dev-test-id and stop for review.
