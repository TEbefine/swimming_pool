# ECO-03 stage 5 + fresh Fish Book — approved, simplified plan

2026-10-29 · Owner: Teera · Base: main a9b4f37 / PR #23, fast-forwarded into dev-test-id.

Work stays on **dev-test-id**, tested only in local dev + the Firestore emulator. Do not merge to main until ECO-04 is ready. No shared-database Preview writes or environment changes.

## Decisions and removed work

- **Gen stays the buyer exactly as today.** No move of selling, counters, dialogue or receipts. Minato keeps food. New-kind catch text: “New! Sell it to Gen to add it to your Fish Book.”
- Only Teera has saves; a full fresh start is allowed. **No archive, Legacy marker, migration, lazy versioning or old-field preservation code/tests.** Old Book/pending data can be ignored or reset. The abandoned namespace/preservation draft is removed.
- The new stored Book is simply `fishBook: { [kind]: { best, sold } }`. Presence means found; no caught flag or per-entry/version metadata. Only paid, server-verified sale lines can update it.
- The Book contains **27** supported, ready, sellable kinds: common 5 / rare 6 / epic 8 / legend 8. Bottle, treasure, fossil and god-tier kinds stay in the roll but leave the Book list.
- Shared star thresholds per kind: common **25**, rare **12**, epic **6**, legend **3** verified sales. Lifetime sold is hidden in the UI. A star grants only that kind **1.15× strike time**; deck probabilities, fish/size verification, global TUNING and Dalbit are unchanged.
- Retire Kai/Nami recording, fishbook.record, pending catches and the Book's three-second timestamp path. The old “Book-only” promise is replaced: unticketed/practice catches cannot sell or enter the new Book.
- No card/reward logic or card references in the UI.

## Step 1 — pure foundations (build now, then stop)

Files:

- `src/game/fishing/fishBookConfig.ts`: shared 27-kind catalogue, thresholds and strike multiplier.
- `server/saves/fishBook.ts`: strict bounded `{best,sold}` reader; display projection with best/star only; pure update helper for **server-verified, paid lines**. The helper is not an authenticity endpoint and is not wired to requests in this step.
- `server/saves/deckRedemptions.ts`: canonical bitmap parsing, current/previous-window retention, fixed activation-cutoff checks, duplicate/already-paid detection and immutable paid-bit updates.
- `tests/fishbook.test.mjs`, `tests/deck-redemptions.test.mjs`: pure config/state/boundary/duplicate/size/star tests, without old-data preservation or migration scenarios.
- `scripts/test-api-build.mjs`: supply the new shared source files to the API build fixture where required.

No handler, sale wire, player document, Firestore rule, gameplay, guide flow or UI integration in step 1. Existing runtime remains unchanged. Reset tooling is unnecessary here; tests start from explicit fresh maps.

Book helper rules: a new paid kind starts at `{best: recomputedSize, sold:1}`; later paid lines increment sold and keep max best. No claimed totals, snapshots or best values are taken from the request. Reject unsellable/unknown kinds, illegal sizes and unsafe count overflow. A missing map is fresh; malformed state reads safely but cannot be silently awarded over. There is no old-format conversion.

Paid bits: at most two slots `{version,deckId,bits}`. Each contains 1,024 decoded bytes; together 2,048 bytes / 2,736 padded base64 characters plus metadata. Missing state starts empty; malformed active state fails closed. Old slots retire only by server time, not request order or Bangkok midnight. Helpers must not mutate their input or publish a partial result on error. Activation is injected and fixed; absent activation refuses redemption. Nothing invokes these helpers in the live API yet.

## Step 2 — atomic sale verification and Book writes

Change `server/fishing/deck.ts`, `server/saves/sales.ts`, `handlers.ts`, `rules.ts`, relevant limits/types and local-dev setup.

- Add the existing nested catch ticket to fresh shop.sell requests: version, deckId, castIndex, castInfo and castAt. No client seed/owner/star/Book data is accepted.
- Reuse issuance's exact HMAC seed derivation for the authenticated owner/window/version. In **validateSaleCatch**, recompute with the unchanged shared roll and compare fish/size exactly. Price and record the server-recomputed result.
- Require supported version, safe index `[0,8192)`, canonical distance/Nice, strict cast-window membership, `castAt <= caughtAt`, duration **<=5 minutes**, sale future tolerance **10 seconds**, current/previous window and the fixed activation cutoff. Use castAt for roll/calendar and caughtAt for confirmed-ice freshness.
- Duplicate ticket in a batch, already-paid ticket, missing/mismatched ticket or over-duration claim cannot pay or enter the Book. Validate the full batch first. Spoiled/over-cap valid lines remain kept; only paid lines change money, bits and Book.
- Replace timestamp redemption identity/spacing with `(version,deckId,castIndex)` for verified sales. Two different indices can legitimately share a timestamp across devices.
- Apply the approved Bangkok-day tier caps from existing soldToday: legend **2/day**, epic **10/day**, god **0**. Kept trophy line: “I can’t take another trophy today”. Lifetime Book sold does not reset daily.
- Commit player + immutable operation log together: still **2 reads + 2 writes**, before contention retries. No per-fish document, extra Book write, migration or cleanup write.
- Replay the same operationId/body before time/config/price/marker checks; do not reroll, reprice or increment Book counts on Retry. Never mutate an uncertain pending body or replace it with a fresh ID. Full-reset test data removes the need for old-client data conversion or historical Book migration scaffolding.
- Remove fishbook.record and its exclusive parsers/rules/counters. Stale calls refuse before database access. Keep story/buy/ice behavior and Claude's pending-trade/ice protection.

Use explicit fresh local/emulator saves for the new model. The allowed full reset is a controlled testing/release action, not automatic reset-on-request code. Clear obsolete game/Book/pending caches coherently when resetting; never clear the identity vault or recovery words. Do not reset a live paid-index set while continuing to accept the same outstanding tickets.

Cutoff and old-writer protection remain: stage-4 indices may have been paid without bits. Pin `redeemFromDeckId` to a new full window for activation; missing cutoff fails closed. Keep the cutoff stable across restarts and share the dev-only secret between dev issuance and verification with zero manual setup. Before an eventual real release, retire/disable old writers, reset coherently and activate at the pinned window. Old complete-document Admin writes could otherwise erase new fields/markers even with the old shop closed. **Do not exercise this rollout against the shared database now.**

Retirement proof: deck ends at E; caughtAt < E+5 min, max iced life 60 min, conservative sale tail < E+65 min 10 s. Keep bits until E+360 min, leaving **294 min 50 s**. Replays return saved receipts even after marker retirement.

## Step 3 — read-only client Book, guides and star modifier

Change `freeFish.ts`/Book state helpers, `cloud.ts`, `fishingSession.ts`, the local strike-window input in `fishing.ts`, `FishingHud.tsx`, `FishBook.tsx`, Bag/menu references, and App/guide wiring. Delete `src/game/saves/guideRecord.ts`.

- Stop all catch-time/local/guest Book writes. Use account/revision-scoped authoritative sale/load responses and read-only caches. No speculative entry/star while a sale is uncertain.
- Ignore/remove old Book and unsent pending-catch keys without uploading them; malformed/blocked storage must not crash. No archive or conversion.
- Remove guide record flow/pending badges/counts and obsolete three-second Book normalization. Kai/Nami retain fishing lessons/tips.
- Show known presence, best and star, with the new **27-kind total**. Never show lifetime sold or per-kind catch counts, including labels/tooltips. Keep normal cooler quantities and receipt quantities.
- Display the exact Gen catch message for a new sellable ticketed kind. Unticketed, pre-cutoff and over-duration/practice catches say they cannot sell or enter the Book. Non-sellable catches and full coolers must not promise Book progression.
- Snapshot the server-derived species star for a free cast; apply **1.15× only to its strike window**. No bonus in tickets or shared roll inputs. Example hardest strike: 0.40 s -> 0.46 s. Story/default casts remain unchanged.
- Preserve Gen/Minato roles, existing shop/receipt flow, carried cooler/Bag behavior, server goods expiry, exact pending requests and pending-ice protection.

## Step 4 — full verification and review packet

Pure/API/client coverage:

- Keep deterministic roll vectors/parity and Nice-edge tests green; a star cannot change fish/size/baseDiff/big.
- Test wrong species/size/owner-derived result/index/version/quality/time, future/old/pre-cutoff windows, absent tickets, strict end boundaries and exactly five minutes versus longer.
- Test paid-only Book/count/best updates, mixed paid/kept/invalid batches, all tier caps, midnight, confirmed ice, bitmap retention, malformed state and bounded JSON sizes.
- Test threshold edges 24/25, 11/12, 5/6 and 2/3; per-kind isolation, hidden counts, 27-kind list and story/no-ticket/sandbox exclusion.
- Test lost answer -> reload -> exact Retry: one payment, one sold increment and the original receipt; changed body under the same operationId refuses. No compatibility/archive/preservation suite.
- Retain relevant clock/reservation/storage/ice/Bag regressions. Replace obsolete Book-recording/gap tests in the step that removes their old behavior, rather than changing runtime during step 1.

Real Firestore emulator (demo project, local credentials only), relevant from step 2:

1. Concurrent different operationIds redeeming one index: one payment/Book increment/bit/log. Identical operationIds replay one commit.
2. Concurrent distinct indices for one kind: accumulate counts and max best correctly, including identical timestamps and star crossing.
3. Last-millisecond cast before rollover, catch after it, ice extension, previous-window redemption, midnight, five-minute/freshness edges; historical receipt replay after retirement.
4. Competing last tier allowance/coin budget and transaction retries; no partial award or write on invalid/all-kept requests.
5. Existing owner-read/no-client-write player/log rules, including forged best/sold/paid bits. No permission expansion is needed; Admin enforces the new schema. Retired fishbook.record cannot write.

After **each step**: npm test, npx tsc -b, npm run build; npm run test:rules where database/transaction/rules behavior is affected. Report exact results, commit and push **only dev-test-id**, then **STOP for review**. Step 1 is pure/unwired, so no new emulator scenario is relevant yet. No main merge, shared-database Preview test, remote reset, card/reward logic or production gate change. Deployment/production data reset remains for ECO-04 approval.


## Step 1 review result — 2026-10-29

Built only the pure config/Book/bitmap foundations listed above and the API build-fixture source list. Twelve new tests cover the 27-kind catalogue/settings, fresh best/sold shape, immutable paid-line updates/overflow, per-kind star boundaries/hidden counts, invalid state and size bounds; bitmap bit boundaries, duplicates/reuse, fixed activation and current/previous windows, rollover/midnight, malformed active state and serialized bounds. The preservation/migration draft and its tests were removed.

`npm test`: **273 passed, 0 failed/skipped**. `npx tsc -b`: pass. `npm run build`: pass, including nonce/login/items/fishing-deck smoke checks. Firestore emulator tests are not relevant to this pure, unwired step; they are required for step 2. No data reset, shared-database Preview writes or remote settings changes were performed. Handlers, wire schema, rules, gameplay, counters/dialogue/receipts and UI remain unchanged. Stop here for review after commit/push to dev-test-id.

## Step 2 review result — 2026-10-29

Built the existing-sale-transaction integration only. Fresh sale bodies carry persisted tickets; authenticated owner/window/version seed derivation is shared with issuance. `validateSaleCatch` verifies the unchanged roll, exact fish/size, canonical quality, cast window/duration, current/previous windows and fixed activation. Paid lines alone update coins, daily usage, current/previous bits and `{best,sold}` in the existing player + immutable log commit (2 reads + 2 writes). Timestamp identity/gap/sold arrays and server guide recording are removed. The API projects best/star and 27 total kinds without lifetime sold. Story/buy/ice retain the new protection fields. No Firestore permission expansion: owner reads and all browser writes denied, including Book/bits/logs.

Tier caps remain shared configuration (legend 2, epic 10, god not sold), aggregated across kinds from soldToday; kept lines remain unpaid/unrecorded. The existing Gen receipt now recognizes the tier-cap reason and displays “I can’t take another trophy today”; buyer/counter/receipt roles and price maths are unchanged. There are no UI component, odds, TUNING, star gameplay, migration or reward changes. Full client Book/guide/pending cleanup, including the obsolete browser-save script, remains step 3; this intermediate branch is not a finished player-facing Book release.

`FISHING_DECK_REDEEM_FROM_DECK_ID` is the fixed server activation variable; absent/invalid value refuses NEW sales with 503. `FISHING_DECK_SECRET` remains required on Vercel with no dev fallback. Exact committed operation replays work before activation/secret/time/bit/price/cap checks; replayed Book counts do not increment. No remote variables were set.

Local dev shares one dev-only secret and creates `.dev/fishing-policy.json` once, pinning the **next full six-hour window**. Restarting does not advance it. Fishing and local load work immediately with zero env setup; sale activation waits for that pinned window. Corrupt policy fails closed instead of resetting paid protection. Do not delete policy/paid saves independently while accepting the same outstanding deck. No player saves were reset during this step.

Boundary proof/test: at real rollover E, a fast worker at E+2 ms commits a new-window sale; a slow worker at E−2 ms sees a future stored slot. It returns **503 with no player/log write**, retaining every bit. The exact committed request can still replay. At exactly E the slow worker can sell an unused previous-window ticket; both windows remain present and repeat requests for either paid index return **409**, with no extra payment or Book increment. Fail-closed parsing was already provided by step 1; normalization now preserves its raw input rather than pruning an apparently future slot.

Validation: **271 unit tests passed, 0 failed/skipped**, versus step 1's 273: 17 obsolete recording/timestamp-identity/compatibility tests were replaced by 15 new verified-sale/dev-policy/receipt tests. Existing client lost-answer/reload/Retry, clock/reservation and pending-ice/Bag tests pass with real ticketed fixtures. `npx tsc -b` passed. `npm run build` passed, including all four compiled Vercel API smoke checks; browser/API output contains no dev-policy secret/module. `npm run test:rules` passed **9/9**, with all five numbered plan scenarios plus the extra 4-ms boundary case and existing permissions/nonce/buy-ice races. Java 21.0.8, Firebase CLI 15.34.2, Firestore emulator 1.22.0, demo-lumen-bay only. A fixture initially used a below-minimum sardine size; it was corrected and the full emulator suite then passed twice. Real `npm run dev` started; local deck issuance and items load each returned 200 with the fixed test identity. No shared-database Preview writes, deployment/settings changes, main merge or physical-phone/UI-feel test. Commit/push dev-test-id only, then stop for review.

## Step 3 review result — 2026-10-30

Teera approved step 2 (8098079), then required these corrections with step 3. Fresh **local dev pins the current window**, not the next; production activation still uses the approved fixed new-full-window cutoff. `npm run dev:reset-fishing` clears the ignored local policy and saves/logs together, refuses production/Vercel execution, and never touches identity. Stop the dev server first, run the reset, restart `npm run dev`, then reload each game tab. A new dev-only reset token clears that TEST account's cooler, pending trade, economy/Book caches and deck cursor on the next load; memory acknowledgement prevents repeated resets when storage writes fail. Old step-2 local policy files are not silently rewritten: use this reset command once if they still pin a future window. Fresh machines sell immediately with zero env setup, proven through real Vite dev issuance/sale/Retry middleware in an isolated temporary root.

Step 3 is built: the new Book reads only account/revision-scoped authoritative sale/load responses or their read-only cache. No catch-time, guest, sandbox or guide award remains. Old Book and unsent pending keys are ignored/discarded without parsing/upload, with blocked storage handled safely; no migration/archive. Deleted guideRecord.ts and removed record node hooks, pending counts/badges, gap normalization/config and the old local Book reset action. Kai/Nami keep their normal lessons/tips; Nami's outdated catch-time Book promise is corrected. Replaced the obsolete guide-recording browser script with a local-only verified sale/Book UI check.

The Book lists 27 kinds, presence, best and star. No lifetime sold/catch quantities appear in Book labels/tooltips or Book-derived Bag rows; carried cooler/goods/receipt quantities remain. The catch card says exactly “New! Sell it to Gen to add it to your Fish Book.” only for an eligible, bookable catch that entered the cooler and is not already found. Practice, unavailable/expired/pre-cutoff tickets, non-sellables and full coolers do not promise Book progress. Free casts snapshot that species' server-derived star; only the strike window gets shared-config 1.15× (hardest 0.40s -> 0.46s), with identical rolls, wait, reel, odds and story behavior. No reward/card logic or new card references.

Client sale safety: existing load/trade responses now include the fixed redeemFromDeckId and at most two validated paidDecks slots (null for unsafe state), without extra DB reads/writes. Missing/unsafe policy fails closed for fresh selections. Quotes, selection/select-all and fresh sends exclude unticketed/malformed/unbookable, pre-cutoff, outside-current/previous, future-clock and known-paid catches; duplicate indices are selected once. Server verification remains authoritative. Indexed rejectedCatches identify an invalid/paid fish without partially awarding the batch. The client removes only that indexed cooler UID, shows Gen's message, and lets the rest sell on the next tap. No automatic resubmission or pending-body rewrite: uncertain requests Retry exactly, including after the policy/window changed. Capped fish stay and pending ice remains protected. Unknown soldToday IDs are skipped in the tier aggregation instead of crashing; a direct applySale regression bypasses normalization to prove it.

ECO-04's release checklist now explicitly requires FISHING_DECK_REDEEM_FROM_DECK_ID, stable production secret, old-writer retirement and coherent activation/reset before opening the gate. No production/Preview variable, shared DB, gate, epoch, odds or TUNING change was made.

Validation: **283 unit tests pass, 0 failed/skipped**, including real-minigame catch -> real verified Gen sale -> Book response, lost answer/exact Retry, second-device load; scope/revision/cache/storage behavior; current-window dev activation/reset and production refusal; client filtering/indexed removal; 27-kind rendered markup and hidden counts; exact star strike boundaries with unchanged roll/wait/reel/story; unknown soldToday key. TypeScript and production build/four compiled API smoke checks pass. **9/9 Firestore emulator tests pass**, including the five plan scenarios and 4-ms boundary paid-bit preservation; permissions remain unchanged. The optional local headless browser check passes at 390×844: a real reserved/rolled fixture sells through the real handler, the rendered Book shows 1/27/best without quantity/pending labels, and a fresh browser context loads the same entry, with no page errors. The actual minigame is driven separately in the integration suite; the UI browser fixture does not claim a manual minigame catch. Screenshot inspected. No physical iPhone/Safari test claimed. Stop after commit/push dev-test-id for review; step 4/release remains unstarted.


## Step 4 review result — 2026-10-30

Teera reports Claude approved stages 4–5/new Book and authorized final verification. Fast-forwarded current dev-test-id b87ba82; reran **283 unit/integration tests, 0 failed/skipped**, `npx tsc -b`, production build/four Vercel API smoke checks and **9/9 real Firestore emulator tests**, including all five plan scenarios and the additional 4-ms future-slot preservation case. All exit cleanly; the older Firebase CLI required isolated local settings after its initial shutdown-settings failure. No runtime/rules/tests needed changes; no save reset or shared database write. Final coverage map, hashes, retirement proof and device-validation limits: [ECO-03-final-verification.md](ECO-03-final-verification.md).

Step 4 is complete locally. Previous headless UI evidence is not presented as a fresh/physical-phone test. ECO-04 release remains blocked pending its own approval. Teera requested a separate stage-6 deck-v2 tuning plan with frozen v1, 100,000-roll table and honest coins/hour-based daily-cap proposal: [ECO-03-stage6-v2-plan.md](ECO-03-stage6-v2-plan.md). That plan and offline model do not activate tuning. Commit/push this packet only to dev-test-id, then stop for approval before stage-6 implementation.
