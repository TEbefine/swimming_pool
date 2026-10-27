// Is the money system on in this build/page? Tiny on purpose (no React), so rooms and the scene list
// can ask it too. OFF in the live game until the save server holds the wallet (ECO-01 step 8):
// on only for `npm run dev` (TEST Player ID) and the sandbox pages ?test=shop / ?test=free.
const TEST = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('test') : null;

/** ?test=shop / ?test=free: a sandbox wallet of its own (never synced, never the real one). */
export const ECONOMY_SANDBOX = TEST === 'shop' || TEST === 'free';
// (import.meta.env is undefined under plain Node — the unit tests import the rooms — so check it first)
const DEV = typeof import.meta.env !== 'undefined' && import.meta.env.DEV === true;
export const ECONOMY_ON = DEV || ECONOMY_SANDBOX;
