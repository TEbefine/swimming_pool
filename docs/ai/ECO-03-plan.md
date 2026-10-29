# ECO-03 approved plan and stage 2 review

2026-10-29. Owner: Teera. Based on main `79bd8d0` (merged PR #21), pulled before code. Stage 2 is approved for commit/push to `dev-test-id`; stage 3 is next and must stop for review. Claude's ECO-02 fixes and context entry are preserved. The earlier local review edits to AI_CONTEXT.md were discarded; this session records only the newly authorized ECO-03 work.

## Approved decisions

- Look-ahead is accepted for v1: a modified offline client can inspect indices, skip weak draws, claim the best accepted cast quality and bypass the minigame. Repeated deck requests for the same Player ID/window return the same shuffle; they do not stop inspecting that shuffle or creating other identities.
- Gen's additional daily limits: legend **2**, epic **10**, god **0**. Common/rare have no extra tier ceiling; existing coin and operation limits remain. Over-limit fish stay in a kept line: “I can’t take another trophy today”. Derive tier counts from existing econ.soldToday and update those species counts in the same player/log transaction: no extra read, write or per-catch document. These values are in deckConfig.ts now; enforcement belongs to the sale stage, not stage 2.
- Keep sold-index bits for the current and previous six-hour UTC deck windows. A sellable cast lasts at most **5 minutes** from castAt to caughtAt. Exactly five minutes is allowed; longer casts are Fish Book-only, with the server independently enforcing that rule at sale time.
- Each device starts at a cryptographically random index in its deck, then increments modulo **8,192**. Persist its start/cursor/draw count per Player ID and window; reload must not choose a fresh start. Stop after one complete traversal, so wrapping never locally reuses a consumed card. No server-assigned ranges. Two devices may overlap; an already-paid ticket refuses another sale. Two independent initial indices collide with probability 1/8,192; overlap risk grows over longer sessions, so random starts reduce rather than eliminate collisions. Allocation is a later stage.
- Rarity and minigame tuning come after the working deck, with the 100,000-roll table and a coins/hour model first. Free fishing only. No Dalbit story behavior changes.
- Fish Book ticket verification is excluded. Propose it later with its own recording markers and seven-day retention design. Selling and recording one catch must remain independent actions.

## Marker retirement proof

Let W = 360 minutes. Deck d permits castAt in `[dW, (d+1)W)`; let E = (d+1)W be its exclusive end.

1. The latest integer-millisecond castAt is E − 1 ms. Sale verification must not extend that deck interval by clock tolerance.
2. With the approved duration bound, caughtAt ≤ castAt + 5 min, so caughtAt < E + 5 min.
3. The existing freshness rules permit at most 30 min basic life + 30 min confirmed ice. Ice cannot revive spoiled fish. Thus a fresh sale requires serverNow < caughtAt + 60 min < E + 65 min.
4. Even adding the existing 10-second future tolerance conservatively gives a latest horizon of **E + 65 min 10 s**. The strict interval/duration proof already bounds it more tightly; this extra slack is a safety margin, not an extension to deck membership or maximum cast duration.
5. Deck d remains the previous deck throughout `[E, E + 360 min)`. Retire its bits only when the server's current deck becomes d+2, at **E + 360 min**. That is **294 min 50 s** beyond the conservative sale horizon.

Therefore a fish from d is already unsellable before d falls out of the retained pair. Keep both windows' bits through the whole interval, rotating according to server time, never request order or Bangkok midnight. Exact operationId replays still return their saved receipts before window/freshness checks. An altered caughtAt cannot extend eligibility if the original ticket's castAt/window and five-minute duration are enforced. A config-invariant test fails if the proof's inequality stops holding. Actual marker enforcement is deferred to the sale stage.

For 8,192 casts, each bitmap uses 1,024 raw bytes; both use 2,048 raw bytes or 2,736 padded base64 characters, plus keys/metadata. Never evict live bits to admit another sale.

## Stage 2 delivered: shared roll only

| File | Purpose |
| --- | --- |
| src/game/fishing/deckConfig.ts | Version 1, six-hour window, 8,192 casts, five-minute duration, approved tier-sale policy |
| src/game/fishing/deckRollV1.ts | Frozen protocol snapshot: 32 ready A/B kinds, current weights, size/zone coefficients and calendar rules |
| src/game/fishing/deckRoll.ts | Pure rollDeckCatch, per-index PRNG, cast canonicalization and explicit Bangkok context |
| tests/fishing-deck.test.mjs | Legacy compatibility, browser/server compilation, fixed vectors, boundaries, malformed inputs, retirement inequality |

Signature:

```ts
rollDeckCatch({ version, seed, castIndex, castInfo: { distance, nice }, castAt })
// -> { fish, sizeCm, baseDiff, big }
```

The seed is canonical lowercase hex for 32 bytes, to match the future HMAC issuance result. Fold `lumen-bay/fishing-roll/v1:<seed>:<index>` with FNV-1a into uint32, then use explicit mulberry32. This is a deterministic, non-cryptographic roll stream; the server HMAC secret is never an input to this shared module. A new PRNG stream per index makes results independent of prior draws, request order and minigame frame count. Validation rejects unsupported versions, non-canonical seeds, invalid/out-of-range indices, malformed timestamps, and inconsistent Nice claims. Authentication, future-window checks and edited-seed rejection require the later server route/redemption stage; this function alone does not authenticate a seed.

Distance has exactly five accepted roll states: weak-near, normal-near, normal-mid, normal-far and Nice-far. Nice must match the existing inclusive 0.80–0.92 band. Additional distance precision cannot choose another stream. Day/night and season come from explicit castAt in Bangkok, with no system clock, local timezone or URL overrides.

The v1 kernel snapshots the existing rollFrom/sizeFrom mathematics instead of importing the live story module. Both future client and server ticket consumers will import this one shared kernel. This intentional version boundary avoids changing story code or letting future live-table/tuning edits reprice an outstanding ticket. Keep v1 data, seed folding, algorithm and vectors intact when introducing v2. The initial compatibility check against today's live table must be explicitly revised when live odds move to a new version; do not edit the v1 snapshot just to make it green.

The 32 ready species currently have no season restriction (season-specific sheets C/D are not yet ready). Calendar boundary tests cover all three seasons; v1 deliberately cannot start rolling those unready kinds merely because READY_SHEETS changes in a later deployment. God-tier fish and treasures can still roll for the collection even though Gen will not buy them.

There is no deck endpoint, fetch/cache/index allocation, ticket in the cooler, sale verification/marker write, tier-limit enforcement, Fish Book verification, tuning or gameplay wiring in this stage. Existing fishing/story/economy/API source is unchanged, including PR #21 fixes. The production economy gate remains off.

## Validation

- Ten new tests. **7,680** cases match the existing free cast's fish, size, base difficulty and big flag.
- Another **7,680** cases agree between a Vite-built browser IIFE and strictly compiled NodeNext server ESM. The IIFE runs in an isolated JS context with no window/process/storage/crypto, and throwing ambient random/clock functions. This checks compilation/runtime independence; it is not a physical Safari/iPhone test.
- Fixed numeric PRNG/output vectors pin the protocol. Other checks cover exact cast-quality/calendar boundaries, independent index streams, ready kinds, legal sizes, day/night eligibility, mutation safety and malformed inputs.
- `npm test`: **235 pass**, zero failures/skips (225 existing plus 10 new). `npx tsc -b`: pass. `npm run build`: pass, including production Vercel nonce/login/items smoke checks and Vite. No Firestore changes or new emulator tests in this pure stage. The 100,000-roll tuning table and coins/hour model remain a later approved step.

## Remaining stages after review

3. Authenticated stateless POST /api/fishing-deck and per-ID device caching/random-start index reservation; zero Firestore reads/writes for issuance. Preserve preview-only testing and production gates.
4. Wire only free fishing to the shared roll and carry the same ticket/timestamps through cooler, pending data and retries. Keep the minigame feel unchanged and preserve Claude's pending-ice protection.
5. Verify tickets in validateSaleCatch; apply the five-minute bound, current/previous sold bits and approved tier limits inside the existing sale transaction. Test concurrent redemption, boundary casts, ice/rollover, duplicates across devices and historical receipt replay in the emulator. Unticketed/over-duration catches cannot sell.
6. Propose free-fishing rarity/speed tuning with measured odds and a stated coins/hour model. Propose Fish Book verification separately, with independent markers.

Issuance remains zero Firestore reads/writes. Accepted sales remain two reads plus two writes before contention retries; 200 IDs × 40 accepted operations/day = 16,000 player/log writes, plus other traffic. No global quota guarantee.

Superseded proposals: current-window-only markers were rejected as replay-unsafe; server-assigned device ranges were declined in favor of random local starts; full look-ahead prevention is outside the approved offline v1 design. Claude's ECO-02 repair work remains separate and is already on main.
