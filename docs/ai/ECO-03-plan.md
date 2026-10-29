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

3. Implemented, awaiting Claude review: authenticated stateless POST /api/fishing-deck and per-ID device caching/random-start index reservation; zero Firestore reads/writes for issuance. See the stage 3 review below.
4. Wire only free fishing to the shared roll and carry the same ticket/timestamps through cooler, pending data and retries. Keep the minigame feel unchanged and preserve Claude's pending-ice protection. Derive Nice from distance using the frozen deck band/canonical adapter, rather than passing the minigame's own flag. Add a test using REAL fishingSession onCast outputs at 0.80/0.92 and adjacent values; valid casts must never throw mid-cast. No such gameplay integration is included in stage 3.
5. Verify tickets in validateSaleCatch; apply the five-minute bound, current/previous sold bits and approved tier limits inside the existing sale transaction. Test concurrent redemption, boundary casts, ice/rollover, duplicates across devices and historical receipt replay in the emulator. Unticketed/over-duration catches cannot sell.
6. Propose free-fishing rarity/speed tuning with measured odds and a stated coins/hour model. Propose Fish Book verification separately, with independent markers.

Issuance remains zero Firestore reads/writes. Accepted sales remain two reads plus two writes before contention retries; 200 IDs × 40 accepted operations/day = 16,000 player/log writes, plus other traffic. No global quota guarantee.

Superseded proposals: current-window-only markers were rejected as replay-unsafe; server-assigned device ranges were declined in favor of random local starts; full look-ahead prevention is outside the approved offline v1 design. Claude's ECO-02 repair work remains separate and is already on main.

## Stage 3 review — 2026-10-29

Stage 2 is published on dev-test-id as `4a7c460ffd0b015bfdeeb6e9f9a1f1cf23326959`. Its tree matches the approved local implementation exactly. Stage 2 was independently verified by Claude (235 pass, deterministic rolls, current-game odds), as reported by Teera. Stage 3 is prepared for publication to dev-test-id for Claude code review before stage 4. Teera is testing local npm run dev; Vercel configuration is deferred.

The route is `POST /api/fishing-deck`, body `{}`. Response adds the authenticated `address` to the planned `{version,deckId,seed,window:{startAt,endAt},casts,serverNow}`. The token supplies the owner, never a request field. The same origin-bound 48-hour session checks as saves apply. ECONOMY_API must be exactly `on`; a closed switch returns 403 in character before invoking auth. IP 10/minute and player 5/minute limits are per instance, bounded in memory, not a global quota. Issuance calls only token verification and HMAC: no Firestore operation or persisted counter.

`FISHING_DECK_SECRET` is the exact new variable name. In Vercel's **swimming_pool** project, go to **Settings -> Environment Variables**, choose **Preview**, then **custom branch dev-test-id only**. Use at least 32 random bytes (for example, generate with `openssl rand -hex 32`), with no VITE_ prefix. That same branch needs the existing `ECONOMY_API=on`, `VITE_ECONOMY_PREVIEW=1` and Firebase server credentials. Redeploy that Preview after setting variables. Production stays off; do not configure its economy switch for this work. Keep the secret stable across deployments with outstanding decks; rotation changes their seeds and requires a deliberate migration/epoch policy. No Vercel variables were changed during implementation.

Local dev needs no environment setup: Vite's serve-only devDeck plugin injects its fixed dev-only secret and verifies only the existing TEST token. Vercel never falls back to it, and explicitly rejects dev-only-prefixed secrets even if one is configured there. Production API tracing excludes server/dev; browser artifacts contain no dev deck secret. GET/invalid requests/missing config fail with bounded JSON errors and no-store headers.

The device stores `sp_fishing_deck_v1_<address>` with deck, device receipt time, random start and consumed draw count. One random start is reused across reloads; reserveCast persists the increment before returning an index, wraps once, and returns null on exhaustion/expiry/storage failure. Sequential tabs pick up stored consumption, but there is no cross-tab atomic lock or server range assignment; a simultaneous overlap is handled later by sale markers, as with separate-device collisions. This cache is not trusted as redemption proof.

Client fetches only when ECONOMY_ON and authenticated/dev identity are present; sandbox and the production-off build send none. Attach triggers a background request; existing valid cache avoids refetch. Visible rollover and reconnect/return refresh it, with one-minute retry on unavailable config/network. Old-ID responses are ignored. No cast/minigame source is wired to reservations yet, and sale validation still uses ECO-02 rules until stage 5.

Validation: **250 tests pass**, including 15 new route/cache/compiled-client tests. The real Vite middleware issues a deck without an env file. TypeScript passes; production build passes with Vercel smoke tests for nonce/login/items/fishing-deck, including no dev fallback on Vercel and the shared economy switch. The compiled-client test executes production/Preview/sandbox builds and checks request counts. Existing stage 2 roll tests and PR #21 regressions remain green. No physical iPhone claim; the endpoint is stateless, with no Firestore changes to exercise in the emulator. Manual dev check: start `npm run dev`, open the normal TEST ID, inspect one successful `/api/fishing-deck` request and the per-ID cache; reload within the window reuses it.
