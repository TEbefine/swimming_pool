# Prompt for ChatGPT: ECO-02 — the back office for things and money

Paste everything below the line into ChatGPT (with the repo connected).

---

Read `AI_CONTEXT.md` in the repo first (ME-01, P-01, ID-01, ECO-01), then `docs/tech/fish-economy.md`.
Then help me build **ECO-02: the server side of items and money** for my game swimming_pool (Lumen Bay),
step by step. Don't write all the code at once.

## What I want

Today the money system is only on the phone (`localStorage`), so it is switched off in the live game.
I want the server to own money and things, so the shop can be real for everyone.

**The one rule that decides where anything lives:**

> The server owns anything that has value. The phone only holds what is still **unconfirmed** — and
> unconfirmed things die.

| Thing | Lives | Lifetime |
|---|---|---|
| A fish you just caught | phone only (the cooler) | 30 min, then it rots and is gone |
| Coins | server | forever |
| Things bought at the shop (nori, ice, a cooler box) | server | forever |
| Food bought at the shop (sashimi, a plate, later coffee) | server, with an `expiresAt` | its own clock, then it is gone |
| Cards, Fish Book, relationship points | server | forever |

The feeling I want: **what is in your hands can be lost; what you put away is yours forever.** Fish rot
while you walk, so you must go to the shop. That is the pressure that makes the loop fun.

**Important:** "it has a timer" and "it lives on the phone" are two different things. Food has a timer
but still lives on the server, because food can be given to an NPC later and turned into relationship
points and cards. If the phone could invent food, it could invent friendship. Only the raw catch stays
on the phone, because a catch is worth nothing until the server has checked it.

## The moment a thing becomes real: the transaction

Three things turn a catch into something real. All three are server operations:

1. **Sell to Gen** → coins
2. **Show it to Nami / Kai** → a Fish Book entry (this already exists: `fishbook.record`)
3. **Give it to an NPC** → relationship points (later, not in this work)

Everything else (walking, casting, reeling, fish rotting) touches no server at all.

## Think like a big app: the transaction rules

Follow these exactly. Explain each one to me as you build it, like a teacher.

1. **The client sends intent, never results.** The phone says "sell these catches" or "buy 2 nori".
   It never sends a price, a total or a new balance. The server computes the money from its own
   catalogue and its own clock. If the phone sends a price, ignore it.
2. **Idempotency** [doing the same thing twice has the same effect as doing it once]. Every write
   carries an `operationId` the phone made before sending. Retrying after a lost answer replays the
   saved result; it never charges twice. The repo already does this in `server/saves/handlers.ts`.
3. **Atomic** [all or nothing]. One Firestore transaction per operation. Coins down, goods in the bag,
   counters, log entry — all in one write, or none of it.
4. **An append-only ledger.** Every coin movement writes one entry in `players/{address}/log/{operationId}`
   with what happened, the change and the balance after. Never edit or delete an entry. This is how a
   bank works, and it also gives us "Gen's notebook" (a trade history screen) for free later.
5. **Server time only.** Today's market, the daily caps, the day boundary and every expiry use the
   server clock. The phone clock is only for the countdown shown on screen.
6. **Validate again on the server.** Never trust what the phone says about a catch: check the fish is
   in the catalogue, the size is inside its range, the season and day/night fit, the time is not in the
   future or older than a week, and the gap between catches is realistic. `server/saves/rules.ts`
   already has all of this for the Fish Book — reuse it, do not write a second copy.
7. **One rulebook, two runtimes.** `src/game/economy/wallet.ts` and `market.ts` are already pure
   functions that take `now` and return a new wallet. The server must run **those same functions**, not
   a rewritten copy. If the two ever disagree, that is a bug by definition.
8. **Fail soft, in character.** A refused save shows an NPC line ("My ice boxes are full for today"),
   never an error pop-up. The player keeps what they had.

## Money can only be made online

Fishing works offline: catches sit in the phone's cooler and keep rotting on their own clock. **The
shop needs a connection**, because coins can only be created by the server. If the player is offline at
the counter, Gen says the line is down and to come back — an in-world line, not an error.

Catches made offline are still sellable later, as long as they are still fresh when the player reaches
the counter (ice buys a little more time). Don't build an offline money queue: a sale priced minutes or
hours later would be wrong, and it is a door for cheating. The sale happens when the player is at the
counter, online, and the server prices it then.

## Data model (extend what exists, don't start a new collection)

`players/{address}` already holds the Fish Book and the Dalbit story. Add:

```
coins: number
coolerLevel: number
goods: [{ uid, id, qty, at, expiresAt|null }]      // the bag; ≤ 20 slots, same as BAG.slots
econ: { day, soldToday: {fishId: n}, earnedToday, boughtToday: {itemId: n} }
```

- `expiresAt: null` means it keeps forever. Food gets a real timestamp.
- **Expiry needs no timer and no cron job.** Expired things are dropped when the document is read, the
  same way `settle()` already works in `wallet.ts`. Do it inside `normalizePlayer()`.

## New operations for `POST /api/items`

Follow the shape of the existing ops exactly (`onlyFields`, `checkOperationId`, hash, `transact`,
`commit`, `playerView`).

| op | Body | What the server does |
|---|---|---|
| `shop.sell` | `operationId`, `catches: [{fish, sizeCm, caughtAt}]` | Validate every catch with the Fish Book rules → price them with `market.ts` (tier × size × freshness × today's wanted × glut) → add coins → record them in the Fish Book in the same transaction (selling is also showing) → log |
| `shop.buy` | `operationId`, `vendor`, `cart: [{id, qty}]` | Price from the catalogue + today's special → check coins, daily limits, bag space → take coins, put goods in the bag with their `expiresAt` → log |

Later, selling will also lower a **shared fish stock** for that species, and buying will add VAT to a
**town fund** (TOWN-01). Both are one shared document the sell/buy transaction already has open, so
leave room for a second document in the transaction — but don't build either one now.
| `bag.use` | `operationId`, `uid` | Ice: every fish in the cooler stays fresh longer. (The cooler is on the phone, so the server only spends the ice and answers how many minutes it bought.) |

Freshness at sale time is computed from the **recorded `caughtAt` and the server clock**, never from
anything the phone claims about freshness.

## Keep the free plan safe (Spark: 50K reads / 20K writes a day)

- **Never write per catch.** Fishing must cost zero writes.
- A shop visit = 1 player write + 1 log write = 2 writes. Ten sales a day per player × 200 players
  = 4,000 writes. That fits.
- A session costs 1 read at load, plus 1 per transaction.
- Tell me the numbers you expect before you build, and keep `LIMITS.opsPerDay` honest.

## Be honest with me about cheating

The phone still decides **which fish bites**. So a modified client can claim a rare fish and the server
will believe it, because the claim passes every rule. The validation above makes it slow and bounded
(daily catch cap, daily coin cap, realistic gaps), but it does not stop it.

The fix comes in the **next** piece of work (ECO-03), and it is already decided, so build with room for
it. The server will hand the phone a **signed fishing seed** when the game loads online — one seed
covering many casts. Cast number `i` produces its fish from `f(seed, i)` with the same rarity table the
game uses today, so the luck is real and the phone can roll it instantly, online or offline, with no
waiting. When the player sells, the phone sends `seedId` and `castIndex` with each catch, and the
server recomputes `f(seed, i)` and refuses anything that does not match. A seed is signed with the same
stateless HMAC pattern as `server/identity/challenge.ts`, so it costs no Firestore reads or writes.

What this means for you now: **the catch object must be able to carry `seedId` and `castIndex` later
without reshaping anything.** Write `parseCatches` and the sell op so adding two fields is a small
change, and keep "is this catch real?" in one function that ECO-03 can extend. Do not build the seed
system in this work. Say clearly in your plan what is safe and what is not.

## How to work with me

1. First, propose the plan: the document fields, each operation's request and answer, which existing
   functions you will reuse, the write/read budget per player per day, and what stays unsafe until
   server-rolled casts exist. **Wait for my OK.**
2. Then build in small steps I can test on my iPhone after each one:
   - (a) the player document grows (coins, goods, coolerLevel, econ) + `normalizePlayer` drops expired
     things; `load` returns them. Nothing else changes yet.
   - (b) `shop.sell`, with the phone's cooler as the only source of catches.
   - (c) `shop.buy` + `bag.use`.
   - (d) the game switches over: `walletStore.ts` stops being the source of truth and becomes a cache of
     the server answer (the cooler stays local), and `ECONOMY_ON` turns on for everyone.
   - (e) Firestore rules stay owner-read / no-client-write, and the emulator tests cover the new fields.
3. **Cheater tests that must fail** (write them as tests, like the ones in `tests/`): selling the same
   catch twice; selling a catch that is in the future; sending my own price; buying with not enough
   coins; buying past a daily limit; two devices selling the same fish at the same time; a replayed
   `operationId` with a different body; writing to another player's document.
4. After each step, update `AI_CONTEXT.md` (block ECO-02 + one Log line) and `docs/tech/fish-economy.md`.

## Not in this work (don't build, don't block)

Signed fishing seeds (ECO-03) · the town: fish stocks that regrow, the VAT fund, the Mayor's board
(TOWN-01) · the receipt and the money notebook in the Bag · coffee that costs coins · giving things to
NPCs and relationship points · trading between players. I will do those next, in that order. Leave the
door open for all of them. **No bank** — Teera decided against it, so don't design for one.

## My house rules

- Build and test on the `dev-test-id` branch (`npm run dev` plays as a TEST Player ID with local dev
  saves through the real rules). Merge to `main` only when a step is finished.
- Anything that exists only for testing must be impossible to reach in the live build.
- One config file for every number. No magic numbers in the code.
- Must stay fast on an iPhone 13 and on low-end phones.

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.
