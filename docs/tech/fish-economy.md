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
| coins | 0; ceiling SELL.dailyCap x ECONOMY_SAVE.balanceCapDays = 2,000,000; positive invalid/over-ceiling balances are refused |
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
| Already-sold caughtAt values | 256 | 2,048 bytes (256 x 8) | Until caughtAt + 60 minutes; includes maximum ice extension |
| Server ice-use timestamps | 16 | 128 bytes (16 x 8) | 60 minutes + 10 seconds from use |

These are sorted timestamp arrays, not copies of fish or a server cooler. Timestamp identity refuses repeat claims with the same caughtAt even if fish/size is changed; forged new timestamps remain an ECO-03 limitation. With 13-digit epoch milliseconds the two arrays use at most 3,585 and 225 compact JSON bytes respectively, before property names; Firestore field/document overhead is additional. Wider safe-integer timestamps would use at most 4,353 and 273 bytes respectively. At capacity, refuse the new operation in character until an entry expires; never evict a live sold marker. This intentionally caps sales at 256 fish within the retention window and ice use at 16 events within its window, even across midnight. Add these numbers to economyConfig when those stages are implemented. Keep replay lookup ahead of time-sensitive validation.

### Quota and checks

The shared accepted-operation budget is now **40 per Player ID per Bangkok day**. A load costs 1 read and no writes. An accepted transaction costs 2 reads and 2 writes (player plus operation log), before Firestore contention retries. A replay has reads but no writes and does not consume the accepted-operation budget. At 200 players, 40 accepted operations each allow 16,000 writes/day; retries, rejected requests, session/login traffic and extra IDs still need headroom and monitoring. Per-instance request throttles are not a global quota guarantee.

Validation for (a): API regression tests cover new/old saves, read-only expiry at its exact boundary, persistence on the next existing operation, preserved story/Fish Book, invalid/duplicate/oversized goods, Bangkok rollover, 40-op exhaustion/replay/reset, and storage bounds. All 23 API tests pass after review fixes. API TypeScript compilation passes; the compiled items handler imports and returns the expected 405 for GET. Checks used the isolated current source and preinstalled dependencies. Teera independently verified the prior stage (a) branch: npm test (178), tsc -b, npm run test:api (including api/items.js), and npm run build all pass. The earlier local EISDIR was an environment problem. After these review fixes, 23 targeted API tests and the API TypeScript check pass locally; the full suite has not been rerun here. Emulator rules remain stage (e); no rules were changed.

Phone check after pulling `dev-test-id`: `npm run dev`, open the TEST Player ID, visit Quiet Bay, record a catch with Nami/Kai, reload and verify the Fish Book persists; verify the existing story still loads. There is no new visible wallet behavior in (a). The developer can inspect `/api/items` load for coins=0, coolerLevel=0, goods=[] and today's econ counters, with no new .dev player entry until the first accepted save. No shop operation is newly exposed. Physical iPhone confirmation is pending before merge to main.


### Stage (a) review fixes (2026-10-28)

Daily counters clamp to their configured maximum instead of resetting to zero when an owner lowers a limit. Goods use SHOP_BY_ID; catalogue perishability changes repair clocks rather than deleting otherwise valid rows. Existing keeper stacks remain intact when changed to food. The balance guard `checkedCoinBalance` refuses totals above SELL.dailyCap x 400, currently 2,000,000; stage (b) must call it on the computed post-sale balance before commit. End-of-file blank lines were removed. Tests cover lowered config, keeper/food conversion with 20 units, repaired expiry, and balance overflow without writes. No shop.sell implementation is included in these fixes.
