# ECO-04 step A — epoch and runtime control

2026-10-31. Updated main e827a01 (PR24) merged into dev-test-id before implementation. Client ECONOMY_ON gate remains unchanged. ECONOMY_EPOCH=1; no activation bump, date/cutoff, Vercel setting, live Firestore write, production merge or deployment performed. Approved activation time is12:00 UTC /19:00 Bangkok; date is still required. Test only local dev + emulator at this stage, not the existing real-database Preview.

## Runtime control and read costs

Firebase console → lumen-bay → Firestore → Data → config/economy → boolean open. Only open:true allows new money operations. Missing/malformed settings and unavailable reads fail closed. Client Firestore access remains denied. Server ECONOMY_API=on is also required; environment-off money/deck requests cost0 Firestore reads/writes. Both counter screens display “The shop is closed today.” when closed status is received; rejected trades use the same line.

Money transactions read player, operation log and config/economy in one transaction. Receipt replay precedes runtime/epoch/payment checks: historical receipts return current wallet plus original result, never a second payment. A setting flip participates in transaction conflict handling; already committed trades remain committed. No runtime cache authorizes a money write.

Wallet loads and deck fetches use a per-instance60-second on-demand cache of the setting, coalescing concurrent refreshes. No polling or background reads. Failures replace stale-open cache with false. UI/deck availability can lag a switch change until the cache expires and another request occurs; new money operations always use uncached transactional state.

| Request | Warm reads | Cold/expired cache reads | Writes |
|---|---:|---:|---:|
| Wallet load |1 player|2 player+setting|0|
| Deck fetch |0|1 setting|0|
| New sale/buy/ice |3|3|2 if accepted|
| Exact money Retry |3|3|0|
| Runtime-closed money request |3|3|0|
| Story save |2|2|2 if accepted|

Setting refresh is at most one per active API instance per60s on demand, not one globally. Separate instances/function bundles and cold starts each have their own cache. Tables exclude transaction retries, dashboard use and unrelated project activity. Environment-off loads still read the player but skip the setting. Closing the shop does not stop read abuse: retain API rate limits and watch total reads.

## Epoch and client behavior

Missing econEpoch means0. On an older epoch, server load projects coins0, goods[], coolerLevel0, rodLevel0, paidDecks[], iceUsedAt[], reset economy counters and accepted-operation windows. Invalid/old-format fishBook becomes{} before validation; valid strict verified best/sold maps survive. Story, identity, cards, community memory and unknown non-economic fields survive. No archive/conversion into verified fish.

Loads write nothing. The first accepted transaction writes the new epoch and adds one reason:epoch closing entry to that operation's existing append-only log, including prior balance and from/to epochs. Two competing first operations serialize to one closing entry. Old logs are preserved; exact pre-epoch receipts do not persist a reset or restore money. Failed operations do not persist a reset either.

New money requests carry econEpoch in their intent/hash. No-epoch hashes remain compatible for historical replay; new missing/wrong-epoch attempts refuse with epochChanged. Requests retain their original body/operationId across Retry. Runtime closure preserves uncertain requests. StepB must pin a fresh full-window cutoff before any epoch-reset sales: do not deploy reset code over an open old ticket population.

The server epoch wins over cached revision. A changed epoch clears the cooler/economy snapshot and invalidates verified-Book/deck caches; the current server response immediately repopulates valid Book entries. Pending request bytes remain quarantined for explicit Retry reconciliation, not automatic reissue. Old-epoch/old-revision answers cannot restore cleared state; the first authoritative load also outranks an edited cached epoch/revision. No vault/story/local recovery keys are removed. Ticket reservation waits for a current-epoch wallet snapshot; otherwise ordinary practice fishing remains available.

Local serve-only middleware explicitly supplies an open test control without Firestore. Production never falls back to it. Server control cache lives in the Admin service singleton. Firestore rules unchanged.

## Vercel Hobby Standard Protection — main old-URL protection

Verified against current official documentation:
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication

Standard Protection + Vercel Authentication is available on Hobby. It protects generated deployment URLs (including old production deployments) and previews while leaving production domains public.

Exact steps for Teera, before activation:
1. Vercel dashboard → swimming_pool → Settings → Deployment Protection.
2. Enable Vercel Authentication.
3. Choose Standard Protection, then Save. Avoid the legacy preview-only scope; do not choose All Deployments because the live production domain must stay public.
4. Review exceptions, Shareable Links and automation bypass access; remove unneeded paths to old deployments. Keep API traffic relative to the current origin (the client already does).
5. In a logged-out/private browser, check an old generated URL AND its /api/items path: they must meet Vercel authentication before the function. Also check the generated current production URL.
6. In that same logged-out browser, https://swimming-pool-five.vercel.app must remain public. Verify any additional production domains too.

Important scope: protection blocks unauthorised access, not the owner. Existing authorised cookies, share/bypass links or trusted automation can still access old code. Close old owner tabs before reset and do not use old deployment URLs/rollbacks afterwards. If an old writer remains reachable through necessary authorised/bypass access, disable/delete that specific deployment or revoke its access. Standard Protection is the main public protection; it is not proof that every old Admin writer is technically disabled. No account settings or private deployment probes were changed/run in this task.

## Validation

330 unit/integration tests pass, zero failed/cancelled/skipped; TypeScript/build/four compiled Vercel API checks pass.12 emulator tests pass, exit0, demo-lumen-bay only. git diff --check passes. Existing rods/rhythm/controller/story trace coverage remains green. Client-gate/live-off test stays green.

Six new unit/integration tests: cacheTTL/coalescing/failure; reset field boundaries and valid verified Book; projected read/no writes + first-sale legacy repair + closed transaction; historical no-epoch receipt vs uncommitted old request; Admin service cache-versus-transaction read capabilities; client epoch reset/pending-byte/stale-answer handling. One additional test proves an edited cached epoch/revision cannot outrank the first server load (seven new tests total vs323 base). One new real-emulator scenario tests concurrent first sales producing exactly one closing entry, plus closed-setting rejection despite a warm open advisory cache and receipt replay while closed.

Existing fixtures explicitly mark current-epoch money/data, supply runtime controls and initialize only emulator config/economy. The old cooler-preservation expectation was updated because the approved epoch now clears it. Initial failures exposed old unversioned test intents/fixtures; production has no default-open/missing-epoch fallback.

No physical phone test, runtime Vercel protection configuration/probe or live quota observation claimed. StepB still requires reviewed epoch bump, client gate removal/build stripping, date-specific cutoff, stable secret, old-writer audit and production activation checklist. The epoch must never be decremented and paid bits must never be reset while old tickets remain redeemable. Stop after commit/push for review.
