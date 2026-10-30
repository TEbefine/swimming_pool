# ECO-03 stage 6 — deck v2 tuning proposal

2026-10-30 · **PLAN ONLY; awaiting Teera's OK.** Base application: dev-test-id b87ba82. Step 4's [final verification packet](ECO-03-final-verification.md) is complete. This proposal does not change runtime configuration, sale validation, the wire, odds, TUNING, Book or UI.

## Proposed decisions

- Freeze v1 for outstanding tickets and historical receipts. Issue **v2 at one fixed full six-hour deck boundary**, with both verifiers supported through the transition.
- In v2 only, reduce legend tier weight **3.5 → 0.9**, retaining its Nice multiplier 1.8. This gives **1.680% legend-tier rolls even with Nice**; approximately 1.5–1.6% are sellable legends. Common/rare/epic/god weights and all species, habitats, sizes and cast bands retain their coefficients. Renormalization slightly increases other tiers' probabilities, including god; gods still never sell.
- Make free fishing slightly faster through **10% shorter bite waits** and meter fill **0.34 → 0.37/s**. Preserve strike windows, gauge/Nice timing and the 1.15× species star. Add a bounded, provably catchable free-only movement profile, without speeding fish beyond the player's controls. Dalbit keeps its exact existing behavior.
- Start with **SELL.dailyCap = 2,500 per Player ID per Bangkok day**, shared by both deck versions/devices. This halves the exploitable 5,000 ceiling and protects the modeled 30-minute day. It deliberately caps longer skilled sessions; the tradeoff and 2,000/3,000 alternatives are below.
- Before lowering the earnings cap, separate the saved-balance ceiling from it and retain the existing absolute **2,000,000** balance bound. No repricing goods, tier caps, stars or Book changes.

The offline scripts/data in `analysis/` are reproducible planning experiments. They are not imported by the game/server/build and do not constitute the v2 implementation.

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

## Daily cap recommendation and cost

**Propose 2,500/day**, treating ~30 minutes as the initial ordinary fishing day, with headroom for most regular one-hour sessions. This is a balance decision for Teera to approve, not a deduction that honest players never earn more.

| Proposed cap | Casual 30m clipped | Regular 30m clipped | Skilled 30m clipped | Regular 60m clipped | Skilled 60m clipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,500 | 0.4% | 31.2% | 90.2% | 100.0% | 100.0% |
| 2,000 | 0.0% | 0.3% | 30.8% | 68.0% | 99.5% |
| 2,500 | 0.0% | 0.0% | 0.0% | 1.6% | 81.5% |
| 3,000 | 0.0% | 0.0% | 0.0% | 0.0% | 1.5% |

“Clipped” means at least one otherwise-payable fish was refused for coin budget, not that the cap is paid exactly (whole-fish prices leave small gaps). Every cell is a sample proportion over 1,000 sessions. 2,500 clipped **none** of the sampled 30-minute sessions and **1.6%** of regular hour sessions, but **81.5%** of skilled hour sessions. Their mean falls from 2,651 to 2,465 (~7%). At 2,000, 30.8% of skilled half-hours clip, so I do not recommend it with current prices. If protecting a skilled hour is the priority, **3,000** is the alternative: 1.5% of those baseline sessions clip, but it leaves a 20% larger attacker ceiling than 2,500.

Current 5,000 is ~3.6× the modeled regular half-hour (1,375). Proposed 2,500 is ~1.8×. An attacker remains able to look ahead, choose among the five cast states and bypass client minigame effort; rarer rolls do not secure the deck. **The server's gross-earned budget is the hard ceiling** on Gen sale income per ID/day. Keep earnedToday shared across versions/windows/devices; spending cannot reopen it. Bangkok midnight starts a new allowance: this is not a rolling-24-hour ceiling, and multiple IDs are not bounded together. Story income is outside this fishing cap.

No shop repricing in this step. Cooler upgrades still cost 400/900, the 900 Sashimi boat remains attainable, and a full-price 2,400 special consumes almost an entire capped day. Capped unpaid fish do not award Book progress/stars; long-session Book pacing is a real cost of a lower cap. Gen's existing kept/daily-cap message and retry flow remain.

Important implementation correction: `rules.ts` currently clamps/validates saved coins with `SELL.dailyCap × 400`. Replace that dependency with a separate shared absolute **2,000,000** balance limit before changing SELL.dailyCap. Preserve existing coins and actual earnedToday history; an already-over-new-cap day has zero remaining allowance, never a fresh budget. Exact old receipts retain their old result and never increment anything. A future live coin-policy change should begin at a Bangkok-day boundary; this differs from the six-hour version boundary. Nothing is deployed now.

## Keep v1 payable without losing protection

1. Add an explicit supported-version registry. Freeze `deckRollV1.ts`, its PRNG domain, calendar, tiers/species/size/difficulty math and golden vectors. Add separate `deckRollV2.ts`; shared dispatch chooses **ticket.version**, never whichever config is newest. Version enters both HMAC derivation and the v2 PRNG domain.
2. Pin **D = v2FromDeckId** once, at a full six-hour window. Windows `<D` issue/verify v1; windows `>=D` issue/verify v2. Never issue both versions for one window, move D after issuance or change a live window's seed/meaning. This is separate from the existing first-sale `redeemFromDeckId` cutoff.
3. Proposed server-only configuration `FISHING_DECK_V2_FROM_DECK_ID` is fixed for the rollout and projected as non-secret policy where the client needs it. Missing/invalid policy fails closed for new issuance/redemptions once v2 support is enabled; exact committed replay remains first. Vercel settings remain ECO-04 work. Preparation keeps normal issuance on v1; only isolated fixtures use a v2 policy until v2 coefficients are frozen and activation is approved. Then local dev pins a stable future D once; injected-clock tests cross it immediately, with no six-hour test wait and no automatic save reset. Current-window dev sales still work using v1 before D. Never schedule an automatic real v2 flip during a review pause.
4. Update ticket/cache/paid-bit readers to accept supported versions. Validate each live slot's version against its deckId's pinned mapping; never filter an unrecognized active slot into “empty”. **Current-v2 + previous-v1 must coexist** as the same two 1,024-byte maps, without clearing either or adding an extra per-version allowance. Missing empty slots use their window's assigned version. Future/malformed/conflicting slots refuse without writes.
5. New redemption checks remain current/previous, five-minute cast, freshness and shared caps. Cast already in flight snapshots its version/profile; server rebuilds v1 with v1 even when caught/sold after D. Local cooler parsing must keep v1 tickets. In-flight v1 waiting/reel behavior also stays unchanged. Uncertain pending requests retain their original bytes/body/operationId; replay lookup precedes new policy/roll/price/time/cap checks. Structural wire parsing cannot reject a historical version before replay.
6. V1 last window ends E = D×6h. New v1 redemptions end before E+65m10s; its paid bits retire at E+6h, with **294m50s margin**. Retain v1 code/vectors rather than eagerly deleting them; saved receipts replay indefinitely. Coins/day, tier caps and lifetime Book counters span both versions. No migration, new Book version, archival fields or reset of paid bits.

Firestore stored shapes and permissions stay the same: `{version,deckId,bits}` slots, `{kind:{best,sold}}`, existing coins/econ/log documents; a version value of 2 is newly supported. Server-only policy may add a non-secret v2FromDeckId response field; the sale intent's ticket shape does not change. Owner-read/client-write-denied rules stay unchanged. Still player+log, 2 reads + 2 writes before retries.

## Faster free minigame, with a real catchability requirement

Introduce a **free-only profile**, snapshotted at cast start; do not edit the default story TUNING or let opts/table absence fall into free behavior. V1 issued casts retain their existing profile. V2 free practice can use the active free profile but remains unsellable and cannot write the Book.

Candidate start values: wait min **1.98 s**, spread **3.15 s**, floor **1.4 s**, Nice wait ×0.6; fill **0.37/s**, drain **0.22/s**. Preserve 900-ms gauge, 0.80–0.92 Nice band, strike windows 0.88…0.40 s and per-species star ×1.15. Keep net width 0.30, tap/hold/gravity controls and maximum net speed 1.1. No odds, size or verified baseDiff/big bonus depends on star or minigame physics.

“Always catchable” means **every allowed free trajectory has a causal input strategy that can land it**, given the documented foreground frame/input budget; it does not mean every human attempt wins. A Monte Carlo success rate cannot establish this.

- Start with free fish speed bounded by **0.65 units/s** and acceleration by **1.0 units/s²** (below the net's controlled acceleration 1.4 up / 1.6 down), continuous position/velocity, and minimum target-hold **0.75 s**. Use the easier existing limits where lower. Faster pacing comes from waits/fill, rather than unavoidable movement or shorter reaction windows.
- Those numbers alone are **not a proof**. Before accepting the profile, derive a conservative reachable-state/tracking-error bound covering initial reel alignment, rail turns, worst direction reversals, progress reserve and input delay; show the bound fits the net/meter safety margin. Use outward-rounded interval/reachability checks or a conservative trajectory envelope so the argument covers all allowed target choices, not just a finite seed sample. If the envelope fails, reduce fish movement/reversal bounds until it holds; do not ship the guarantee on sampled success alone.
- Test an observable-state controller with no future RNG access at 60/30/20-fps steps, 150-ms bounded input latency, difficulties 1–5, big fish, stars on/off, extreme target streams, rail reversals and a large seed sweep. Prove the strike window still admits that latency. Snapshot and preserve every default/story transition and first-catch behavior. Background/stalled tabs retain clock/duration practice rules; no promise can cover arbitrarily delayed input.
- Teera's physical iPhone pass must confirm comfortable catchability and a modest faster feel. The coins model must then use actual attempt durations, failures and Gen-trip timings, replacing its assumed q/success inputs. If the guaranteed profile changes duration materially, rerun the model and reconsider 2,500 **before** calling tuning finished.

## Four review-gated implementation steps, after approval

| Step | Changes/files | Required evidence, then stop |
| --- | --- | --- |
| 1. Version plumbing only | `deckConfig.ts`, `deckRoll.ts`, new version-policy/dispatcher helpers; server fishing issuance, `catchTicket.ts`, `deckStore.ts`, `freeCast.ts`, `deckRedemptions.ts`, `sales.ts`, `rules.ts`, dev policy; economy response/store/sellability projection; API build fixtures. Prepare the v2 snapshot/registry using isolated fixtures; keep normal issuance on v1 and do not activate a timed v2 switch. | V1 hashes/vectors unchanged; v1 cache/cooler/pending survives; cross-version/current-previous slots and cutover owner/window mismatch tests; emulator same-index/race/4-ms-boundary/old-receipt tests. No version flip in a live window. |
| 2. Candidate odds + free profile | New `deckRollV2.ts` and `freeFishingTuning.ts`; explicit profile state in `story/fishing.ts` and `fishingSession.ts`; active free fallback table selection without touching v1 snapshot; targeted game rendering only if additional profile state needs it. | Actual v2 100,000-roll table for all five states, day/night and calendar edges; shared browser/server vectors/parity; Nice-edge session tests; all-trajectory catchability argument + controller tests; exact story parity. Re-run coins model with observed simulation durations. |
| 3. Daily cap + honest pacing review | `economyConfig.ts`, `server/saves/rules.ts`/`sales.ts`, relevant quote/client display assumptions, analysis data/docs. Add separate absolute balance maximum; set proposed cap only after model review. | Saved 2,000,000-limit balances preserved, no clamped savings/history; daily budget shared v1/v2/devices, no refill by spending/rollover, exact Retry unchanged; emulator concurrent last-budget wins once; old receipts replay after cap change. Show phone/real-controller pace vs assumptions and Book/shop tradeoffs. |
| 4. Local cutover rehearsal + final packet | Test suites, model/technical docs, AI_CONTEXT; stable D/cutoff configuration in isolated test fixtures. No Preview writes, production env change or main merge. | Real pending v1 sale → D → v2 sale, both maps intact, unchanged Book counts/stars, duplicate refused, old receipt after retirement; physical phone catch → Gen → Book when available. Record counts, model error and unresolved limitations for ECO-04. |

Step 1's v2 snapshot is preparation, not active tuning; normal issuance remains v1 through review pauses; step 2 must not mutate it after any v2 issuance. Use fixed pre-activation test fixtures for candidate iterations. If a published active version's roll data changes again, it needs a new deck version.

After each step: `npm test`, `npx tsc -b`, `npm run build`, plus `npm run test:rules` for transaction/version/cap work (steps 1, 3 and 4; rerun in step 2 if server semantics change). Commit/push **dev-test-id only**, then stop for Teera's review. Do not implement these steps until this plan is approved. No cards, rewards, town stock/VAT, story tuning, shared-database tests or ECO-04 release work.

## Reproduce and review limits

From the repository root on Node 24 with dependencies installed:

```sh
node docs/ai/analysis/ECO-03-v2-model.mjs
```

Outputs `analysis/ECO-03-v2-model-results.json` with seed, source SHA, exact counts, analytic probabilities, assumptions, percentiles, sensitivity and cap clipping. It needs no network, identity secret, emulator or player database and performs no game/server write. It imports the real frozen v1 and price functions; v2 remains a scratch candidate kernel. This is deliberately separate from production tests/runtime. The completed step-4 packet contains the fresh application test results; these model runs are not added to the 283-test count.

Approval requested: the fixed-window v1/v2 transition, candidate legend weight/profile, **2,500/day with the stated long-session tradeoff**, and the four stops above. The game still runs unchanged v1/5,000 until implementation is approved.
