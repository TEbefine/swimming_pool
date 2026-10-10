# ID-01 (c) — Player ID saves · review packet

Branch `id-01c-saves` (from `id-01b-login`, with `main` of 2026-10-10 merged in). Built by Claude, reviewed by an independent Claude reviewer (2 rounds, findings fixed or listed below).

## REVIEW PACKET (15 lines)
1. New route `POST /api/items` (`api/items.ts` → `server/saves/handlers.ts`, `rules.ts`, `admin.ts`), region sin1.
2. Auth: `Authorization: Bearer <Firebase ID token>`; uid = lowercase wallet address; 48-hour wallet window + login origin checked (same rule as `/api/login`).
3. Ops: `load` (1 read) · `fishbook.record` (≤ 40 catches) · `story.saveDay` (Dalbit, day-end only). Each write = 1 transaction: 2 reads + 2 writes (snapshot + create-only log).
4. Idempotent: `operationId` = log document id; same id + same body → replay, same id + other body → 409.
5. Catches: ready-sheet kind, size in range, ≤ 7 days, not future, day/night + season, ≥ 3 s apart, after the newest recorded catch, ≤ 2,000/day. Bad ones are reported by index; the rest are kept.
6. Story: `d<N>_end` only, N ≤ `STORY.lastDay` (1), never the same day twice, baseRevision match, bounded coin/item gains per day covered, append-only ledger, allowlisted flags/counters (`src/game/story/storyKeys.ts`, also the type of `setFlag`/`addCounter`).
7. Quotas: stateless checks before any read; per ID 30 ops/min + 200 accepted ops/day (in the document) and 20 requests/min + 600/day (memory, per instance); per IP 60/min.
8. Rules: owner reads `players/{address}` and `players/{address}/log/*`; all client writes denied.
9. Game: Quiet Bay catches wait on the device until Nami/Kai record them; Dalbit saves at day end; any device that unlocks the ID loads the same Fish Book + story. Guests unchanged.
10. No new secrets or env vars: uses the existing `FIREBASE_SERVICE_ACCOUNT` (server only).
11. Tests here: 117 unit (`npm test`), Vercel API build smoke for nonce/login/items, identity browser suite, identity controls suite, new `scripts/test-saves-browser.mjs` (real catch → Nami → server; day-end save; second device restore).
12. NOT run here: `npm run test:rules` (Firestore emulator download blocked in the build container) — includes the new log-read rule and a concurrent-transaction test.
13. Known limit: the client rolls which fish bites; a modified client can claim a rare fish that passes all rules. Fix = server-rolled cast tickets (next step).
14. Known limit: no global daily budget; many throwaway Player IDs can still exhaust Spark's 20K writes/day.
15. Known trade-off: a change made after a day-end save but before a retried save lands can be replaced by the server copy.

## Before testing the preview (Teera)
1. Deploy the rules once: `firebase deploy --only firestore:rules --project lumen-bay` (from the repo root).
2. Run the emulator tests on your Mac: `npm run test:rules` (needs the Firebase CLI + Java).
3. Open the Vercel preview of `id-01c-saves`, unlock your Player ID, then:
   - Quiet Bay by day: catch a fish → Fish Book shows "1 waiting · show the Fishing Guide" → talk to Nami → "Record my catches (1)" → "Done!".
   - Dalbit: play to "Say goodnight to Mother" → the objective shows "Day 1 is saved to your Player ID."
   - Another browser/device: restore with your 12 words → same Fish Book + Day 1.
4. Firebase console → Firestore → `players/<your address>` and its `log` show the saves.

## How to run the browser flow locally
```
export VITE_FIREBASE_API_KEY=test VITE_FIREBASE_AUTH_DOMAIN=lumen-bay.firebaseapp.com VITE_FIREBASE_PROJECT_ID=lumen-bay \
  VITE_FIREBASE_STORAGE_BUCKET=x VITE_FIREBASE_MESSAGING_SENDER_ID=1 VITE_FIREBASE_APP_ID=1:1:web:1
npx vite --port 5199 &
node scripts/test-saves-browser.mjs   # PLAYWRIGHT_MODULE / CHROME_EXECUTABLE as in ID-01-review.md
```
All Firebase traffic is mocked; `/api/items` runs the real handler over an in-memory store.
