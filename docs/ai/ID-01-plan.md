# ID-01 — approved player identity plan

Approved by Teera on 2026-10-07, with amendments A–E. This document supersedes the PIN, nonce-storage, session-persistence and save-model choices in `PROMPT_player_id.md`. Step (a) branch: `id-01a-wallet`, based on `main`. Never push to `main`.

## Delivery gates

1. Plan (approved).
2. **(a), this branch:** local wallet, required backup check, seven-press controller code, encrypted device vault, persistence request, Home Screen guidance, local recovery, reveal/change-code step-up screens and timing display. Teera explicitly approved including local recovery now. No Firebase or API implementation yet.
3. **(b):** signature login, stateless challenges, replay protection, rate limiting, Firebase browserLocalPersistence and server-verified 48-hour wallet sign-in policy.
4. **(c):** validated save routes, Firestore permissions, transaction log and usage checks.
5. **(d):** recovery integration with Firebase and loading the existing player's server data on a new device.
6. **(e), later:** Firebase ID token verification in `server/wsServer.js`; do not change its trust model in (a).

Each implementation step gets review, a REVIEW PACKET (at most 15 lines), a Vercel preview/iPhone test, and explicit approval before the next step/merge. Update AI_CONTEXT ID-01 and its Log. Reward validation is not a blocker for (a) or (b).

## Device identity and encrypted vault

- Generate 128 random bits using browser cryptographic randomness: BIP39 English, exactly 12 words; derive the first Ethereum-compatible account at `m/44'/60'/0'/0/0`, without an optional BIP39 passphrase. Amoy chain ID is 80002; identity creation needs no RPC or gas.
- The public wallet address is the Player ID. Lowercase addresses are canonical for storage, UID and comparisons; checksum form may be displayed.
- Show the phrase during setup, require a written-backup acknowledgement and three distinct randomly chosen word checks. Do not complete setup until all checks pass. Never automatically overwrite an existing vault.
- Code alphabet: Up, Down, Left, Right, Triangle, Circle, Cross, Square. Exactly seven presses, with repeats allowed: 8^7 = 2,097,152 possibilities (21 bits). Require confirmation. Desktop: arrow keys plus T=triangle, O=circle, X=cross, Q=square. Backspace/SELECT deletes; Enter/START confirms.
- Render only progress dots during code entry. No pressed colours, per-key highlights, tones, haptics or button sink/scale. A physical observer can still see fingers or keyboard movements; this is not complete shoulder-surfing protection.
- Web Crypto PBKDF2-HMAC-SHA-256, **600,000 iterations**, random **16-byte salt**, deriving AES-256-GCM with a fresh **12-byte IV** and **128-bit tag** on every encryption. Authenticate the version/address/path/algorithm metadata as additional data. Strictly validate the envelope and cap sizes before deriving. Do not silently reduce the iteration count for slow phones.
- IndexedDB holds a versioned envelope: address, path, KDF/AEAD parameters, salt, IV, ciphertext. Encrypt the recovery phrase AND derived private key together because the approved flow allows revealing the words after fresh code verification. No plaintext code or separate fast code hash is stored. No plaintext secrets in localStorage, URLs, cookies, logs, analytics, caches or network payloads.
- Secrets exist briefly in memory during generation/import/decryption. Clear references on completion, cancel, page hiding and component disposal; zero mutable byte buffers where practical. JavaScript strings/garbage collection prevent guaranteed physical memory erasure.
- A stolen vault can be guessed offline. Two million combinations are weak even with 600k PBKDF2; UI throttling does not stop offline attackers. XSS or a malicious browser extension can steal unlocked secrets. This is a test identity, not an adequate custody scheme for real purchases without another security review.

## Storage loss and local recovery

Request `navigator.storage.persist()` on setup/import, and report unsupported/denied status honestly. Recommend Safari Share → Add to Home Screen after setup. Backup stays mandatory even when persistence is granted.

Safari's seven-day policy refers to days of Safari use without interaction with the site, not an unconditional seven-day wall-clock expiry. Home Screen apps have different treatment, but user deletion/device loss still destroys data. Sources: [WebKit tracking prevention](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) and [storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

An absent vault cannot reliably distinguish a first visit from total storage eviction. Always show a friendly **Restore with your 12 words** choice first, with an explicit **I'm new — create an identity** option. Never silently generate a replacement. Corruption/storage errors must not be mistaken for absence. Validate BIP39 checksum/word count locally, derive the same address, ask for a new code and encrypt locally. Existing vault replacement requires a separate explicit recovery action and a compare-before-write check. Preview domains and the production domain have separate browser storage; the written backup is portable.

## Step-up authentication and sessions

- Step (b) uses Firebase `browserLocalPersistence`. Returning on the same device within 48 hours of the **last verified wallet signature login** does not ask for the code. Token refresh and opening the game do not extend this time.
- Ask for the code after 48 hours, on a new device, before revealing words, before changing the code, and later before trading/selling. A missing vault requires recovery first.
- Never keep a decrypted key around for 48 hours. Persist only Firebase credentials managed by the SDK and public metadata. A server-issued `walletSignedInAt` claim, checked server-side for protected operations, anchors the age; a writable local timestamp is not authentication.
- In (a), a public local test-session receipt mimics the 48-hour UI only. It has no Firebase authority and grants no server rights. Replace it in (b). Fresh decryption is required for reveal/change regardless of that receipt. Clear stale step-up material on backgrounding; bound reveal/edit lifetime.

## Login flow (b)

```mermaid
sequenceDiagram
  participant P as Device
  participant V as Vercel
  participant F as Firestore
  participant A as Firebase Auth
  P->>V: POST /api/nonce (address)
  V->>V: Per-IP limit; validate origin/address
  V-->>P: HMAC-signed challenge (no Firestore write)
  P->>P: Unlock locally; sign exact SIWE message
  P->>V: POST /api/login (challenge + signature)
  V->>V: Per-IP limit; verify HMAC, expiry, origin, chain, signer
  V->>F: Create-only used-nonce marker after valid signature
  V->>A: createCustomToken(address, walletSignedInAt)
  V-->>P: Custom token
  P->>A: signInWithCustomToken with browserLocalPersistence
```

Challenge payload: version, address, cryptographically random nonce, issuedAt, expiry (5 minutes), approved origin, chainId=80002. HMAC-SHA-256 with a server-only environment secret, explicit canonical encoding and constant-time MAC comparison. Verify size/type/algorithm/version and trusted origin configuration, not arbitrary Host headers. Use a SIWE message bound to the exact signed payload. Only addresses, challenge/signature proofs and authentication tokens leave the device; never words, private keys, codes or encrypted vaults.

`/api/nonce` does **zero Firestore writes**. `/api/login` verifies everything first, then atomically creates `usedNonces/{hashOfNonce}`; existing marker rejects replay, including simultaneous attempts. Mint the token only after successful consumption. Marker fields: expiresAt, usedAt. Expired challenge rejection remains mandatory even if the marker has been cleaned up. Use bounded cleanup after valid logins; do not depend on paid Firestore TTL.

Both routes need a basic bounded per-IP limiter (initial proposal: 10 nonce requests/minute and 5 login requests/minute, tune for shared networks), request-size caps and 429 responses. Use a trusted platform-provided client IP and no Firestore counter per unauthenticated request. In-memory instance limits are best-effort only on serverless; production-wide quota protection requires an available shared/edge limiter and a daily budget guard. Rate limiting by IP cannot prevent every botnet or an attacker with valid wallets. Confirm hosting limiter availability and costs at (b), and document the actual guarantee rather than claiming a global cap from instance memory.

Responses are `Cache-Control: no-store`; never log challenges with signatures, tokens, request bodies or secrets. Firebase service account and HMAC key live only in Vercel env and ignored `.env.local`, never `VITE_*` variables or client imports.

## Save model and data (c)

| Path | Fields / purpose |
|---|---|
| `players/{address}` | schemaVersion, createdAt, updatedAt, revision; bounded ownedCards, storyWorlds, communityMemory and fishBook |
| `players/{address}/log/{operationId}` | server time, operation type, request hash, validated changes, reason, previous/new revision |
| `usedNonces/{hash}` | expiresAt, usedAt; server-only replay marker |
| Device story draft | address + world + day + base revision + unfinished local draft; never authoritative |

- **Story worlds (Dalbit):** one validated server save at the end of the day. Save an address-scoped local draft while playing so a mid-day crash can resume. Resolve stale revisions before accepting completion; local drafts cannot award arbitrary items.
- **Lumen Bay:** no game-state/movement save. Persist only community memory: Spirit fortune per day and NPC knowledge flags.
- **Lumen Bay fishing:** talk to the NPC to finish, release the fish, record species and size in the Fish Book. No fish inventory items.
- **Owned cards:** save immediately on receipt, with idempotent operation IDs. Each change gets an atomic log record. Retry must not duplicate a grant.
- Server validation: catalogue check, sensible quantity/size bounds, maximum actions per minute, permitted transitions and server-assigned ownership/time. Never accept client totals as truth. Teera permits resetting old test saves; migration is not required.
- `/api/items` verifies Firebase ID tokens, obtains address from UID, validates payloads and permissions, and transactionally updates the snapshot and creates an immutable-through-the-API log. Admin credentials bypass rules; API code must enforce append-only history.
- Keep snapshots bounded below Firestore document limits. Review schema splitting if collection growth requires it; no unbounded history arrays on the player document.

### Planned rules (not deployed in a)

| Path | Client read | Client write |
|---|---|---|
| `players/{address}` | authenticated and `request.auth.uid == address` | always false |
| `players/{address}/log/{id}` | authenticated owner only | always false |
| `usedNonces/{id}` | false | false |
| all other paths | false by default | false by default |

Logs are not immutable against administrators. Wallet control identifies the owner, but item ownership remains Firebase-backed, not on-chain NFTs.

## Shell, dependencies and performance

Reuse GameBoyMobile, its overlay, shell tokens, 24px side bezel, 24/32px title/logo bands, asymmetric corners, Nintendo mark and four existing face buttons. D-pad inputs are cardinal only and count once per press (no drag/repeat). Dot-only entry overrides press effects only inside the identity shell. Keyboard mappings are visible as static help. Use scoped CSS/gap because the existing reset defeats Tailwind spacing. Do not restyle the game.

Use focused Viem account imports and its English wordlist, Web Crypto and IndexedDB. No wallet connector kit, RPC polling, WASM KDF, animation dependency or new art. Lazy-load crypto. Later add modular Firebase client imports and server-only firebase-admin. Keep production Preact and all renderer/frame/hidden-page budgets. Pause the game behind sensitive identity screens.

Show the elapsed local unlock time (PBKDF2 + authenticated decryption + payload validation) on the identity screen with `?perf=1`; it must be measured on a physical iPhone 13 before claiming an iPhone result. Desktop or viewport emulation is not an iPhone measurement.

## Costs and checks

Stay on Firebase Spark: 50K reads/day, 20K writes/day, 1 GiB storage, 10 GiB/month outbound; no Cloud Functions. TTL deletion requires billing. [Firebase quotas](https://firebase.google.com/docs/firestore/quotas). Vercel Hobby is personal/non-commercial; commercial sales require Pro or another host. [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Illustrative 200-player day: 3 valid logins each = 600 replay-marker writes (invalid signatures/nonce issuance = 0); 1 story-day save + 5 community-memory batches + 2 immediate card grants each = 1,600 operations × 2 writes (snapshot + log) = 3,200 writes; total 3,800 writes/day before initialization/retries/limiter costs. At 100 players: 1,900. With two reads per save operation and one player read per login, allow about 3,800 reads/day plus cleanup/other reads. Actual usage depends on behaviour, concurrency and log growth; no promise that any 200-player workload is free.

Tests by stage: known mnemonic/address vectors; same address after recovery; wrong code/tampered envelope; randomness and exact KDF settings; unavailable/evicted IndexedDB; interrupted setup and conflicting tabs; no plaintext secrets in persistence/network; no repeat/drag leakage; 48-hour age boundaries and fresh step-up; replay/races/domain/expiry; owner-only rules; duplicate grants and quotas. Run `npm test` (Node 24+), production build and relevant lint; production browser light/dark/mobile checks. Phone: unlock timing and `?perf=1` for 10+ minutes plus documented game regressions. Report unperformed checks honestly.

## Rejected / superseded

- Six-digit PIN → replaced by exactly seven controller presses at Teera's request.
- Memory-only Firebase auth → replaced by browserLocalPersistence plus 48-hour signature age.
- Firestore nonce issuance → replaced by stateless HMAC challenges and post-verification replay markers.
- Discarding the phrase permanently → replaced by encrypted phrase storage for fresh-code reveal.
- Automatic identity creation on every missing vault → replaced by restore-first entry and explicit new identity.
- Per-catch fish inventory writes → replaced by NPC-finished knowledge recording; fish are released.

Vocabulary: **step-up authentication** means asking for fresh proof before a sensitive action; **idempotent** means retries cannot duplicate an outcome.
