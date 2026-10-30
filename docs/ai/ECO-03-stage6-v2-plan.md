# ECO-03 stage 6 — approved simplified plan

2026-10-30 · Teera approved stage 6 with the corrections below. Base: dev-test-id **40e96cb**. Step 1 only is authorized this turn; stop after its checks/commit/push. [Final verification packet](ECO-03-final-verification.md) covers the prior application.

## Approved decisions

- Fishing is a side activity in a social town game. Prioritize comfortable **10–30 minute sessions**, alongside talking and other activities; do not over-engineer it.
- **SELL.dailyCap = 3,000**, superseding the 2,500 proposal. First add a separate absolute **2,000,000** saved-balance maximum. Step 1 introduces only that independent balance bound; step 2 applies the lower daily cap.
- Local dev switches to **v2 through the coherent reset**, with no real-player transition machinery. Freeze v1 kernel/vectors and keep ticket.version dispatch for future versions. The live-transition design is deferred as a post-launch blueprint, not implementation scope.
- V2 legend weight **0.9** (from 3.5), Nice multiplier 1.8: analytic legend-tier chance **1.680%**, roughly 1.5–1.6% sellable legends. Other tier coefficients/species/sizes/bands stay the same; renormalization slightly raises the other probabilities, including unsellable gods.
- Free-only wait min **1.98 s**, spread **3.15 s**, floor **1.4 s**, Nice wait ×0.6; fill **0.37/s**, drain **0.22/s**. Preserve strike windows, 900-ms gauge, Nice band, species star ×1.15 and exact Dalbit behavior.
- Catchability validation: bounded speed/acceleration, controller tests at **60/30/20 fps with latency**, then Teera's iPhone test. **No formal reachability proof or universal all-trajectory claim.**
- Gen stays buyer, Minato keeps food; Book stays server-only paid sales, 27 kinds. No cards/rewards/town/production release. Local + emulator only on dev-test-id.

Offline analysis under `analysis/` remains planning evidence, not game code. Its original 1,000-session samples are unchanged; step 4 adds 10/20/30-minute reporting at the approved cap using actual implemented v2 behavior.

## 100,000-roll table first

**100,000 rolls per row**, 2,000,000 total across v1/v2, day/night and all five canonical cast states. Independent owner seeds per 8,192-card block; no single-window wrap counted as more samples. Bangkok noon/22:00 on 2026-10-30; fixed public planning-only HMAC key. A separate **100,000-case exact parity check** matches the analysis's v1 kernel against the actual shared v1 roll (fish, size, baseDiff, big). The candidate v2 changes only legend weight and uses a v2 seed/PRNG domain.

Percent of all rolls, including non-sellable treasures/gods; legend tier includes treasure chest. Day/night differences below are finite sample variation; these tier weights have identical analytic probabilities in the current day/night pools. There are no season-restricted kinds in the frozen v1 snapshot; no new seasonal content is proposed.

| Version | Time | Cast | Common % | Rare % | Epic % | Legend % | God % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| v1 | day | weak-near | 77.588 | 18.231 | 3.983 | 0.193 | 0.005 |
| v1 | day | normal-near | 61.616 | 26.903 | 10.357 | 1.045 | 0.079 |
| v1 | day | normal-mid | 60.033 | 26.275 | 10.066 | 3.549 | 0.077 |
| v1 | day | normal-far | 59.899 | 26.213 | 10.054 | 3.549 | 0.285 |
| v1 | day | Nice-far | 47.289 | 30.965 | 14.887 | 6.259 | 0.600 |
| v1 | night | weak-near | 77.816 | 17.989 | 4.001 | 0.190 | 0.004 |
| v1 | night | normal-near | 62.068 | 26.639 | 10.208 | 1.015 | 0.070 |
| v1 | night | normal-mid | 60.579 | 25.913 | 9.965 | 3.476 | 0.067 |
| v1 | night | normal-far | 60.434 | 25.857 | 9.926 | 3.502 | 0.281 |
| v1 | night | Nice-far | 48.008 | 30.500 | 14.751 | 6.185 | 0.556 |
| v2 | day | weak-near | 77.864 | 18.130 | 3.948 | 0.055 | 0.003 |
| v2 | day | normal-near | 62.349 | 26.932 | 10.362 | 0.280 | 0.077 |
| v2 | day | normal-mid | 61.939 | 26.782 | 10.302 | 0.900 | 0.077 |
| v2 | day | normal-far | 61.780 | 26.722 | 10.280 | 0.911 | 0.307 |
| v2 | day | Nice-far | 49.671 | 32.522 | 15.548 | 1.641 | 0.618 |
| v2 | night | weak-near | 77.826 | 18.111 | 4.014 | 0.046 | 0.003 |
| v2 | night | normal-near | 62.395 | 26.805 | 10.450 | 0.285 | 0.065 |
| v2 | night | normal-mid | 61.984 | 26.666 | 10.325 | 0.961 | 0.064 |
| v2 | night | normal-far | 61.849 | 26.603 | 10.321 | 0.936 | 0.291 |
| v2 | night | Nice-far | 49.914 | 32.214 | 15.547 | 1.681 | 0.644 |

Nice analytic legend probability: v1 `6.3 / 101.1 = 6.231%`; v2 `1.62 / 96.42 = 1.680%`. The candidate Nice samples contain **1,641/day and 1,681/night** legend-tier rolls; **1,516/day and 1,593/night** sellable legends. No claim that 100,000 sampled rolls prove a universal distribution or catchability. The implementation must retain golden vectors and browser/server parity, then rerun this table using its actual v2 kernel.

## Honest coins/hour model

These are **planning estimates, not observed earnings or measured human skill/travel times**. Each row uses 1,000 deterministic sessions over 28 Bangkok market days, half daytime/half nighttime. Honest means a random starting index followed sequentially, quality chosen before the hidden result, no seed peeking, no index skipping or selective replay. One session represents the whole modeled day's fishing; counters start at zero, so multiple sessions that day cannot each earn the fresh-day amount.

Use actual `marketOf`/`quoteFish`: tier base, rounded size price, wanted bonus, per-species glut and freshness at Gen. Preserve epic 10/day, legend 2/day, god unsellable, 40 accepted operations/day and a base 10-slot cooler. No shopping/story/ice operations are spent in the primary model; these would reduce the shared operation budget. No ice costs: all primary/sensitivity fish arrive fresh, so the simulated spoil count is zero. Report **gross fishing coins**, not net worth or income from story. A capped valid fish can remain unrecorded in the Book; selling, not merely catching it, is still required.

Cycle approximation in seconds:

`aim + flight + bite wait + reaction + reel + catch-card/idle + amortized Gen trip`

- Aim `0.9 × distance`; flight `0.07 + 0.34 + 0.32 × distance` from existing release/flight scheduling. Reaction is assumed 0.28 s.
- Wait uses the real formula, Nice ×0.6, floor 1.4 s; v2 multiplies the min/spread by 0.9.
- Reel estimate `0.7 / (q × fill − (1−q) × 0.22) + 0.7`, with q = assumed in-net share minus 0.015 per difficulty above 1. This is an average-occupancy approximation, **not a minigame simulation or catchability proof**.
- Failures consume the same estimated cycle as wins (conservative for early misses). End at Gen if the final one-way trip fits; unsold final inventory earns zero. Full trips include return time; final trip is half that. Tier-capped fish are released after Gen refuses them, allowing the next trip.

| Assumption | Casual | Regular | Skilled |
| --- | ---: | ---: | ---: |
| Weak / near / mid / far / Nice cast share % | 5/20/25/35/15 | 2/13/20/30/35 | 0/8/12/20/60 |
| Catch success by difficulty 1–5 % | 96/90/80/65/50 | 99/96/90/82/72 | 99.5/99/97/93/88 |
| Base in-net share | 0.65 | 0.75 | 0.85 |
| Catch-card read + other idle seconds | 4+3 | 2.5+1.5 | 1.5+0.8 |
| Gen round-trip seconds incl. interaction | 100 | 75 | 50 |

Primary estimates have no assumed star advantage; the 100%-success sensitivity below is an upper bound on improving strike success at the same pace, not a measured star effect. q, success, travel and idle require calibration on Teera's phone before treating any income estimate as a forecast.

**Daily coin cap removed for these estimates; tier and operation caps retained.** Coins/hour means total coins in a real elapsed one-hour session, including trips and failures. Thirty-minute values are not doubled: glut and tier caps make the second half-hour worth less.

| Profile | v1 mean /30 min | v2 mean /30 min | v2 P95 /30 min | v1 mean /hour | v2 mean /hour | v2 P95 /hour | v2 attempts /hour | v2 paid /hour |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| casual | 965 | 843 | 1,193 | 1,733 | 1,533 | 1,946 | 153 | 98 |
| regular | 1,589 | 1,375 | 1,835 | 2,257 | 2,104 | 2,446 | 199 | 135 |
| skilled | 2,000 | 1,837 | 2,182 | 2,633 | 2,651 | 2,918 | 261 | 178 |

The v2 profile produces roughly **4% more attempts** in this model, while lower legend frequency reduces half-hour earnings. It does not promise a 10% faster complete loop. Capped tiers and glut explain why skilled v2 one-hour income can resemble/exceed v1 despite rarer legends.

Sensitivity, v2 with no daily coin cap:

| Change | Mean coins | P95 coins |
| --- | ---: | ---: |
| Regular 60 min, 20-slot cooler | 2,254 | 2,586 |
| Regular 60 min, half trip time | 2,297 | 2,613 |
| Regular 60 min, double trip time | 1,829 | 2,202 |
| Skilled 60 min, 20-slot cooler | 2,852 | 3,137 |
| Regular 60 min, 100% catch success | 2,261 | 2,556 |
| Skilled 60 min, all Nice + 100% catch success | 2,828 | 3,102 |
| Regular 120 min | 3,109 | 3,383 |
| Skilled 120 min (40-op budget nearly exhausted) | 3,923 | 4,227 |
| Casual 30 min, double trip time | 685 | 1,005 |

The two-hour sensitivities start at noon to avoid conflating the result with a Bangkok-day reset. Larger coolers/trips and perfect-success cases matter; ice, long idle breaks, multi-session retention, actual travel measurements and frame-level catch success need follow-up calibration. A person playing two honest hours can exceed 3,000; there is no universal honest “day” without a stated play-time assumption.

## Approved daily cap: 3,000

**Approved: 3,000 per ID per Bangkok day.** Short social-game sessions take priority. The earlier alternatives remain in the table as comparison evidence; 2,500 is superseded.

| Proposed cap | Casual 30m clipped | Regular 30m clipped | Skilled 30m clipped | Regular 60m clipped | Skilled 60m clipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,500 | 0.4% | 31.2% | 90.2% | 100.0% | 100.0% |
| 2,000 | 0.0% | 0.3% | 30.8% | 68.0% | 99.5% |
| 2,500 | 0.0% | 0.0% | 0.0% | 1.6% | 81.5% |
| 3,000 | 0.0% | 0.0% | 0.0% | 0.0% | 1.5% |

“Clipped” means at least one otherwise-payable fish was refused, not an exact cap payout; each cell samples 1,000 sessions. At **3,000**, none of the modeled 30-minute sessions or baseline casual/regular hours clip; **1.5%** of baseline skilled hours clip. Skilled one-hour mean is 2,650 versus 2,651 uncapped. These are model estimates, not measured phone play. Larger coolers/longer sessions can still hit the cap.

3,000 lowers the per-ID attacker ceiling **40%** from 5,000 and is ~2.2× the modeled regular half-hour (1,375), leaving short-session headroom. Look-ahead, cast-state choice and client minigame bypass remain possible; rarity is not the security boundary. The server's gross-earned budget is. Spending cannot refill it; Bangkok midnight starts a new allowance, not a rolling 24-hour reset. Multiple IDs and story income are outside this fishing cap.

No shop repricing in this step. Cooler upgrades still cost 400/900, the 900 Sashimi boat remains attainable, and a full-price 2,400 special fits under the approved daily allowance. Capped unpaid fish do not award Book progress/stars; long-session Book pacing is a real cost of a lower cap. Gen's existing kept/daily-cap message and retry flow remain.

Important implementation correction: `rules.ts` previously clamps/validates saved coins with `SELL.dailyCap × 400`. Step 1 replaces that dependency with `ECONOMY_SAVE.maxBalance = 2_000_000` in both normalization and strict write guards, before changing SELL.dailyCap. Preserve saved balances, existing strict invalid-balance checks and exact receipts. Step 1 leaves daily-counter normalization unchanged. Step 2 resets the dev dataset coherently, so no migration/history preservation machinery is required; an over-cap test fixture must still have zero new allowance. Exact old receipts retain their old result and never increment anything. A future live coin-policy change needs its own release decision. Nothing is deployed or reset remotely now.

## Current scope: local reset to v2

The shop has never opened to real players. Only Teera's local dev saves hold v1 tickets, so **do not implement a live transition**. Step 2 makes v2 the issued/current version with the explicit coherent local `npm run dev:reset-fishing` reset: stop dev, reset policy + saves/logs, restart, reload every game tab so the existing reset token clears the cooler, pending trade, deck cursor and read-only caches together. Preserve identity/recovery words. Do not reset a live paid-index set independently or silently convert v1 pending requests. No reset is performed in step 1.

Keep the v1 kernel, PRNG/domain behavior and vectors frozen in the repo, plus explicit `ticket.version` dispatch. Add the separate v2 snapshot/domain with legend weight 0.9. The active local dev dataset after reset is v2 only; new v1 redemption can refuse as unsupported for that dataset, while v1 roll regression fixtures remain runnable. Exact retries within a dataset still replay their original operation. Keep current/previous **v2** windows, five-minute duration, paid bits, shared daily/tier caps and the same atomic sale/Book/log flow.

No v2 cutover pin/env var, timed issuance switch, mixed-version window handling, v1-save migration or cutover rehearsal now. No Book/wire/Firestore permission change is planned. Keep the already-required first-sale redeemFromDeckId gate; it is not a new version cutover. Preserve the old design below only as a blueprint for the first post-launch version change.

## Free-only pacing and practical catchability

Use a small free-only profile, snapshotted per cast, with the approved wait/fill numbers above. Preserve story/default TUNING and first-catch behavior. Practice remains unsellable and cannot write the Book. Keep net width 0.30, net max speed 1.1, gravity 1.6, hold lift 3.0 and tap controls. Species star remains strike-only ×1.15; it never affects deck odds or verified fish/size/baseDiff/big.

Bound free fish speed at **0.65 units/s**, acceleration **1.0 units/s²**, continuous position/velocity and minimum target hold **0.75 s**; use existing easier bounds where lower. These stay below net speed 1.1 and controlled acceleration 1.4 up / 1.6 down. Faster feel comes from waits/fill, not tighter reaction windows or fish outrunning the controls.

Use a causal controller (visible state only, no future RNG) across difficulties 1–5, big fish, stars, rail reversals/extreme target streams and seeded sweeps at **60/30/20 fps**, including **150-ms input latency**. Keep strike windows at 0.88…0.40 s (starred ×1.15). Failures found by these tests must be fixed by making the bounded profile easier. No formal reachability solver/proof or “all possible trajectories proven” claim. Teera's physical iPhone test confirms comfortable, slightly faster play; finite automated coverage cannot replace feel testing. Preserve current pause/background/duration fallback rules.

## Revised steps and review stops

| Step | Scope/files | Validation and stop |
| --- | --- | --- |
| **1. Independent saved balance (build now)** | `economyConfig.ts`: replace balanceCapDays with absolute `maxBalance: 2_000_000`; `server/saves/rules.ts`: normalize/read and strict write guard use it. Update affected test fixtures; add reduced-cap balance regressions through real handlers and emulator. Docs/context. | With dailyCap temporarily 3,000, preserve 1,500,000 and exact 2,000,000; clamp bad reads but refuse invalid/overflow writes; load writes nothing; buy/ice/story/sale and Retry preserve savings/payment atomicity. **Daily cap remains 5,000; v1/reset/odds/gameplay untouched in this step.** |
| **2. V2 odds, version dispatch, local reset and 3,000 cap** | New `deckRollV2.ts`; small dispatcher in `deckRoll.ts`; `deckConfig.ts`, issuance/ticket/cache/current-version readers; coherent dev policy/reset tests; shared `economyConfig.ts` cap. Update frozen-v1 tests to call v1 explicitly; no live cutover code. | Coherent reset clears local policy/saves/logs and corresponding game caches; new issued version 2, v1 kernel/vectors unchanged; actual v2 100,000-roll table per state/day/night, browser/server parity and Nice edges. Verified Gen sale/paid bits/Book, duplicate devices, current/previous v2, tier/coin cap races, exact Retry. No automatic dev reset or shared DB operation. |
| **3. Small free-only pacing profile** | New free tuning data; explicit opt-in state/profile in `story/fishing.ts` and `fishingSession.ts`; free fallback uses the approved active table. Avoid UI/rendering changes unless needed to carry the profile. | Controller sweeps at 60/30/20 fps + 150-ms latency; bounded velocity/acceleration/target holds; difficulty/big/star cases; exact story/default parity; real session timing and practice/ice/Bag regressions. No formal proof machinery. Teera tests iPhone after review. |
| **4. Short-session model + final packet** | Offline model/results, tests/review/technical docs and AI_CONTEXT. Use actual v2 kernel and controller-derived durations; report assumptions for human skill/travel. | Focus 10/20/30-minute gross coins, P50/P95, cap clipping and Gen trips; retain one-hour/large-cooler sensitivity. Full unit/type/build/emulator run and catch → Gen → Book/Retry checks. Record Teera's iPhone result separately; no cutover rehearsal or release/main merge. |

After each step: `npm test`, `npx tsc -b`, `npm run build`; `npm run test:rules` for changed server/save/reset/version/cap behavior (required steps 1, 2, 4; step 3 if it changes server semantics). Commit/push dev-test-id, then **STOP for review**. Scope now: step 1 only. No actual dev save reset this turn. No new runtime deps, archive/migration, cards/rewards, town or ECO-04 deployment work.

## Deferred/rejected work

The 2,500 cap is superseded by Teera's approved 3,000. Live version cutover infrastructure is deferred because there are no real v1 holders. Formal reachability proof/solver is removed: bounded motion + controller tests + phone review is the approved validation. Retain the blueprint below for the first **post-launch** version change; it creates no implementation tasks in this stage.

## Reproduce and review limits

From the repository root on Node 24 with dependencies installed:

```sh
node docs/ai/analysis/ECO-03-v2-model.mjs
```

Outputs `analysis/ECO-03-v2-model-results.json` with seed, source SHA, exact counts, analytic probabilities, assumptions, percentiles, sensitivity and cap clipping. It needs no network, identity secret, emulator or player database and performs no game/server write. It imports the real frozen v1 and price functions; v2 remains a scratch candidate kernel. This is deliberately separate from production tests/runtime. The completed step-4 packet contains the fresh application test results; these model runs are not added to the 283-test count.

Status: approved with the simplifications recorded above. Step 1 begins with the independent balance maximum; wait for review before step 2. The active daily cap stays 5,000 until step 2, then becomes the approved 3,000.

## Step 1 review result — 2026-10-30

Built only the independent saved-balance bound: `ECONOMY_SAVE.maxBalance = 2_000_000`, used by `normalizePlayer` and `checkedCoinBalance`. Removed the runtime balanceCapDays dependency and updated existing maximum-size/overflow fixtures. Read clamping and strict write refusal retain their prior semantics; the absolute value is unchanged. The daily cap is still **5,000** for this step; approved **3,000** follows in step 2 before the v2 local reset.

Two added unit/API tests:

- `absolute balance maximum survives a reduced daily earnings cap on reads and strict writes`: temporarily dailyCap=3,000, preserve 1,500,000/exact 2,000,000, clamp over-limit reads, reject invalid/overflow writes. The test reproduced the pre-fix 1,500,000 → 1,200,000 loss.
- `reduced daily cap preserves savings through load, Gen sale, exact Retry, buy, ice and story writes`: real handler, unchanged stored load, original receipt after cap change with no second payment, purchases subtract only price, ice/story preserve balance/Book/bits. It also failed before the fix.

Added emulator test `absolute balance limit: reduced daily cap preserves real sale/buy/Retry balances and refuses overflow atomically`: real Firestore handler transactions preserve >1.2m savings at dailyCap=3,000, reach exactly 2m, then refuse overflow without player/Book/bit/log writes. Existing race/receipt/permission/4-ms-boundary coverage stays green.

Validation: **285 unit/integration tests pass, 0 failed/cancelled/skipped** (283 + 2); `npx tsc -b` and `npm run build` pass, including four compiled Vercel API smoke checks. **10/10 emulator tests pass**, command exit 0 (9 + 1), demo-lumen-bay only. The older Firebase CLI uses the previously isolated XDG_CONFIG_HOME with update checks disabled; no global config or production credentials required. `git diff --check` passes.

No actual dev save reset, v2 issuance/odds/profile/dispatch/cutover implementation, wire/rules permission change, UI, story, Book, cap activation, main merge or shared-database write. No physical iPhone test was performed; that remains the pacing review in step 3. Commit/push dev-test-id, then stop for review.

## Post-launch version-change blueprint — deferred, DO NOT BUILD NOW

The original transition design follows for future reference only. It is unnecessary for this pre-launch local reset and is not an approval to build a cutover pin, mixed-version markers or rehearsal now.

### Future live transition: keep v1 payable without losing protection

1. Add an explicit supported-version registry. Freeze `deckRollV1.ts`, its PRNG domain, calendar, tiers/species/size/difficulty math and golden vectors. Add separate `deckRollV2.ts`; shared dispatch chooses **ticket.version**, never whichever config is newest. Version enters both HMAC derivation and the v2 PRNG domain.
2. Pin **D = v2FromDeckId** once, at a full six-hour window. Windows `<D` issue/verify v1; windows `>=D` issue/verify v2. Never issue both versions for one window, move D after issuance or change a live window's seed/meaning. This is separate from the existing first-sale `redeemFromDeckId` cutoff.
3. Proposed server-only configuration `FISHING_DECK_V2_FROM_DECK_ID` is fixed for the rollout and projected as non-secret policy where the client needs it. Missing/invalid policy fails closed for new issuance/redemptions once v2 support is enabled; exact committed replay remains first. Vercel settings remain ECO-04 work. Preparation keeps normal issuance on v1; only isolated fixtures use a v2 policy until v2 coefficients are frozen and activation is approved. Then local dev pins a stable future D once; injected-clock tests cross it immediately, with no six-hour test wait and no automatic save reset. Current-window dev sales still work using v1 before D. Never schedule an automatic real v2 flip during a review pause.
4. Update ticket/cache/paid-bit readers to accept supported versions. Validate each live slot's version against its deckId's pinned mapping; never filter an unrecognized active slot into “empty”. **Current-v2 + previous-v1 must coexist** as the same two 1,024-byte maps, without clearing either or adding an extra per-version allowance. Missing empty slots use their window's assigned version. Future/malformed/conflicting slots refuse without writes.
5. New redemption checks remain current/previous, five-minute cast, freshness and shared caps. Cast already in flight snapshots its version/profile; server rebuilds v1 with v1 even when caught/sold after D. Local cooler parsing must keep v1 tickets. In-flight v1 waiting/reel behavior also stays unchanged. Uncertain pending requests retain their original bytes/body/operationId; replay lookup precedes new policy/roll/price/time/cap checks. Structural wire parsing cannot reject a historical version before replay.
6. V1 last window ends E = D×6h. New v1 redemptions end before E+65m10s; its paid bits retire at E+6h, with **294m50s margin**. Retain v1 code/vectors rather than eagerly deleting them; saved receipts replay indefinitely. Coins/day, tier caps and lifetime Book counters span both versions. No migration, new Book version, archival fields or reset of paid bits.

Firestore stored shapes and permissions stay the same: `{version,deckId,bits}` slots, `{kind:{best,sold}}`, existing coins/econ/log documents; a version value of 2 is newly supported. Server-only policy may add a non-secret v2FromDeckId response field; the sale intent's ticket shape does not change. Owner-read/client-write-denied rules stay unchanged. Still player+log, 2 reads + 2 writes before retries.
