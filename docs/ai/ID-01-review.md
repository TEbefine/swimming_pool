# ID-01a review — local player identity

Date: 2026-10-08 (Bangkok). Branch: `id-01a-wallet`. Base: `2d7d057` on `main`.

## Scope and boundaries

The amended plan is in [ID-01-plan.md](ID-01-plan.md). This branch implements step (a), including the local recovery Teera explicitly approved. It does not implement or deploy Firebase, Firestore rules, `/api/nonce`, `/api/login`, `/api/items`, or authenticated WebSocket identity. Existing relay IDs are unchanged until the later integration steps.

The 48-hour return path is a **local preview receipt**, not an authentication credential. It is intentionally public/writable and never grants server rights. Step (b) must replace it with Firebase `browserLocalPersistence` and a server-verified wallet-sign-in time. Fresh decryption is required for revealing words or changing the code even inside the 48-hour window.

## Security details

- Seven inputs, each selected from Up / Down / Left / Right / Triangle / Circle / Cross / Square; repeats allowed. Exactly 8^7 = 2,097,152 possibilities. Keyboard arrows, T/O/X/Q. Only seven progress dots appear; no pressed colour, button scale, tone or haptic.
- BIP39 English, 128-bit entropy, 12 words; mandatory written-backup acknowledgement and three random word checks. Fixed derivation `m/44'/60'/0'/0/0`. Recovery validates word count, English wordlist and checksum.
- `src/identity/vault.ts`: PBKDF2-HMAC-SHA-256, 600,000 iterations, random 16-byte salt; non-extractable AES-256-GCM key, fresh 12-byte IV, 128-bit authentication tag. Envelope metadata is authenticated. Wrong code, modified ciphertext/address, invalid parameters and oversized records fail closed.
- IndexedDB database `lumen-bay-identity`, object store `identity`, key `vault`: only a versioned ciphertext envelope plus public address/crypto parameters. Both mnemonic and wallet private key are encrypted inside the payload. No stored plaintext combo or separate fast combo hash.
- Words/key temporarily exist in browser memory. Mutable plaintext buffers are zeroed; secret references and screen fields clear on cancel, hide, timeout, completion and disposal. JavaScript cannot guarantee physical erasure of strings/GC copies.
- `local-preview-receipt` contains only address and verification time. Updating the code does not refresh the last sign-in time. Vault writes compare the existing envelope within one IndexedDB transaction; stale tabs cannot overwrite or recreate an evicted vault.
- A missing vault offers recovery first and creates nothing automatically. A storage error is distinct from a missing record. Existing-vault replacement requires explicit recovery acknowledgement. `navigator.storage.persist()` is requested and grant/denial is reported; the Home Screen manifest uses standalone mode. Backup remains essential.
- The seven-press code remains weak against offline guessing of a stolen vault. Page compromise/extensions can expose unlocked secrets. Finger movements can still reveal a code even without visual feedback. This is test identity custody, not a promise of safety for real funds.

## Evidence and automated validation

- Node 24.19.0: **69 tests passed**, including seven wallet tests and an additional engine pause/resume integration test.
- Production TypeScript/Vite build passed with the existing Preact alias.
- Focused lint passed for the identity code, entry point and identity tests. Existing App/GameBoy lint warnings remain outside the changed behaviour.
- Production browser checks use isolated generated test identities, not a user's wallet. They cover required backup, checksum-compatible recovery, seven-press limit, repeat/drag rejection, unchanged pressed styles, wrong-code failure, confirmation mismatch, encrypted IndexedDB, 48-hour return/expiry, fresh reveal/change, hiding words on visibility change, code rotation, missing storage and disabled IndexedDB.
- Request URLs/bodies and browser logs are checked for the test mnemonic/private key; requests also checked for the encrypted vault. localStorage is checked for plaintext secrets. Identity modules contain no network or logging calls. These are concrete tested evidence, not a mathematical guarantee against browser compromise or OS backups.
- The optional browser test exercises the production build, including the in-game profile → Player ID entry and return without remounting the game. Generated screenshots contain no recovery phrase.
- Production entry JS: approximately 27.67 kB gzip; lazy wallet crypto: 41.13 kB gzip. The game loads after identity entry; no blockchain polling or WASM KDF is added. Existing game rendering, quality and sprite budgets are retained.
- Dependency audit: one pre-existing high-severity **development-only** advisory in `source-map-js@1.2.1` (already in `main`), GHSA-68fv-2mgg-jv7q. No wallet dependency advisory reported. No unrelated dependency upgrade included.

## Physical iPhone 13 check — still required

**No physical iPhone 13 was connected to the test environment. Its unlock time has NOT been measured.** Desktop Chromium at a 390×844 viewport produced 86 ms and 113 ms local unlock samples; this is not an iPhone result or prediction.

1. Open the branch preview with `?perf=1` in iPhone Safari. Create a test identity, write all words down, pass the check and confirm a seven-press code.
2. Enter the game. Tap the profile/name control, then **Player ID & recovery backup**.
3. Choose **Show my 12 words**, enter the code, confirm, then immediately **Hide words**. Read **Last local unlock: … ms · this device** at the bottom. Do not share the phrase or screenshots containing it.
4. Record three unlock samples and the iOS/Safari version. Timer covers PBKDF2, AES decryption and payload/address validation; excludes typing, module download, storage I/O and network.
5. Confirm light/dark shell, controller touches, keyboard behaviour where applicable, restore after intentional test-site storage clearing, and Home Screen launch. Preview/production origins have separate storage.
6. Run the `docs/performance.md` 10+ minute phone checks (rooms, swimming, dialogue, fishing, hide/resume). Do not claim this physical-device pass from emulation.

## Reproduce

Use Node 24+: `npm ci`, `npm test`, `npm run build`, `npm run preview`.

Optional browser suite: provide Playwright from your development environment and run `node scripts/test-identity-browser.mjs` against the production preview. `PLAYWRIGHT_MODULE` may be an absolute Playwright module path; `CHROME_EXECUTABLE` may select an installed Chromium executable. `IDENTITY_URL` defaults to `http://127.0.0.1:4173/?perf=1`; `IDENTITY_REVIEW_DIR` selects the screenshot folder (default `/tmp/id01-review`). The suite uses fresh browser contexts and test-only identities, never the user's normal browser profile.

## Changed files

- `AI_CONTEXT.md`; `docs/ai/ID-01-plan.md`; `docs/ai/ID-01-review.md`
- `index.html`; `package.json`; `package-lock.json`; `public/manifest.webmanifest`; `public/sw.js`
- `src/main.tsx`; `src/App.tsx`; `src/components/GameBoyMobile.tsx`; `src/components/NameModal.tsx`; `src/game/Engine.ts`
- `src/identity/IdentityGate.tsx`; `src/identity/identity.css`; `src/identity/policy.ts`; `src/identity/storage.ts`; `src/identity/vault.ts`
- `tests/identity.test.mjs`; `tests/engine-integration.test.mjs`; `scripts/test-identity-browser.mjs`

Independent security review and the physical iPhone check are required before Teera approves merging. Step (b) remains unstarted.
