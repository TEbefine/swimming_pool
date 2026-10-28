# Prompt for ChatGPT: TOWN-01 — the bay is a shared thing (fish stock, VAT, the town fund, the Mayor)

Run this **after** ECO-04 is live and has been played for about a week.
Paste everything below the line into ChatGPT (with the repo connected).

---

Read `AI_CONTEXT.md` (ECO-01 to ECO-04) and `docs/tech/fish-economy.md` first.
Then help me build **TOWN-01: the town layer**, step by step. Don't write all the code at once.

## Why this exists (the teaching goal)

Until now every player has a private economy. TOWN-01 makes one thing **shared**: the bay itself.
Players should learn, by playing, three real-world ideas without a lecture:

1. **A shared resource can run out** [the "tragedy of the commons": when everyone takes what is
   free, nobody has any left]. Fish stock goes down when fish are sold and grows back slowly.
2. **Tax is not a punishment, it is a pool.** VAT [value-added tax, a percentage inside the price
   of what you buy] goes into a town fund that pays for things everyone enjoys.
3. **Rules that protect the resource can feel annoying, and still be right.** A closed season.

Thailand really does this: the central Gulf of Thailand is closed to fishing each year from
15 February to 15 May so fish can breed. VAT is really 7% (the standard rate is 10%; 7% is the reduced
rate, extended to 30 September 2027). Use these as the in-game "why", but keep every number in one
config file so they can change. Please re-check the current year's closure order before any real
date appears on screen.

## Decisions already made (don't reopen them, build with them)

- **VAT is included in the price**, never added on top. Buying is taxed; **selling fish is not**.
  The receipt slip shows a line like `VAT 7% (included): 3`.
- **No bank.** Coins are earned by selling fish and leave the world by being spent.
- **Stock is reduced when a fish is SOLD**, not when it is caught. Offline catches touch no server,
  and a fish that rots in the cooler never became real, so it never counted.
- **Stock must never reach zero.** Two walls: a *reserve* the server will never go below, and an
  automatic *closed season* above it.
- The signed fishing deck (ECO-03) stays **stateless**. Stock must **not** change which fish bite,
  because the deck is the same 6 hours for everyone. Stock only controls what Gen will **buy**.
- Everything is server-owned. The phone only draws what the server says.
- **A fresh start must be possible** (see ECO-04, "fresh-start epoch"). The town document carries
  the same `epoch` number and is wiped by it.

## The town document

One shared document, e.g. `town/lumen-bay`, opened by the same transaction as the player document:

```
epoch: number
stock:  { [fishId]: { n, day } }      // n = fish left, day = Bangkok day it was last settled
closed: { [fishId]: sinceDay }        // species under closed season
fund:   number                        // coins from VAT, not yet spent
built:  [projectId]                   // town projects already paid for
totals: { minted, burned, vatIn, fundOut }   // for the audit below
```

- **Capacity and regrowth are config, per species**, derived from tier (common = many, legend = few),
  never typed by hand 100 times. Add `TOWN.targetPlayers` (default **50**) and scale capacities from
  it, so I can change one number when I know how many people really play.
- **Regrowth is lazy**, like expiry in ECO-02: no timer, no cron. When the document is read, apply one
  step per elapsed Bangkok day (cap at 60 days). Use a *logistic* step
  `n += r * n * (1 - n / capacity)`. Explain to me why this teaches something real: growth is
  fastest in the middle and painfully slow near zero, so a collapsed stock takes a long time to heal.
- **Reserve:** the server refuses any sale that would take a species below `reserve` (e.g. 5% of
  capacity).
- **Closed season:** when a species falls under `closeBelow` (e.g. 15%) it closes; it reopens only
  above `reopenAt` (e.g. 40%). The gap between the two numbers is on purpose, otherwise it flickers
  open and shut every hour.
- **Closed species:** Gen refuses to buy them, in his voice. The Fish Book still accepts them. The phone
  treats them like protected animals and releases them (the mechanic already exists), but that is a
  courtesy; the server's refusal is the real rule.
- **Many players, one fish:** inside the transaction, accept catches of that species one by one until
  the reserve is hit, refuse the rest with a reason per catch. Never half-charge, never go negative.

## What the player sees (teaching, not tooltips)

- Gen's lines use real percentages, e.g. "Sardines are 38% of what's in the bay today. Leave some for
  tomorrow." A Fish Book or board line may show `Sardine 96 / 120 (80%)`.
- The receipt after a purchase shows items, VAT, total. VAT is computed **once per receipt** from the
  total: `vat = round(total * rate / (1 + rate))`. One function, one rounding rule, tested for every
  total from 1 to 5,000: `0 <= vat < total`, and net + vat = total.
- The fund total and what it is saving for are visible on the board.

## The fund and the Mayor

- VAT goes into `fund` in the same transaction as the purchase.
- **Town projects** are a config list (`id`, `cost`, `effect`), e.g. a lit lantern at the bay, a
  festival day. When `fund >= cost` the project is paid, `built` gets the id, and the effect becomes a
  flag the client reads (the Harbour Fish Shop's lantern already pulses at night in `world/ambient.ts`;
  a project can brighten it or light more of them. Don't draw anything new). Spending the fund is the **only** way coins return to the world.
- **The Mayor** is a new NPC and **the board** is a read-only screen (stock list with percentages, the
  fund, the next project, closed species). Propose where each lives; I will decide. Don't build art.
- Players cannot spend the fund or close a season. v1 has **no voting** and **no admin button in the
  client**. Any manual override is a server-side script I run myself.

## The warning you must deal with first: the write budget

Today an accepted sale or purchase is 2 writes (player + log). With the town document it becomes **3**.
At `opsPerDay = 40` and 200 players that is 24,000 writes, over the free 20,000. And one document that
every sale writes is a **hot document** [a single record many users write at once; it can only take
about one write per second]. Before any code, give me:

1. The new write/read numbers per player per day and for 50 / 100 / 200 players.
2. Your recommendation: lower the per-player money ops, or plan for fewer players, or note when I
   would need the paid plan. Don't silently lower a limit; show me the trade.
3. What happens in a rush (a festival day): how contention behaves and what the player sees.

## Money audit (a bank reconciles, so do we)

Every coin is accounted for: minted by Gen's purchases, burned by shop sales, held in the fund, or in
a player's balance. Write one pure function that checks the books (player balances + fund = minted -
burned, `fund = vatIn - fundOut`) and run it in tests on simulated play. If it ever fails, that is a bug
by definition.

## How to work with me

1. First the plan: the town document fields, the pure rulebook, the budget table above, how the
   lazy regrowth is tested, what stays out. **Wait for my OK.**
2. Then build in small steps I can test on my iPhone:
   - (a) the pure rulebook in `src/game/town/` (regrowth, reserve, closed season, shares in %, VAT
     split, project thresholds) and its tests. No server.
   - (b) the server: the town document opened by sell/buy, with the audit counters.
   - (c) the phone: Gen/Minato lines with percentages, the receipt slip with the VAT line, release of
     closed species at the bay.
   - (d) the Mayor and the board screen, projects unlocking from the fund.
3. **Simulation tests that must pass** (deterministic, seeded, 30 simulated days):
   - *Careful play:* the stock stays healthy and no species ever closes.
   - *Greedy play:* species close, the reserve holds, nothing hits zero.
   - *Closed season:* after the greedy run, stopping sales lets the stock climb back past `reopenAt`.
4. **Cheater tests that must fail:** selling a closed species · selling below the reserve · two
   devices selling the last fish at once (exactly one wins) · a client-sent VAT or price · spending
   the fund from a player route · a stale `epoch` · negative or fractional coins.
5. After each step, update `AI_CONTEXT.md` (block TOWN-01 + one Log line) and `docs/tech/fish-economy.md`.

## My house rules

- Build and test on `dev-test-id`; merge to `main` when a step is finished.
- Test-only code must be impossible to reach in the live build.
- One config file for every number. No magic numbers.
- Must stay fast on an iPhone 13. Fishing never waits for the network.

## Not in this work

Players voting on projects · a scarcity price premium (price rising as stock falls rewards the last
fish, which is a real market failure; I may teach it later, don't build it) · trading between players
· the receipt notebook / money history screen (next prompt) · gifts to NPCs · new art.

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.

Sources for the two real-world facts above:
[KPMG: Thailand reduced 7% VAT extended through September 2027](https://kpmg.com/us/en/taxnewsflash/news/2026/09/thailand-reduced-7-percent-vat-rate-extended-through-september-2027.html) ·
[Pattaya Mail: annual closure of the Gulf of Thailand, 15 Feb to 15 May](https://www.pattayamail.com/thailandnews/annual-closure-of-the-gulf-of-thailand-feb-15-may-15-246682)
