# Prompt for ChatGPT: ECO-03 — the signed fishing deck (anti-cheat that keeps the luck)

Run this **after** ECO-02 (`docs/ai/PROMPT_item_system.md`) is finished and merged.
Paste everything below the line into ChatGPT (with the repo connected).

---

Read `AI_CONTEXT.md` (ME-01, P-01, ID-01, ECO-01, ECO-02) and `docs/tech/fish-economy.md` first.
Then help me build **ECO-03: the fishing deck**, step by step. Don't write all the code at once.

## The problem

Right now the phone decides which fish bites. A modified phone can claim a legendary fish every cast
and sell it, and the server has no way to know. That is the one hole that lets someone print money.

## The idea: the server shuffles, the player draws

**Not** "the server picks your fish when you cast" — that would add network lag to the minigame and kill
offline fishing. Instead:

1. When the game loads online, the server gives the phone a **deck**: one seed that covers many casts.
2. Cast number `i` produces its fish from `f(seed, i)` — the same rarity table the game already uses.
   The phone computes it instantly, online or offline. The player feels no difference at all.
3. When the player sells, each catch carries its `deckId` and `castIndex`. The server recomputes
   `f(seed, i)` and refuses any fish that doesn't match.

The luck is real: the phone never chose the seed and cannot change one card of the deck.

## How to make it stateless and free

Follow the pattern already in `server/identity/challenge.ts` (the login challenge). No Firestore reads
or writes for issuing a deck.

- `deckId` is **the time window, not a random id**: `deckId = floor(serverNow / DECK_WINDOW_MS)` with
  a 6-hour window. Asking twice in the same window returns the identical deck.
- `seed = HMAC(server secret, address + deckId)`. The server can always recompute it and stores nothing.
- The route returns `{ deckId, seed, window, casts }`. The phone keeps it in `localStorage`.
- **Why the window matters:** if the phone could ask for a fresh deck whenever it liked, a cheater would
  ask a hundred times and keep the luckiest one. A fixed window means there is nothing to shop for.
  Explain this back to me in your plan so I know you understood it.

## Rolling a fish

`f(seed, i)` must give the same answer on the phone and on the server, forever. So:

- One pure function in `src/game/fishing/` that takes `(seed, castIndex, castQuality, now)` and returns
  the fish, using the existing tier weights, season and day/night rules. Both sides import **this same
  function** — never two copies.
- Use a small, explicit PRNG (the repo already uses `mulberry32` in `market.ts`). Never `Math.random()`
  anywhere in this path.
- **Cast quality:** the card decides the roll; the player's cast decides how the roll is read. A "Nice!"
  cast shifts the rarity threshold and the size, the way it does today. The phone reports its own cast
  quality, so a cheater can always claim a perfect cast — that only makes them play like somebody very
  skilled, and it cannot invent a fish. Keep it that way, and say so plainly in your plan.

## Spending a card only once

A catch must not be sold twice. In the player document keep, for the **current deck only**, a compact
set of the cast indices already sold. It is cleared when the deck window changes. Catches on ice from
the previous window are still sellable while they are fresh — don't break that.

## What changes in ECO-02's code

- `parseCatches` gains `deckId` and `castIndex` (ECO-02 was told to leave room for exactly this).
- The sell op verifies every catch against the deck **before** pricing it.
- Old catches with no `deckId` (caught before this release) are **Fish Book only, not sellable**. Say
  that in Gen's voice: "No ticket, no sale. Bring me a fresh one."

## Offline

The deck is already in the phone, so offline fishing works exactly as it does now. If a player empties
a whole deck offline, extra catches still go to the Fish Book but can't be sold until they're back
online and get the next deck. Fish rot in 30 minutes anyway, so this will be rare.

## How to work with me

1. First the plan: the route, the exact fields, the roll function's signature, where the used-index set
   lives, what a cheater can and cannot do, and the cost per player per day. **Wait for my OK.**
2. Then build in small steps I can test on my iPhone after each:
   - (a) the roll function + tests proving the phone and the server always agree (same seed, same index,
     same fish — thousands of cases).
   - (b) the deck route + the phone fetching and storing a deck.
   - (c) fishing uses the deck instead of its own random roll. **Nothing about the feel may change.**
   - (d) the sell op verifies deck and index; the used-index set stops double-selling.
3. **Cheater tests that must fail:** a fish that doesn't match the card · reusing a cast index ·
   a deckId from the future · a deckId older than the window allows · another player's deck ·
   an edited seed · selling a catch that has no deck at all.
4. After each step, update `AI_CONTEXT.md` (block ECO-03 + one Log line) and `docs/tech/fish-economy.md`.

## My house rules

- Build and test on `dev-test-id`; merge to `main` when the step is finished.
- Test-only code must be impossible to reach in the live build.
- One config file for every number (window length, casts per deck).
- Must stay fast on an iPhone 13. Fishing must never wait for the network.

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.

## Updates from Teera's iPhone test (2026-10-29) — read these too

**What changed in the code since this prompt was written** (ECO-02 b/c/d are built):
- The sale's single authenticity check is `validateSaleCatch` in `server/saves/sales.ts`: add the deck check there.
- The phone's cooler lives in `src/game/economy/economyStore.ts`; catches are stamped with the **server clock**
  (`gameNow()`), and every `/api/items` answer carries `serverNow`. Use the same clock for the deck window.
- The cast already takes its random source: `cast(rng, { table, info, hour, … })` in `src/game/story/fishing.ts`.
  So the deck = give `cast` a seeded `mulberry32(seed, castIndex)` instead of `Math.random`. The roll depends on
  `info` (cast distance, "Nice!") and the Bangkok hour/season, so those travel with the catch and the server
  recomputes with them. A cheater can claim a perfect cast: allowed, it cannot invent a fish.

**Legends are too easy (Teera caught a Baby Kraken on his first cast).** Today `TIERS` in
`src/game/fishing/freeFishCatalog.ts` gives legend weight 3.5 of ~100, and a "Nice!" cast multiplies it by 1.8:
about **1 legend every 16–28 catches**. Tune it in the same step as the deck (they share the roll), with every
number in config:
- Proposed targets (Teera decides; show me the table first): common ~70%, rare ~22%, epic ~6.5%,
  legend ~1.2%, god ~0.05% before the cast bonus; "Nice!" may still raise rare+ but legend should stay ≤ ~2%.
- Write a deterministic test that rolls 100,000 casts with the real table and prints the share per tier,
  for a normal and a "Nice!" cast, by day and night. Assert the bands.
- Prices follow rarity (legend base 250 coins): show me how coins per hour change with the new odds.

**Minigame: "faster, but always possible."** The knobs are `TUNING` in `src/game/story/fishing.ts`
(`biteWindow`, `fishSpeed`, `fishTurnEvery`, `fillRate`, net size). Propose a small, config-only change so
legends feel like a fight but stay catchable on an iPhone with one thumb. Add a test that a "perfect player"
simulation can always land every difficulty (no impossible fish), and say how long an average catch takes.

**Fish Book (please propose, don't build without my OK):** Nami/Kai record catches without checking the deck,
so a faked legend could still enter the collection (and later cards). Tell me what it would cost to check the
deck in `fishbook.record` too, for catches that have a `deckId` (old catches stay as they are).
