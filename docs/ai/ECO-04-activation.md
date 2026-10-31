# ECO-04 step B — opening the shop: the activation checklist

Step B code (dev-test-id): `ECONOMY_EPOCH = 2` (wipes the ECO-02/03 test money once), the client gate is gone
(the Harbour Fish Shop room, the path from Quiet Bay, the coin chip and the cooler Bag are in every build), and
the sandbox wallet (`?test=shop|free`) exists only in `npm run dev` and Vercel Preview builds. The dev console
`__shop` is stripped from production (tests/eco04-production.test.mjs checks the compiled bundle).

**Whether Gen trades is decided only on the server:** `ECONOMY_API=on` (Vercel) AND Firestore
`config/economy { open: true }`. Missing or unreadable = closed.

## The moment A

Opening is at **12:00 UTC = 19:00 Bangkok** on a day Teera picks. Get the cutoff number for that day:

```
npm run eco:cutoff -- 2026-11-07
```

It prints `FISHING_DECK_REDEEM_FROM_DECK_ID = <N>` and refuses past or impossible dates. Tickets from any earlier
6-hour window can never be sold, so no test catch from before A reaches the live economy.

## Before merging (any day before A)

1. **Vercel → swimming_pool → Settings → Deployment Protection**: turn on Vercel Authentication, choose
   **Standard Protection**, Save. Check in a private window: an old deployment URL asks for a Vercel login;
   `https://swimming-pool-five.vercel.app` opens normally.
2. **Firebase console → lumen-bay → Firestore → Data**: create collection `config`, document `economy`,
   field `open` (boolean) = `false`. This is the shop switch from now on.
3. **Vercel → Settings → Environment Variables**, environment **Production** only:
   - `FISHING_DECK_SECRET` = a NEW value from `openssl rand -hex 32` (not the Preview one). Mark it Sensitive.
   - `FISHING_DECK_REDEEM_FROM_DECK_ID` = the number from `npm run eco:cutoff`.
   - `ECONOMY_API` = `on`.
   - Delete `VITE_ECONOMY_PREVIEW` (Preview): the code no longer reads it.
4. Merge `dev-test-id` → `main`. Vercel deploys production (env changes apply only to new deployments).
5. On the iPhone, unlocked: walk to Gen → "The shop is closed today.", coins 0. Fishing works; catches wait in
   the cooler but cannot be sold yet.

## At A (or later — never before)

6. Firebase console → `config/economy` → `open` = `true`.
7. Within about a minute (each server copy refreshes its cached switch at most once a minute), reload the game:
   catch a fish after A, sell it to Gen, check the slip and the coins.

## Kill switch

Set `config/economy open` = `false`. New sales, purchases and ice stop **at once** (every money transaction reads
the switch itself); the screens show "The shop is closed today." within about a minute. Trades that already
happened stay done; their Retry still shows the original slip. Do **not** roll back to an older deployment:
pre-ECO-04 code is an old writer. Flip the switch instead.

## Never

- Open before A (tickets from before A are refused; players would see unsellable fish).
- Change `FISHING_DECK_SECRET` or the cutoff after opening (every ticket in flight becomes invalid).
- Raise `ECONOMY_EPOCH` again without a NEW cutoff for the new season (cleared paid tickets could be sold twice).
- Use old generated deployment URLs after the reset.

## First week: what to watch

- **Firebase console → Usage** (resets at Pacific midnight = 14:00/15:00 Bangkok). Spark: 50,000 reads and
  20,000 writes per day. **Look closer** at 30,000 reads or 12,000 writes. **Close the shop** at 40,000 reads or
  16,000 writes, then find out why before reopening.
- **Vercel → Logs**, filter `/api/items` and `/api/fishing-deck`: a run of 5xx answers or many 429s = something is
  wrong; close the shop if it keeps going.
- Your own coins: one Bangkok day can never pay more than 3,000 per Player ID. More than that = a bug: close.
- Per accepted trade: 3 reads + 2 writes. 40 accepted operations per Player ID per day (shared with story saves).

## Preview builds after step B

Preview and production share the same Firestore and the same `config/economy` switch. Previews are behind
Vercel Authentication (Standard Protection). Test money changes in `npm run dev` (local saves), not on Preview.
