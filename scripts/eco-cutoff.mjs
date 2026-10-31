// ECO-04 helper: print the FISHING_DECK_REDEEM_FROM_DECK_ID for an opening day at 12:00 UTC (19:00 Bangkok).
//   npm run eco:cutoff -- 2026-11-07
// Prints the number to paste into Vercel (Production, server-only) and the exact moment the shop may open.
// Read-only: it changes nothing anywhere.
const WINDOW_MS = 21_600_000; // one fishing deck = 6 hours (src/game/fishing/deckConfig.ts)
const day = process.argv[2];
const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
if (!m) { console.error('Usage: npm run eco:cutoff -- YYYY-MM-DD   (the opening day, Bangkok calendar)'); process.exit(1); }
const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
if (new Date(at).toISOString().slice(0, 10) !== day) { console.error(`Not a real date: ${day}`); process.exit(1); }
if (at % WINDOW_MS !== 0) throw new Error('12:00 UTC must start a 6-hour window');
const cutoff = at / WINDOW_MS;
const bangkok = new Date(at + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16);
console.log(`Opening moment A : ${new Date(at).toISOString()}  (= ${bangkok} Bangkok)`);
console.log(`FISHING_DECK_REDEEM_FROM_DECK_ID = ${cutoff}`);
if (at <= Date.now()) { console.error('\nThis moment is already in the past. Pick a future day.'); process.exit(2); }
console.log('\nPaste the number into Vercel Production only. Flip Firestore config/economy open:true at or after A, never before.');
