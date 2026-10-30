# ECO-01 · Fish shop economy — buy, sell, money (v1 logic, 2026-10-27)

> Owner: Teera (final say). Logic + tests: Claude. **Every AI must read this before touching money, the cooler or the shop.**
> If the code and this doc disagree, STOP and report it. All numbers live in `src/game/economy/economyConfig.ts`.

## 1. The loop (one fishing trip)
Quiet Bay: catch → **cooler** (10 slots, fish spoil in 30 min) → walk to the Harbour Fish Shop → **Gen buys your fish**
→ coins → **Minato sells sashimi / meals / drinks**, **Gen sells pantry & supplies** → goods in your bag → (later) gifts to NPCs, café.

Design goals: a trip has a rhythm (fill the cooler → walk → sell → spend), prices *teach* something real, money can't be farmed or looped,
and the phone can't be trusted with it (live only after the server step).

## 2. Selling fish to Gen
`price = tierBase × size × freshness × wanted × glut` → rounded, minimum 1. The sell screen should SHOW each factor (players learn by seeing).

| Factor | Rule | Value (config) |
|---|---|---|
| tierBase | Common / Rare / Epic / Legend / God | 6 / 20 / 70 / 250 / not for sale |
| size | smallest of its kind → biggest | ×0.8 → ×1.3 |
| freshness | Fresh <10 min · Good <20 · Tired <30 · then spoiled (gone) | ×1 / ×0.8 / ×0.5 |
| wanted | "Gen wants today": 2 everyday species per Bangkok day, same for every player, catchable this season | ×1.5 |
| glut | supply and demand: each fish of the same species already sold today | ×0.9ⁿ, never below ×0.5 |
| daily cap | anti-cheat ceiling per player per Bangkok day (fish over it stay in the cooler) | 5,000 |

Gen never buys: protected animals (released anyway), God-tier trophies, treasure (bottle, chest, fossil stone).
Gen DOES buy freshwater fish (for cooking) — but Minato never makes sashimi from them: raw freshwater fish carries the
liver fluke (*Opisthorchis viverrini*, linked to bile duct cancer; Ram Hospital). That's a learn-by-doing moment for the dialogue.

Tuning (unit test prints it): **≈ 23 coins per catch** on average → a full starter cooler ≈ 234 coins ≈ one mixed sashimi plate (150) + extras.

## 3. The cooler (fish you carry)
- Only fish Gen could buy go in. Starter 10 slots; **Bigger cooler box** from Gen: +5 slots, 400 then 900 coins (2 levels).
- Fish age from the catch; **Block of ice** (15 coins) gives every fish in the cooler +15 min (max +30 per fish).
- Spoiled fish are removed when the wallet is read (no timers) and the log says "N fish went bad".
- The Fish Book is separate and unchanged (Nami/Kai still record catches).

## 4. Buying at the shop
- 48 goods = Teera's 3 icon sheets (`shopCatalog.ts`, icons `public/sprites/shop/<id>.webp`, cutter `scripts/process_shop_sheet.py`).
- **Minato** = sashimi (16), sushi/meals/snacks/drinks (16). **Gen** = pantry & supplies (16). One order = one counter.
- Order: max 10 things, **all or nothing** (money, daily limit, bag space are checked before anything changes).
- **Today's special**: one sashimi plate per Bangkok day ×0.8 (same for everyone). Daily limits: otoro 2, uni 2, sashimi boat 1, chef's special 1.
- Perishable goods (sashimi 60 min, most meals 60, onigiri/kamaboko 4 h) take 1 bag slot each and go off; keepers stack (20 per slot). Bag: 20 slots.
- "Coming soon" (not for sale): fish crate, chef's knife, whetstone (for the future "slice my own fish" service).
- **Shop goods can never be sold back** (no buy-low/sell-high loop).

## 5. Money in / money out
| In (faucet) | Out (sinks) |
|---|---|
| Selling fish to Gen | sashimi & meals (gifts later), ice, cooler upgrades, café coffee (next), future: knife service, room items |

## 6. Code
| File | What |
|---|---|
| `src/game/economy/economyConfig.ts` | every number, the currency word (`CURRENCY`, still "coins" until Teera names it) |
| `src/game/economy/shopCatalog.ts` | 48 goods, vendors, prices, perish times, limits, freshwater list |
| `src/game/economy/market.ts` | Bangkok day, daily market (seeded), freshness, size, glut, fish quote, item price — pure |
| `src/game/economy/wallet.ts` | the wallet: addCatch, quoteSell/sellFish, quoteBuy/buy, useGoods (ice), takeGoods (gifts), settle, parseWallet — pure, all-or-nothing |
| `src/game/economy/walletStore.ts` | device storage per Player ID, `useWallet()`, actions, `ECONOMY_ON` gate, dev console `__shop` |
| `src/game/economy/flags.ts` | `ECONOMY_ON` (dev or `?test=shop|free`), safe under plain Node |
| `src/game/economy/shopTalk.ts` | Gen's and Minato's talk (built fresh: today's wanted fish, special, your cooler), which node opens which counter tab, the line after you leave |
| `src/components/shop/ShopCounter.tsx` + `shop.css` | the counter screen: Sell fish (price in parts, freshness countdown) · Supplies / Sashimi / Meals (cart + Pay) · My bag (use ice) |
| `src/components/shop/WalletChip.tsx` | coins + cooler chip at Quiet Bay and the shop |
| `src/game/rooms/fishShop.ts`, `fishShopLayout.ts` | the room; `scripts/process_fish_shop.py` keys its sky |
| `tests/economy.test.mjs` | 24 tests incl. limits, exploits, broken saves, tuning band, icons exist |
| `tests/fish-shop.test.mjs` | the live game has no shop/exit/money; room geometry; every talk choice, pose and line length |
| wiring | `fishingSession.ts` (catch → cooler), `cloud.ts` (wallet follows the Player ID) |

Failures return a reason code; `REASON_LINES` gives a line in a character's voice (never an error pop-up).

## 7. Safety: test never touches live
- `ECONOMY_ON = import.meta.env.DEV || ?test=shop|free`. In the live game the cooler stays empty and no money exists yet.
- Sandbox pages use their own wallet (`sp_wallet_test`). The dev console `__shop` exists only in `npm run dev`.
- The shop room, the path to it from Quiet Bay and the coin chip are only registered when `ECONOMY_ON`.
- Try it: `npm run dev` → Quiet Bay → catch fish → walk off the LEFT shore → talk to Gen ("Sell my fish") or Minato ("See the menu"). Console helpers still work: `__shop.coins(500)`, `__shop.reset()`.

## 8. Steps
1. ✅ Logic + tests + icons (this doc)
2. ✅ Shop room next to Quiet Bay (left shore) + Gen & Minato in front of the counter (2026-10-27, branch `feat/fish-shop`)
3. ✅ Sell screen at Gen (cooler list, price in parts, freshness countdown, Select all, ice)
4. ✅ Buy screen at Minato/Gen (tabs, cart, daily limits, special, Pay) — in the Bag look, not the café app look (a shop counter in a pixel harbour, not a phone app)
5. Cooler + goods in the Bag; coins in the Bag header outside Dalbit (today it shows story coins)
6. Gift goods to NPCs (`takeGoods`) — relationship spec
7. Café coffee costs coins (first new sink)
8. **Server (ECO-02)**: server-owned wallet and goods; sale pricing shares `quoteFish` / `market.ts`. Sales do not record in the Fish Book and do not require prior Nami/Kai recording. The live economy stays gated through ECO-02 and ECO-03; only ECO-04 enables it.

## 9. Teera decides
- Currency name (Bia / ฿ / other) → one line in `CURRENCY` + a coin icon sheet
- Gen buys / Minato sells split (or both do both), and their shift hours
- Prices and limits (all in config)



## 10. ECO-02 stage (a) — server document and load (2026-10-28)

Owner's corrections supersede conflicting text in `docs/ai/PROMPT_item_system.md`:
- Keep `ECONOMY_ON` unchanged throughout ECO-02. See `PROMPT_economy_live.md`: ECO-04 enables it after ECO-03. Stage (d) only turns the client wallet into a server-answer cache.
- Selling gives coins only. Fish Book recording remains with Nami/Kai and its current `lastCatchAt` rule.
- Later server sale pricing calls the shared `quoteFish` / market functions directly; do not make `sellFish` operate without a cooler.
- Later catch validation uses a server-time offset and 10 seconds of future tolerance, not strict zero tolerance. Stage (a) does not change catch validation.

### Implemented in (a)

`players/{address}` gains:

| Field | Default / limits |
|---|---|
| coins | 0; ceiling SELL.dailyCap x ECONOMY_SAVE.balanceCapDays = 2,000,000; reads clamp to 0..ceiling and floor fractions without throwing; commit paths refuse invalid computed balances |
| coolerLevel | 0; integer 0..2 from existing upgrade config |
| goods | [] ; at most 20 slots; uid 1..64 ASCII letters/digits/underscore/hyphen; ID from the shop catalogue |
| goods[].qty | 1..20; legacy stacks survive perishability changes; new food purchases will use qty=1 |
| goods[].at | Nonnegative safe-integer milliseconds, no later than server now |
| goods[].expiresAt | null for keepers; safe-integer milliseconds greater than at for food; expired at <= now |
| econ.day | Current Bangkok day number from `bkkDay(now)` |
| econ.soldToday | Known catalogue IDs only: at most 64 keys, count 1..2,000 |
| econ.earnedToday | 0..5,000 from SELL.dailyCap |
| econ.boughtToday | Known shop IDs only: at most 48 keys, count 1..400 (40 operations x 10 cart items) |

No cooler, catch claims, sold set, or ice timestamps are stored by this stage. Missing fields in old server documents receive defaults; localStorage is never imported. The existing Dalbit story balance stays separate. All API player views carry these fields, including Fish Book/story replies and replay responses, so existing writes preserve the economy.

Expired goods are excluded by `normalizePlayer()` at read time. A load performs no cleanup write and creates no document for a new player. The next accepted mutation persists the normalized fields. Food keeps a valid stored expiry. A keeper is repaired to expiresAt=null; a perishable without a valid food expiry is repaired to at + perishMin. Catalogue duration changes do not rewrite an already valid food expiry. Legacy stacks retain all units when made perishable; genuinely expired repaired food is removed. Unknown or malformed entries are discarded. Only the first 20 stored bag entries are inspected, so malformed overfull data cannot cause an unbounded scan.

**Exact compact JSON maximum for these new fields: 5,268 bytes**, with the current catalogues and all numeric/string fields at their allowed maximum lengths. The test constructs that maximum. This is a serialization bound, not Firestore's encoded size or the entire player document: existing Fish Book/story fields are not included. Catalogue growth requires updating the bound and its test. `coins` uses the configured balance ceiling and timestamps use JavaScript safe-integer bounds; ordinary live values use fewer digits.

### Planned metadata for (b)/(c), not implemented in (a)

| Data | Hard entry maximum | Integer payload maximum | Retention |
|---|---:|---:|---|
| Already-sold caughtAt values | 800 (derived below) | 6,400 bytes (800 x 8) | Until caughtAt + 60 minutes; includes maximum ice extension |
| Server ice-use timestamps | 16 | 128 bytes (16 x 8) | 60 minutes + 10 seconds from use |

These are sorted timestamp arrays, not copies of fish or a server cooler. Timestamp identity refuses repeat claims with the same caughtAt even if fish/size is changed; forged new timestamps remain an ECO-03 limitation. With 13-digit epoch milliseconds the two arrays use at most 11,201 and 225 compact JSON bytes respectively, before property names; Firestore field/document overhead is additional. Wider safe-integer timestamps would use at most 13,601 and 273 bytes respectively. At capacity, refuse the new operation in character until an entry expires; never evict a live sold marker. Derive the sold-set cap from LIMITS.opsPerDay * (COOLER.baseSlots + COOLER.upgradeSlots * COOLER.upgradePrices.length): 40 * 20 = 800, rather than a guessed constant. Stage (b) must bound each sell batch to the owned cooler capacity. Ice use remains capped at 16 retained events. Implement the derived cap with the sell stage; stage (a) stores neither array. The sold set survives midnight. A retention window can straddle two daily operation budgets, so 800 is the single-day quota bound, not a mathematical guarantee across midnight; never evict a live marker. Keep replay lookup ahead of time-sensitive validation.

### Quota and checks

The shared accepted-operation budget is now **40 per Player ID per Bangkok day**. A load costs 1 read and no writes. An accepted transaction costs 2 reads and 2 writes (player plus operation log), before Firestore contention retries. A replay has reads but no writes and does not consume the accepted-operation budget. At 200 players, 40 accepted operations each allow 16,000 writes/day; retries, rejected requests, session/login traffic and extra IDs still need headroom and monitoring. Per-instance request throttles are not a global quota guarantee.

Validation for (a): API regression tests cover new/old saves, read-only expiry at its exact boundary, persistence on the next existing operation, preserved story/Fish Book, invalid/duplicate/oversized goods, Bangkok rollover, 40-op exhaustion/replay/reset, and storage bounds. All 23 API tests pass after review fixes. API TypeScript compilation passes; the compiled items handler imports and returns the expected 405 for GET. Checks used the isolated current source and preinstalled dependencies. Teera independently verified the prior stage (a) branch: npm test (178), tsc -b, npm run test:api (including api/items.js), and npm run build all pass. The earlier local EISDIR was an environment problem. After these review fixes, 23 targeted API tests and the API TypeScript check pass locally; the full suite has not been rerun here. Emulator rules remain stage (e); no rules were changed.

Phone check after pulling `dev-test-id`: `npm run dev`, open the TEST Player ID, visit Quiet Bay, record a catch with Nami/Kai, reload and verify the Fish Book persists; verify the existing story still loads. There is no new visible wallet behavior in (a). The developer can inspect `/api/items` load for coins=0, coolerLevel=0, goods=[] and today's econ counters, with no new .dev player entry until the first accepted save. No shop operation is newly exposed. Physical iPhone confirmation is pending before merge to main.


### Stage (a) review fixes (2026-10-28)

Daily counters clamp to their configured maximum instead of resetting to zero when an owner lowers a limit. Goods use SHOP_BY_ID; catalogue perishability changes repair clocks rather than deleting otherwise valid rows. Existing keeper stacks remain intact when changed to food. The write-only balance guard `checkedCoinBalance` refuses computed totals above SELL.dailyCap x 400, currently 2,000,000; stage (b) must call it on the computed post-sale balance before commit. End-of-file blank lines were removed. Tests cover lowered config, keeper/food conversion with 20 units, repaired expiry, and balance overflow without writes. No shop.sell implementation is included in these fixes.


### Final stage (a) review (2026-10-28)

`normalizePlayer` never throws for a bad balance: clamp into 0..SELL.dailyCap*400, floor fractions, default absent/non-numeric/NaN values to zero. Infinity clamps to the ceiling; negative values clamp to zero. Load remains read-only; a later accepted operation persists normalization. `checkedCoinBalance` remains a write-path guard for the computed post-sell/post-buy balance, before commit.

Known sold-set limit: caughtAt alone identifies a catch. Two devices on one Player ID can collide on the same millisecond, causing one distinct fish to be refused as already sold. ECO-03's deck identity will fix this. Fabricated timestamps remain unverified until ECO-03.

Stage (c) invariant: normalization preserves legacy perishable stacks, but shop.buy MUST create one slot per piece of food. Reuse the existing goodsAfter() behavior in wallet.ts; do not infer purchase stacking rules from normalization.

Teera verified the preceding review-fix commit: 181 tests, tsc -b and npm run build passed. Final balance-read changes pass the 23 targeted API tests and API TypeScript check locally. Stage (b) starts after Teera merges stage (a).


## 11. ECO-02 stage (b) — server shop.sell (2026-10-28)

Implemented on `dev-test-id`, based on main `2cec730` (receipt slip included). Stage (a) is merged. The live gate stays off; `walletStore.ts` and UI are unchanged. This stage can be exercised through `/api/items` on the dev server with the TEST Player ID; the ordinary counter still uses the local wallet until stage (d).

### Request, validation and kept fish

```ts
{ op: 'shop.sell', operationId, catches: [{ fish, sizeCm, caughtAt }] }
```

Only these fields are accepted. Prices, totals, balances, target addresses and claimed ice are rejected. The authenticated token determines the player. Catch timestamps must be chronological and unique, and the batch must fit the server-owned cooler level (10/15/20 slots).

`validateSaleCatch` in `server/saves/sales.ts` is the one sale-authenticity entry point ECO-03 can extend with deckId/castIndex. It reuses `catchProblem` for catalogue readiness, size, season and day/night. The shared function accepts a policy override: sale future tolerance is exactly 10,000 ms; Fish Book's 60,000 ms tolerance and 7-day recording window remain unchanged. For sales, server freshness replaces that recording age limit, so otherwise valid old fish return as spoiled rather than invalid. The existing 3,000 ms catch gap is enforced within the batch and against retained sold timestamps in either direction. No Fish Book field is read as sale eligibility or changed by a sale.

Impossible, unsellable, duplicate/already-sold, too-close, oversized-batch or invalid catches refuse the whole operation. Validate all catches before pricing. Valid-but-spoiled fish are returned as `{index,caughtAt,reason:'spoiled',message:'That one went bad on the way.'}`. Fish whose price would exceed the remaining daily earnings cap are kept with reason `daily_cap` and Gen's ice-box line. The catch-count ceiling also uses existing LIMITS.catchesPerDay against the sale counters, without touching Fish Book counters. Only actually paid fish advance daily glut and receive a sold marker. Other fish in the batch can still sell. If none sell, HTTP 422 returns `error` and `result` with earned=0, sold=[], kept/keptLines and pricing time; no player or log writes occur.

### Response and immutable receipt

A successful response is the existing player view (including current coins) plus:

```ts
result: {
  sold: [{ fishId, base, size, fresh, wanted, glut, price,
           uid, capped: false, index, sizeCm, caughtAt, isWanted }],
  earned, kept, keptLines, balanceAfter, pricedAt, marketDay
}
```

`fresh` is the full shared quote freshness object, including label and multiplier; `wanted` remains the numeric multiplier. `uid` is the timestamp string for SellLine compatibility, not a trusted client UID; index/caughtAt identify the original catch. The rows pass directly to `sellReceipt(result.sold, result.kept, result.balanceAfter, result.pricedAt)` without mapping. Selling has no VAT. The old receipt function's generic kept-note assumes the daily cap; stage (d) should use keptLines to explain spoiled catches accurately when wiring the new response.

Use marketOf(now) and quoteFish with server now and sequential paid-fish counts. Stage (b) passes icedMin=0. Do not call sellFish with a fabricated server cooler. `checkedCoinBalance` refuses an invalid computed final balance before writing; normalizing a stored balance never throws.

One Firestore transaction reads player and operation log. After strict request parsing/hash, check the log before freshness, catalogue and player-state validation: same ID + same body returns its saved receipt even after expiry, midnight or another sale; same ID + changed body is 409. The outer player view is current; result.balanceAfter is the historical receipt balance. A successful transaction updates player coins/econ/recentSoldAt/operation counters and creates one append-only log. `log.changes.earned` is coins in and `log.changes.balanceAfter` is balance after, with the complete receipt result. Failed operations and replays make no writes; transaction callbacks have no external side effects.

### Sold-set bounds

`recentSoldAt: number[]` is a root player field, independent of econ.day and Fish Book lastCatchAt. It is internal to playerView. Normalize to sorted unique nonnegative safe integers, removing only entries with `caughtAt + SALE.soldRetentionMs <= now`. Retention derives from 30 min lifetime + 30 min maximum ice extension = 60 min. A timestamp up to 10 seconds ahead can remain up to 60 min 10 s after sale. Midnight does not clear it.

`SALE.maxRecentSold = ECONOMY_SAVE.opsPerDay * (COOLER.baseSlots + COOLER.upgradeSlots * COOLER.upgradePrices.length) = 40 * 20 = 800`. Check both full-set and proposed additions; refuse rather than evict live markers. Even malformed stored arrays above 800 are not silently truncated on load; sale writes refuse until enough entries expire. All valid successful sale writes keep the set at or below the cap. The 60-minute window can cross two daily budgets; do not assume a capacity refusal is mathematically impossible across midnight.

800 integers: 6,400 bytes of integer payload; 11,201 bytes for the array as compact JSON with today's 13-digit timestamps (13,601 with 16-digit safe integers), excluding field names/Firestore overhead. Missing field defaults to []. No extra collection or per-catch document exists.

### Known gaps and later work

1. **Zero ice in (b):** server price can be lower than the phone's iced-cooler preview, or the server can keep it as spoiled. Stage (c) adds server-verifiable ice spending; do not accept icedMin from the phone.
2. **Fish and size are client claims:** catalogue validation cannot prove which fish bit or its actual size. A cheater can claim maximum size. ECO-03's deck resolves this; rate, daily-money and sold-set limits only bound abuse now.
3. **Timestamp collisions:** two devices on one Player ID may catch different fish in the same millisecond; one is refused as already sold. ECO-03's deckId/castIndex replaces timestamp-only identity.
4. Stage (c) buy must create one slot per food piece (existing goodsAfter behavior), despite permissive legacy-stack normalization. TOWN-01 adds stock/fund to the same transaction later, not now. ECO-04 owns the epoch reset (including sold-set and stale receipt handling) and gate activation. No epoch or town writes in this stage.

### Budget and verification

**Accepted sale = 2 reads + 2 writes**, player + operation log, before Firestore contention retries. No per-catch writes. A replay/refusal after transaction lookup costs reads but writes nothing. Existing pre-read syntax/auth checks remain in place. The 40 accepted-op budget is shared with Fish Book/story; 200 players at the maximum is 16,000 writes plus other activity, not a global quota guarantee.

Checks: `npm test` 199 pass; `npx tsc -b` passes; `npm run build` passes, including Vercel-built nonce/login/items API import/GET checks and Vite. `npm run test:rules` with Java 21 passes all 4 emulator tests, including actual concurrent duplicate sales (one payment), concurrent identical operation replay (one write), independent concurrent sales (no lost coins), and owner-only read/no-client-write for economy fields. API tests cover all requested cheats plus exact skew/freshness boundaries, mixed/all-kept batches, unchanged Fish Book, receipt compatibility, historical replay, midnight, full-set/overflow, maximum cooler capacity, balance ceiling and daily-op refusal. No physical iPhone validation claimed.


## 12. ECO-02 stage (c) — server buy and ice (2026-10-29)

Based on main/dev-test-id daca0094 after PR #18. This section supersedes stage (b)'s chronological-request requirement and zero-ice pricing. ECONOMY_ON, walletStore.ts, UI and Firestore rules remain unchanged.

### Buy contract

`POST /api/items`: `{op:'shop.buy', operationId, vendor, cart:[{id,qty}], expectedTotal?}`.
Only these fields and cart id/qty are accepted. Quantities must be positive safe integers; max 10 pieces total, including repeated IDs. Vendor is gen/minato. Server calculates all prices from SHOP_BY_ID and itemPrice/marketOf(serverNow). Optional expectedTotal is a nonnegative safe integer, a ceiling consented to by the player, never a price source. A higher server total returns 409 “Prices just changed. Take another look.” and writes nothing; equal/lower charges server total. Omitted expectedTotal retains prior unguarded behavior.

Response retains the current player view and `result:{bought:[{id,qty,unit,total,special}],spent,balanceAfter,vendor,pricedAt,marketDay,expectedTotal}` (null if omitted). Call `buyReceipt(result.vendor,result.bought,result.balanceAfter,result.pricedAt)` directly. Receipt VAT remains display-only: nothing is collected or stored for VAT/town.

wallet.ts exports the same settled buying core used by the phone wrapper and server. The server normalizes its persisted expiry model first; it does not run client settle over stored food clocks. Existing valid expiresAt values are preserved. Each new perishable piece gets its own server UUID, qty=1, at=serverNow, expiresAt=serverNow+perishMin*60000. Keepers have null expiry and stack to BAG.maxStack=20; BAG.slots=20. Legacy perishable stacks remain intact, but no new piece is added to them. Upgrades bypass the bag and progress 0→1 (400), then 1→2 (900), one upgrade per cart; third upgrade refused. Funds, limits, stock availability, vendor and capacity failures roll back the entire order. Computed balance is checked before commit.

### Ice contract and shared calculation

`{op:'bag.use',operationId,uid}` spends one owned ice (decrement stack or remove last piece) and appends serverNow in the same transaction. Non-ice returns “Eating and gifts come later”. No owned ice/full event history refuses with no changes. Result `{uid,used:'ice_block',usedAt,balanceAfter}` is logged verbatim. Player view includes goods and iceUsedAt.

Root `iceUsedAt:number[]`: default []; sorted, retained while event+3,610,000>now, at most 16 ordinary use events. Never reset at midnight or evict live events; capacity refuses use before spending. Equal millisecond events remain distinct because each spent an ice. Reads remain nonthrowing and preserve oversized legacy live arrays; use refuses until enough expire. Maximum array storage: 16×8=128 integer payload bytes, 225 compact JSON bytes for current 13-digit milliseconds, 273 for safe-integer-width timestamps, excluding key/Firestore overhead.

`iceMinutesFor(caughtAt,iceUsedAt)` in market.ts sorts a copy and processes confirmed events chronologically. Events before caughtAt do not apply. At each event, freshnessOf with the extension accumulated so far must still be non-null; only then add 15 minutes, capped at 30. Ice at the exact spoil boundary cannot revive a fish. No client ice/minute claims accepted. Both validateSaleCatch and sale pricing use this function; stage (d) will use it on the phone. The server has no cooler and cannot refuse ice based on whether it helps currently held fish.

### Sale ordering, replay and budget

Sales accept any request order. A copy decorated with original indices is sorted before validation and sequential pricing; sold/keptLines retain original request indices. Duplicate timestamps and gaps below 3s still refuse. Fish Book ordering is unchanged. Hashing preserves original array order; changed order under an existing operation ID is a changed body.

Buy hashes vendor, cart and optional expectedTotal; use hashes uid. Same ID/body returns original logged result even after price/expiry/day changes; changed body returns 409. Current player view accompanies the historical result. Accepted buy/use each read player+log and write player+create-only log: **2 reads + 2 writes**, excluding contention retries. Log spent is coins out; balanceAfter is the final balance. Replays/refusals write nothing. Shared 40 accepted operations/day means 80 writes/player, 16,000 for 200 players, plus other traffic.

### Verification and remaining scope

205 unit/API tests cover price-guard midnight protection, lower/unguarded prices, changed-cart/guard replay, funds, limits, vendor, soon items, quantity bounds, stacks, full bags, food slots and stored expiry, upgrade sequence, ice ownership/capacity/retention/exact spoil boundaries, shared iced sale pricing and reversed indices. Five emulator tests include real simultaneous buys competing for the same coins, last-ice use races, identical buy retries and ownership. Run npm test, npx tsc -b, npm run build (includes test:api), npm run test:rules.

Server zero-ice pricing is resolved. Client wallet integration remains stage (d), so local unconfirmed ice does not count on the server. Claimed fish/size and timestamp collisions remain ECO-03 gaps. ECO-04 epoch reset must clear iceUsedAt as well as other economy state without erasing ledger history. TOWN-01 owns eventual VAT/fund/stock changes. No physical phone validation claimed for this API-only stage.

## 13. ECO-02 stage (d) — the phone uses the server (2026-10-29, Claude)

### Who owns what now
| Thing | Where | Notes |
|---|---|---|
| Cooler (unsold catches) | device, per Player ID | rots in 30 min; the phone's own business |
| Coins, goods, cooler level, daily counters, ice events | server | the device keeps a cache of the last answer |
| Pending trade (answer lost) | device, per Player ID | the exact request, resent by Retry |
| Sandbox (`?test=shop|free`) | device only | the pure wallet, no account, no server |

Code: `src/game/economy/economyStore.ts` (logic, injected storage/clock/transport), `walletStore.ts` (the instance + React hooks), `game/saves/cloud.ts` (transport + every answer refreshes the cache), `components/shop/ShopCounter.tsx` (busy lock, Retry row, WAITING fish).

### A trade, step by step
1. The player taps Sell / Pay / Use. The phone checks what it can (something picked, enough coins in the cache, ice that helps) and whether it is online. Offline → the vendor's line, nothing sent.
2. It makes ONE `operationId`, saves the exact request as *pending*, locks the counter and sends it.
3. Answer OK → cache updated, pending cleared, the slip prints from the server's result.
4. Answer "no" (4xx) → nothing happened on the server; pending cleared; the vendor says why.
5. No answer / 5xx → it may have gone through. Pending stays; **Retry** resends the same bytes. The server's log replays the first result, so it can never pay or charge twice.

### Server switch and preview
- `ECONOMY_API=on` must be set for the server to accept money ops. Production: OFF until ECO-04.
- The game shows the shop only in `npm run dev`, sandbox pages, and Vercel **Preview** builds with `VITE_ECONOMY_PREVIEW=1`.

### Vercel setup (Teera, once)
In Vercel → project **swimming_pool** → Settings → Environment Variables:
1. Add `VITE_ECONOMY_PREVIEW` = `1` → Environment: **Preview** only → "Select a custom Preview branch" → `dev-test-id`.
2. Add `ECONOMY_API` = `on` → **Preview** only → branch `dev-test-id`.
3. Check that the Firebase server credentials the API uses (the same variables Production has) also exist for **Preview, branch `dev-test-id` only**, not for all previews: previews write the real database.
4. Never add `ECONOMY_API` to **Production** before ECO-04.
5. Redeploy the latest `dev-test-id` preview (env changes apply to new deployments only).

### iPhone checklist (on the dev-test-id preview URL)
1. Unlock your Player ID → walk to Gen: coins show the server's number (0 at first).
2. Catch 2–3 fish at Quiet Bay → sell to Gen → the slip shows the server's prices; reload: the coins stay.
3. Buy a Block of ice → the slip shows "VAT 7% (included)"; the coins drop by exactly the Pay bar total.
4. Catch a fish, use the ice → its countdown grows by 15 min; reload: still iced.
5. Airplane mode → Sell → "No signal, no sale…", nothing changes → airplane off → sell works.

### Known limits
- Fish and size are still claimed by the phone (ECO-03 fixes). Two devices catching on the same millisecond collide (ECO-03).
- `bag.use`, `shop.buy`, `shop.sell` share the 40 operations a day budget.
- The Firestore emulator tests were not run in this session (no emulator download in the sandbox).

## 14. ECO-03 stage 2 — shared roll only (2026-10-29, approved)

Based on main `79bd8d0`, after pulling the merged PR #21 fixes. This stage adds only pure deck modules/tests and documentation on local `dev-test-id`. No existing gameplay, Dalbit, wallet, API, Firestore or gate implementation changed. The live economy remains gated until ECO-04.

`src/game/fishing/deckConfig.ts` holds the approved version/window/cast-count/duration settings and future tier-sale policy. `deckRollV1.ts` freezes the current 32 ready A/B kinds and roll coefficients. `deckRoll.ts` exports the ONE pure client/server function:

```ts
rollDeckCatch({ version, seed, castIndex, castInfo: { distance, nice }, castAt })
// -> { fish, sizeCm, baseDiff, big }
```

Each index has a separate uint32 mulberry32 stream, seeded by FNV-1a over the canonical domain/32-byte hex seed/index. No ambient randomness, clock, browser storage, locale or Node API. Five existing cast states collapse extra distance precision; inconsistent Nice claims refuse. Bangkok day/night and season use castAt. V1 data/math stay stable when live odds or ready art change; introduce a new version and retain v1 for outstanding tickets. The legacy story/fishing code is untouched. This pure function does not issue/authenticate a deck or validate its redemption window.

Approved future sale policy (NOT enforced by stage 2): per Bangkok day Gen buys at most **2 legend / 10 epic / 0 god** fish. Other tiers retain existing limits. Over-limit fish return a kept line, “I can’t take another trophy today”. Tier counts derive from existing `econ.soldToday`; the accepted sale still uses the same two reads plus two writes, with no extra document operation. Exposed-seed look-ahead remains possible and is accepted for offline v1; these caps bound its money effect together with existing coin/rate limits.

Retirement proof: a deck ends at exclusive E; its latest castAt < E and caughtAt <= castAt + **5 min**. Maximum confirmed-ice lifetime is **30 + 30 = 60 min**. A sellable fish therefore expires before E + **65 min**, or E + **65 min 10 s** even with a conservative extra skew margin. Keep its sold bits while it is current and previous; only retire at E + **6 hours** when current becomes d+2, leaving **294 min 50 s** of margin. Sale verification must enforce the strict cast window and five-minute duration; longer casts remain Fish Book-only. Do not clear previous bits at midnight or an early request, and replay saved operation IDs before time-sensitive checks. Two 8,192-bit windows use 2,048 raw bytes / 2,736 padded base64 characters, excluding metadata.

Approved device policy for later integration: random start per device/deck, increment with wrap, persist start/cursor/draw count, never consume more than one complete deck. Reload must not reset the draw count. No server-assigned ranges. Distinct devices can overlap; an already-paid index refuses another sale. Offline exhaustion is Fish Book-only until the next window.

Excluded now: deck route/fetching, allocation, gameplay tickets, sale verification/bits/cap enforcement, Fish Book verification and tuning. Fish Book verification will be proposed separately with its own markers. Rarity/speed tuning must first show 100,000-roll results and a coins/hour model, affect free fishing only and leave Dalbit unchanged.

Verification: **235 tests pass**, including 10 new tests. 7,680 cases agree with the existing free cast; 7,680 agree between a Vite-built browser IIFE in an isolated JS context and strictly compiled NodeNext ESM. Fixed protocol vectors, five-state boundaries, Bangkok calendar boundaries, legal kinds/sizes, malformed inputs and the retirement inequality are covered. `npx tsc -b` and `npm run build` (including all existing production API smoke checks) pass. No physical iPhone/Safari claim; no new emulator test is needed for this pure, unwired stage. Full approved plan/proof and review scope: `docs/ai/ECO-03-plan.md`.

## 15. ECO-03 stage 3 — issuance/cache (2026-10-29, approved after Claude review)

Stage 2 is published to dev-test-id as `4a7c460`, merged in PR #22 and independently verified by Claude (235 pass), as reported by Teera. Stage 3 is prepared for commit/push to dev-test-id for Claude review. Teera is testing local npm run dev; Vercel variables will be set later. `POST /api/fishing-deck` (body `{}`) returns `{address,version,deckId,seed,window:{startAt,endAt},casts,serverNow}` for the origin-bound authenticated Player ID. Same address/window = same HMAC seed; the request cannot select an owner/window/seed. ECONOMY_API must be `on`, with the same closed-shop response before services. Token verification + HMAC only: zero Firestore reads/writes. Bounded per-instance limits: 10 requests/IP/minute, 5/ID/minute.

Exact Vercel setup: **swimming_pool -> Settings -> Environment Variables -> FISHING_DECK_SECRET -> Preview -> custom branch dev-test-id only**. Generate at least 32 random bytes, e.g. `openssl rand -hex 32`; never prefix with VITE_. Keep that branch's existing ECONOMY_API=on, VITE_ECONOMY_PREVIEW=1 and scoped Firebase credentials, then redeploy Preview. Missing/short/dev-only secrets fail closed on Vercel. Production stays off. Keep a real secret stable while its decks remain redeemable; rotation needs an explicit migration. This implementation did not change remote environment variables.

`npm run dev` works without setup: serve-only server/dev/devDeck.ts supplies a fixed dev-only secret and checks only the fixed TEST token. No dev module/secret enters production API tracing or browser JS. The API is region sin1 with no-store responses. The request shares cloud.ts's authenticated, cookie-preserving timeout/error transport; account changes before sending refuse rather than using another identity.

deckStore.ts caches per ID, validates owner/version/window, ignores old-account answers, coalesces fetches, and restores a valid offline deck with its server clock offset. A cryptographically random start, persisted cursor/draw count and wrap-once reservation are ready for stage 4. Storage failure returns null before handing out a card. Simultaneous tabs/devices can still overlap; no atomic cross-tab guarantee is claimed. The client calls the endpoint only with ECONOMY_ON and a Player ID; production-off and sandbox builds send no requests. Background attach/visible rollover/reconnect refreshes cache; the cast path never fetches.

250 tests pass (15 new), including real zero-setup Vite middleware and actual compiled production/Preview/sandbox fetch gating. TypeScript and production/four-function API smoke checks pass. No Firestore mutation/rules change; no physical iPhone test claimed. See docs/ai/ECO-03-plan.md for review details.

Stage 4 owner requirement: derive Nice from distance using frozen deck bands/canonical conversion; never trust the minigame flag or throw during a valid cast. Test real fishingSession onCast outputs, including exact 0.80/0.92 band edges and adjacent values. Stage 3 does not yet change minigame/Dalbit/catch/sale behavior or enforce tier caps. Fish Book verification and tuning remain separate later work.


## 16. ECO-03 stage 4 — free fishing draws from the deck (2026-10-29, review pending)

Teera approved stage 3 after Claude's 250-pass review and endpoint probes. Pulled dev-test-id first. Stage 4 changes the free-fishing roll source only: shared roll -> existing cast timing/physics, without tuning or changing Dalbit. Nice is derived from distance with the frozen deck band, independent of the HUD flag. Bad/unavailable reservations never interrupt fishing. Casts do no networking.

One clock: throw captures gameNow() once, uses it as castAt and injects that exact timestamp into reserveCast's deck-window check. The store's separate deck-receipt clock is only for background refresh. Finish reads gameNow() for caughtAt and passes the same stamp to Book pending and cooler. Normal boundary-crossing catches keep their original ticket. More than five minutes, a backwards clock correction or an owner change makes a catch Book-only. caughtAt never precedes castAt.

No deck (including offline expiry/exhaustion/storage failures) -> old local roll -> Fish Book only, excluded from cooler/sale selection, with **“Fish Book only — can't be sold.”** on the catch card. The economy-off production flow retains its previous local Book behavior. Sandbox fishing has no authenticated deck and is Book-only. Existing cooler-full handling, ice protection and Bag goods/countdowns are preserved.

Catch ticket = `{version,deckId,castIndex,castInfo:{distance,nice},castAt}`; seed stays out of catches. Cooler and pending Book data retain it across persistence; PendingTrade retains same-order tickets beside its exact uncertain request for reload/Retry. The API still accepts/sends the ECO-02 three-field catch schema in this stage. Stage 5 must wire/authenticate tickets, enforce five minutes, current/previous sold bits and tier limits together; legacy unticketed cooler fish are left for that refusal. Book verification is still excluded.

258 tests, TypeScript and production/four-API build pass. Real Vite-compiled session tests drive press/hold/release at exact Nice edges and neighbours on both sweeps, and drive actual catches with and without decks. Store tests cover differing offsets at a window edge, duration, persistence and exact retries. Existing pending-ice/Bag-related regressions pass. No Firestore/rules change; no physical iPhone or visual-feel validation claimed. Full scope/checklist: docs/ai/ECO-03-plan.md. Stop here for review; no stage 5/tuning work.


Stage 4 review fixes (2026-10-29, Teera authorized only these two): pulled dev-test-id at ef9d13c first. addToFishBook returns the final stamp; when incoming caughtAt <= the last pending timestamp it uses lastAt + 1 and drops the ticket. The session uses that exact returned stamp for cooler eligibility/insertion, keeping adjusted catches Book-only with the existing catch-card line. reserveCast restores its previous cache if persistence fails, so memory/storage draws stay unchanged and the next successful call gets the same index.

261 tests pass (three new regressions, all demonstrated failing before the fixes), npx tsc -b and npm run build/four-API smoke pass. Tests cover equal/backward/unchanged stamps; real catches across a backwards gameNow correction, second = first + 1 with no ticket/cooler and Book-only card; failed writes, same-index retry at wrap and after reload. Pending-ice/Bag regressions remain green. No stage 5, sale validation, wire schema, TUNING, odds or UI changes. Physical iPhone testing not performed. The requested +1 ms protects local ordering; the existing three-second Book recording gap remains unchanged and can still refuse that pair.


Shared-gap correction from 820dca0 (2026-10-29): Teera superseded the +1 ms rule. addToFishBook now checks caughtAt - lastAt < LIMITS.minCatchGapMs and adjusts to exactly lastAt + that gap, dropping the ticket while sharing the final stamp with cooler eligibility. The unchanged LIMITS object lives in pure server/saves/limits.ts, re-exported by rules.ts; this avoids bringing Node-only validation code into the browser. Updated regressions cover backward/equal/just-under-gap inputs and exact-gap preservation, and execute real parseCatches/applyCatches to accept both catches together and separately within the existing clockSkewMs. The old +1 ms recording limitation above is superseded; no other behavior, server validation, wire schema, odds, TUNING, UI or reservation changes.

Validation for the shared-gap correction: 261 tests pass, zero failures/skips; npx tsc -b and npm run build (four API smoke checks) pass. Physical iPhone testing not performed. Stopped for review.


## 17. ECO-03 stage 5, step 1 — fresh Book/paid-index foundations (2026-10-29)

Approved simplified plan: docs/ai/ECO-03-stage5-fishbook-plan.md. Gen stays the buyer. Only Teera has saves; reset is allowed, so there is no archive, migration, versioning or old-field preservation. The new Book stores only per-kind best/sold, with presence = found; 27 supported sellable kinds, shared star thresholds 25/12/6/3 and species-only strike scale 1.15.

Step 1 adds pure config/data helpers and canonical current/previous bitmap/cutoff helpers only. No API/gameplay integration or schema/rules change; the current sale still needs the step-2 verifier. No active reset/cutoff, Book writes or mastery modifier is enabled. Twelve new pure tests; 273 total tests pass, TypeScript and production/four-API build pass. No emulator scenario is relevant until transaction wiring in step 2. All testing was local; no shared-database writes, main merge or settings changes. Commit/push only dev-test-id and stop for review.

## 18. ECO-03 stage 5, step 2 — atomic verified sales (2026-10-29)

This section and the approved simplified plan (`docs/ai/ECO-03-stage5-fishbook-plan.md`) supersede earlier timestamp-marker/guide-recording assumptions above. Gen remains the buyer; Minato remains the food counter. Testing/release stays local/emulator on dev-test-id until ECO-04.

Fresh shop.sell catches contain `{fish,sizeCm,caughtAt,ticket:{version,deckId,castIndex,castInfo:{distance,nice},castAt}}`; there is no client seed, owner, price, ice, Book or star input. Bounded shape parsing/hash precede the transaction. The existing operation log is checked first; an exact Retry returns the original receipt with no write even after spoilage, midnight, retirement, capacity changes or missing secret/cutoff. All semantic verification is inside the existing transaction. `fishingDeckSeed` is shared with issuance; `validateSaleCatch` reconstructs the authenticated owner's roll from version/window/index/quality/castAt, checks exact species/size and strict cast membership, <=5-minute duration, caughtAt >= castAt and <=10 seconds future skew. Only confirmed ice extends freshness. The entire batch is validated before any payment; duplicate/paid/missing/mismatched tickets refuse the batch.

Paid lines alone update root `paidDecks` (current/previous slots), root `fishBook` (per-kind best/sold), coins and econ usage alongside the immutable receipt, still two reads/two writes per uncontended commit. Daily tier usage derives from soldToday across kinds, resets at Bangkok midnight and does not reset lifetime Book counts. Valid spoiled/capped lines stay unpaid and unrecorded; all-kept and invalid requests write nothing. Tier-kept receipts use Gen's approved trophy line. `recentSoldAt`, the server recording parser/rules/counters and fishbook.record are removed. Remaining client guide/gap cleanup and star-window behavior belong to step 3. No old-format conversion or reset-on-request is introduced; use controlled fresh test saves.

Stored Book values are strictly `{best,sold}`. API load/sale views expose `{best,starred}` and totalKinds 27; lifetime sold is hidden from the display projection. Raw malformed Book/paid state is preserved by normalization so a sale fails closed instead of silently clearing counters/protection; ordinary story/buy/ice writes retain new fields. Browser Firestore permissions remain unchanged: own player/log reads, no client writes. Admin performs the schema/authenticity checks.

New sales require fixed `FISHING_DECK_REDEEM_FROM_DECK_ID` and the existing `FISHING_DECK_SECRET`; missing configuration fails closed on Vercel. The serve-only dev plugins share the dev-only secret and pin the next full six-hour window once in ignored `.dev/fishing-policy.json`; no manual env setup, no moving cutoff on restart. Sales await that pinned boundary. Do not independently clear policy/saves while still accepting outstanding tickets. Old-writer retirement and coherent reset/activation are pre-release work for ECO-04, not exercised against shared data here.

A stored window ahead of the transaction clock is unsafe, including a 4-ms worker-clock difference at rollover: refuse new sale with 503, no write and no dropped bits. At exactly the boundary, retain both valid slots and reject reuse with 409. Exact logged requests still replay first. A deck ending E has a conservative last-sale tail < E+65m10s (5-minute cast +60-minute iced lifetime +10-second skew); its bits remain through E+360m, leaving 294m50s safety margin.

Checks: 271/271 unit tests, TypeScript, production build/four compiled API smoke tests, and 9/9 real Firestore emulator tests pass. The emulator covers same-index contention/replay, distinct same-time index accumulation/star crossing, cast/ice/freshness/midnight/retirement boundaries and historical receipts, competing last tier/coin allowance with atomic refusal, owner-only read/no browser-forged Book/bits/logs, plus the additional fast/slow-clock boundary. Existing pending-ice, exact client Retry and Bag/goods-clock regressions pass. Local dev start/deck/load HTTP probes pass; no physical-device/UI-feel or shared-database validation is claimed. See the step-2 review result in the approved plan for the test inventory and intermediate client limitations.

## 19. ECO-03 stage 5, step 3 — sale-only Book client and safe selection (2026-10-30)

This supersedes the step-2 **local dev** next-window activation and the old catch-time/guide Book behavior. Gen remains buyer and Minato food. Fresh local dev pins the **current** six-hour window, so no six-hour wait. Stable production activation still needs the approved new full window; see the explicit FISHING_DECK_REDEEM_FROM_DECK_ID checklist in docs/ai/PROMPT_economy_live.md. No Vercel settings/shared data were changed.

Local fresh-start procedure (only TEST saves; stop the dev server first):

```sh
npm run dev:reset-fishing
npm run dev
```

Reload each game tab afterwards. The reset clears `.dev/` (local policy and player saves/operation logs) together and refuses NODE_ENV=production or VERCEL. It never touches the Player ID vault/recovery words. The recreated policy pins the current window and supplies a new dev-only reset token; the DEV client drops that account's cooler/pending trade/economy/Book/deck caches on its next load, once even if writes are blocked. This is an explicit full test reset, not a production epoch/migration. An existing step-2 future policy is retained until this coherent reset; do not delete only the policy or only the paid bits. A fresh-machine real Vite test proves issue -> immediate verified sale -> exact Retry with zero env setup.

The Book now stores only the server's verified projection in a new read-only, account-scoped cache (`sp_verified_book_v1_<address>`). Lower revisions and other-account responses are ignored. Missing/corrupt/blocked caches are safe, guest/sandbox never gain entries, and obsolete local Book/pending keys are ignored or removed without upload. No local catches or guide actions update it. `guideRecord.ts`, guide record hooks, pending labels and the three-second Book timestamp path/config are removed; Kai/Nami keep teaching. Book/Book-derived Bag display shows found kinds, best and star, total 27, never lifetime counts. The old local Book-reset sandbox button now only clears test results.

A free cast snapshots its species star from the verified view, applying FISH_BOOK.strikeWindowMultiplier=1.15 only to strike time (0.40s -> 0.46s for difficulty 5). It changes no ticket, roll inputs/probability, size/difficulty, wait/reel or story behavior. New eligible catches in the cooler show “New! Sell it to Gen to add it to your Fish Book.” Practice/non-sellable/full-cooler/pre-cutoff cases do not promise Book progression.

The existing items responses expose redeemFromDeckId plus bounded validated paidDecks for client convenience; unsafe marker state gives null, not empty. This adds no Firestore operation. Quotes, selection and fresh sale bodies use the same filter: valid ticket/kind/size, cutoff, current/previous deck, clock tolerance, unpaid identity; one copy per index. Disabled shop rows explain why and Select all selects only eligible catches. The server still recomputes/verifies every claim atomically. On a definitive indexed invalid/already-paid refusal, only that cooler UID is removed with Gen's message; other fish remain and can sell on the next tap. Capped catches remain. Pending ice behavior and exact uncertain Retry bodies are unchanged, even if the ticket has since expired or a load shows its paid bit. No automatic new operation is sent after a refusal. Unknown soldToday keys are guarded in tier aggregation.

Validation: 283 unit tests, TypeScript, production/four compiled API build checks and 9 Firestore emulator tests pass. Coverage includes the real-minigame/verified-sale/Book loop, exact lost-answer Retry, device/account/revision isolation, safe obsolete/blocked storage, all client ticket filters and indexed rejection recovery, current-window dev issuance/sale/reset with production protection, hidden-count 27-kind rendered UI, per-species 1.15× strike with unchanged roll/wait/reel/story, and the direct unknown-key sale regression. Local headless UI check at 390×844 passes with a legitimate reserved/rolled catch fixture, verified Gen payment, Book/best render and second-device load; screenshot inspected, no page errors. This browser fixture does not drive the minigame; the separate integration test does. No physical iPhone/Safari test, shared-database Preview writes, main merge, release gate/epoch, rewards or tuning work is claimed. Stop for review on dev-test-id after this step.


## 20. ECO-03 final verification + stage-6 proposal (2026-10-30)

Final verification on dev-test-id b87ba82: 283 unit/integration tests, TypeScript, production/four-function API build and 9 real Firestore emulator tests pass. No runtime, odds, rules or UI change was needed. The final packet (`docs/ai/ECO-03-final-verification.md`) maps all planned coverage, records source hashes and the 294m50s paid-marker retirement margin, and distinguishes prior headless UI evidence from unperformed physical-phone/production tests. No shared-database writes, release or main merge.

Stage 6 is only a proposal (`docs/ai/ECO-03-stage6-v2-plan.md`), awaiting Teera's approval. Candidate v2 legend weight 0.9 gives ~1.68% Nice legend rolls, with 100,000-roll tables and a reproducible offline honest-play pricing/pacing model. Proposed 2,500/day versus current 5,000 halves per-ID fishing-sale exposure but caps many skilled one-hour sessions; the plan quantifies this and a 3,000 alternative. First decouple saved balance limits from daily earnings, preserving 2,000,000. V1 stays frozen/payable through a pinned full-window transition; current v2/previous v1 bits coexist without extra daily allowance and exact receipts still replay. Free-only faster wait/fill requires a real catchability argument/controller tests plus phone calibration; Dalbit remains unchanged. No proposal here changes the running v1/5,000 configuration.


## 21. ECO-03 stage 6 step 1 — independent saved-balance maximum (2026-10-30)

Teera approved a simplified v2 plan: 3,000 daily earnings, reset-local activation, frozen v1 kernel/vectors/version dispatch, bounded free motion/controller/phone tests without a formal proof. No live cutover system now; its design stays deferred in docs/ai/ECO-03-stage6-v2-plan.md. Target play is 10–30 minutes alongside social activity.

Step 1 only: `ECONOMY_SAVE.maxBalance = 2_000_000` replaces the `SELL.dailyCap × balanceCapDays` dependency in server read normalization and strict write validation. Existing values above 1.2m are safe when the next step lowers daily earnings. Current read clamping and strict invalid/overflow refusal remain; no schema, request or permission change. The active daily cap is still 5,000 and issued deck remains v1. Approved 3,000/v2/reset work is step 2, after review; no actual dev reset was performed here.

Two regressions first failed on the old coupling, then pass: preserve 1.5m/exact2m at a temporary 3,000 daily cap; real-handler load/sale/original-receipt Retry/buy/ice/story preserve the balance and Book/paid bits. One new real emulator test preserves large balances in sale/buy/Retry and reaches exactly2m, then refuses overflow without any player/Book/bit/log write. 285 unit/integration tests, TypeScript, production/four compiled API smoke checks and10 emulator tests pass; zero failures/skips. Local/demo emulator only, no physical phone/shared DB/main/release work. Stop after commit/push dev-test-id for step1 review.
