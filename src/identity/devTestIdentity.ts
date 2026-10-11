// `npm run dev` plays as one fixed TEST Player ID (no wallet, no 12 words, no Firebase).
// Its saves go to the dev server's own store (.dev/saves.json via server/dev/devSaves.ts), never to
// the real Firestore. Production builds never accept this token: api/items.ts verifies real Firebase tokens.
// No imports and no import.meta here: the dev server (Node) loads this file too.
export const DEV_TEST_ADDRESS = `0x${'de57'.padStart(40, '0')}`;
export const DEV_TEST_TOKEN = 'dev-test-id-token-not-a-secret-0000';
