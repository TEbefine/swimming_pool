// ECO-04: the money system is part of the live game. The client never decides whether the shop is open:
// the server does (ECONOMY_API on Vercel + the Firestore switch config/economy {open}).
//
// The only client switch left is the SANDBOX: ?test=shop / ?test=free give a device-only wallet (never synced,
// never the real one) for testing. It exists only in `npm run dev` and Vercel PREVIEW builds. In production
// `?test=shop` never creates sandbox coins: the page just uses the real (server) wallet.
const TEST = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('test') : null;
// (import.meta.env is undefined under plain Node — the unit tests import the rooms — so check it first)
const ENV = typeof import.meta.env !== 'undefined' ? import.meta.env : null;
const DEV = ENV?.DEV === true;
/** Set at build time in vite.config.ts: true only for a Vercel preview build (VERCEL_ENV=preview). */
const TEST_PAGES = (ENV as { ECONOMY_TEST_PAGES?: boolean } | null)?.ECONOMY_TEST_PAGES === true;

/** ?test=shop / ?test=free on a dev or preview build: a sandbox wallet of its own. */
export const ECONOMY_SANDBOX = (DEV || TEST_PAGES) && (TEST === 'shop' || TEST === 'free');
