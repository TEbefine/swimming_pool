// Is the money system on in this build/page? Tiny on purpose (no React), so rooms and the scene list
// can ask it too. OFF in the live game until ECO-04. On for:
// - `npm run dev` (TEST Player ID, dev saves through the real server rules),
// - the sandbox pages ?test=shop / ?test=free (a device-only wallet, no account, no server),
// - ECO-02(d): Vercel PREVIEW builds with VITE_ECONOMY_PREVIEW=1 (set only for the dev-test-id branch).
// The server has its own switch (ECONOMY_API); production refuses money ops whatever this file says.
const TEST = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('test') : null;

/** ?test=shop / ?test=free: a sandbox wallet of its own (never synced, never the real one). */
export const ECONOMY_SANDBOX = TEST === 'shop' || TEST === 'free';
// (import.meta.env is undefined under plain Node — the unit tests import the rooms — so check it first)
const ENV = typeof import.meta.env !== 'undefined' ? import.meta.env : null;
const DEV = ENV?.DEV === true;
/** Set at build time in vite.config.ts: true only for a Vercel preview build with VITE_ECONOMY_PREVIEW=1. */
const PREVIEW = (ENV as { ECONOMY_PREVIEW?: boolean } | null)?.ECONOMY_PREVIEW === true;
export const ECONOMY_ON = DEV || ECONOMY_SANDBOX || PREVIEW;
