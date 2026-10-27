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
8. **Server**: the same pure functions run in `/api/items`; sales only for catches the server recorded; then `ECONOMY_ON` for everyone

## 9. Teera decides
- Currency name (Bia / ฿ / other) → one line in `CURRENCY` + a coin icon sheet
- Gen buys / Minato sells split (or both do both), and their shift hours
- Prices and limits (all in config)
