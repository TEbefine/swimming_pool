# Prompt for ChatGPT: ECO-04 — turn the money on for real players

Run this **after** ECO-02 and ECO-03 are finished and merged.
Paste everything below the line into ChatGPT (with the repo connected).

---

Read `AI_CONTEXT.md` (ECO-01, ECO-02, ECO-03) and `docs/tech/fish-economy.md` first.
Then help me do **ECO-04: open the shop to everyone**, step by step.

The money system has been switched off in the live game since the beginning (`ECONOMY_ON` in
`src/game/economy/flags.ts` is only true for `npm run dev` and `?test=shop|free`). The server now owns
the coins and the fish are verified, so it can be real. This step is small but it is the one that
touches every player, so it must be careful.

## What to do

1. **Remove the gate.** `ECONOMY_ON` becomes true everywhere. The Harbour Fish Shop appears in the
   scene list and the path from Quiet Bay's left shore opens for all players.
2. **The phone's wallet becomes a cache, not the truth.** `src/game/economy/walletStore.ts` currently
   keeps the wallet in `localStorage` and treats it as real. After this step it holds only (a) the
   cooler — catches not sold yet, which are the phone's own business, and (b) a copy of the server's
   last answer, for instant drawing. Every number the player can spend comes from the server.
   If the server and the copy disagree, **the server wins, silently**.
3. **Old local wallets are dropped.** People who played the test build have coins in their browser that
   were never real. Ignore them, don't import them — importing invented money into a live economy is
   how an economy dies on day one. Keep their cooler.
4. **A kill switch I can use without a deploy.** One server-side setting that turns the shop off and
   makes Gen and Minato say the shop is closed today. If something goes wrong on a Saturday night I
   need to stop the money without waiting for a build. Tell me where to flip it.
5. **Watch the usage.** After it is live, show me how to read Firestore reads/writes per day against
   the Spark limits (50K/20K), and what number means "stop, we have a problem".

## Before you remove the gate, check these

- A brand-new player with no save: the shop works, the wallet starts at zero, nothing crashes.
- A player with an old test wallet: their fake coins are gone, their cooler survives, no error.
- Two devices on one Player ID: sell on the phone, then open the laptop. The laptop shows the right
  coins. Sell the same fish on both at once and exactly one sale wins.
- No connection: fishing works, the shop says the line is down, nothing is lost.
- The production bundle has no dev console (`__shop`), no test wallet key and no test branches.

## How to work with me

1. First the plan, including what you will do about old local wallets and where the kill switch lives.
   **Wait for my OK.**
2. Then do it in two steps I can test: (a) the wallet becomes a cache of the server, with the gate still
   on; (b) the gate comes off.
3. Update `AI_CONTEXT.md` (ECO-04 + one Log line) and `docs/tech/fish-economy.md`.
4. Tell me plainly what to watch in the first week and what would make us flip the kill switch.

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.
