# ID-01b review — Firebase wallet login

Date: 2026-10-08 (Bangkok). Branch `id-01b-login`, based on `integrate/id-01a` (`c18305e`); draft PR targets that branch. Main and PR #4 remain unmerged.

## Scope

Step (b) only: SIWE/custom-token login, persistent Firebase browser session, 48-hour wallet-signature age, replay protection and basic IP limits. No item routes/saves, player-document creation, provider UI, rules deployment or trusted WebSocket wallet identity. Wallet encryption, KDF parameters and `vault.ts`/`policy.ts` are unchanged. `storage.ts` replaces the preview receipt with a public Firebase-load hint while retaining atomic vault writes.

## Routes and replay prevention

- `POST /api/nonce` accepts `{address}`. It validates an approved Origin, normalizes the address, applies the IP limit, and returns `{challenge, message}`. The HMAC-SHA-256 envelope binds version, address, cryptographically random 32-byte nonce, origin, chain 80002, issuedAt and exactly five minutes of validity. It performs **zero Firestore writes** and does not initialize Admin.
- `POST /api/login` accepts `{challenge, signature}`. It verifies the HMAC with constant-time comparison, strict payload/size/canonical encoding, origin, chain, time, and the EOA signature over the exact server-generated SIWE message (including domain/URI/statement). Expiry is checked again after signature verification. It then calls `usedNonces/{sha256(nonce)}.create({expiresAt, usedAt})`. Firestore's atomic create-only precondition makes a duplicate fail, including concurrent requests. Only the winner calls `createCustomToken(lowercaseAddress, {walletSignedInAt, walletLoginOrigin})` and returns `{token}`. Invalid proofs never write. Token-mint failure leaves the nonce consumed; retry starts with a new challenge.
- The same `/api/login` also accepts `{idToken, address}` for session restoration. Admin verifies the Firebase ID token and checks UID, origin and the original server-issued `walletSignedInAt` against 48 hours. This path performs no marker write, mints no token and never refreshes that timestamp. A missing/expired/mismatched session returns 401 and requires unlock/re-sign.
- Responses are JSON with `Cache-Control: no-store`; only POST is accepted, bodies are capped at 8 KiB, no CORS grants are added, and error responses are sanitized. There is no request/credential/signature/token logging. Vercel-only 405 responses emit a fixed status/platform-region diagnostic, as described below.

To honor the requested **one Firestore write per signature login**, this step creates one replay marker and performs no automatic cleanup/delete or paid TTL. This supersedes the plan's bounded cleanup in this branch. Markers accumulate; Teera can remove expired markers manually using a trusted admin tool after `expiresAt`. Expiry rejection remains mandatory even if a marker was deleted. Invalid requests and session checks do not add Firestore writes.

## Origins and rate limits

Origins are exact matches against the existing production URL and Vercel's server-provided `VERCEL_URL`, `VERCEL_BRANCH_URL`, and `VERCEL_PROJECT_PRODUCTION_URL`. Optional `LOGIN_ALLOWED_ORIGINS` accepts explicit comma-separated origins for additional aliases/local development. There are no wildcard preview hosts and `Host` is never an authority. Enable Vercel's system environment variables for the branch/deployment aliases. Local HTTP is restricted to localhost outside Vercel.

Each warm function instance has a one-minute per-IP counter: **10 nonce requests/minute**, **5 login/session requests/minute**, at most **5,000 active IP entries**. A full map rejects new IPs until entries expire; it does not evict active entries to permit bypass. On Vercel the IP comes from the platform-overwritten `X-Forwarded-For`; local tests use the socket. Rejection is 429 with `Retry-After: 60`. This is **best-effort per-instance**, not a global distributed quota or botnet defense. Scaling/cold starts reset independent counters; no shared limiter, paid feature or daily global budget guard is configured. Login/session requests share the five-request limit and may need tuning after preview testing.

## Client session and secret boundaries

On first create/restore/unlock, crypto stays local; the wallet signs the validated SIWE message, then the client lazily imports `firebase/app` and `firebase/auth`, sets `browserLocalPersistence`, and calls `signInWithCustomToken`. The SDK manages credential persistence. Before entering the game, the newly issued Firebase ID token is also verified by the server. Only public address, challenge/signature proofs and Firebase tokens cross the network. No recovery words, private key, controller code or encrypted vault is sent.

Returning visits must load Auth to restore and verify its saved session **before a fresh unlock** so the approved code-free return can work. `firebase-session-address` is a public load hint, not authentication; copying it or the legacy receipt cannot open the game without a verified SDK/server session. Legacy receipt timestamps are ignored and deleted on the next vault/login write. A missing Firebase session/new browser or 48-hour expiry requires unlock and a new signature. SDK token refresh, visits and changing the controller code do not extend wallet-signature age. Reveal/change still require fresh local decryption. Hide/disposal abort pending login work and clear sensitive references. Request timeouts bound API waits; no private key is retained for 48 hours.

Secrets are read only here:

- `NONCE_SECRET`: `server/identity/challenge.ts:nonceSecret`, invoked by nonce issuance and the signature-login path. Require at least 32 UTF-8 bytes; use a randomly generated secret. The existing Vercel secret is never fetched, shown or changed by this task.
- `FIREBASE_SERVICE_ACCOUNT`: `server/identity/admin.ts:adminApp`, only when `/api/login` requires Admin. Parsed as raw JSON, validates project `lumen-bay`, and initializes a server-only credential. It is never prefixed `VITE_` or imported by client code.
- `.gitignore` excludes environment files and `*-firebase-adminsdk-*.json`, `serviceAccount*.json`, `service-account*.json`. `.env.example` has empty values only. Test fixtures are artificial, not production credentials.

## Vercel configuration

`vercel.json` adds `regions: ["sin1"]` and retains existing cache headers. Add these as **type Config**, enabled for **Production + Preview**, then redeploy to include Vite's build-time values:

| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | `AIzaSyAP7z4RA6_MLZumfOhmf82A7dV6RQfFmCU` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `lumen-bay.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `lumen-bay` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `lumen-bay.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `679337099223` |
| `VITE_FIREBASE_APP_ID` | `1:679337099223:web:2083e3a466a082b3411592` |

The supplied web config is public. `FIREBASE_SERVICE_ACCOUNT` and `NONCE_SECRET` are already set for Production + Preview; retain their server-only secret settings. No real secret is needed for tests. Package engines select Node 24 for Vercel and local checks; Admin 14 requires Node 22+.

## Full Firestore rules (not deployed)

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /players/{address} {
      allow read: if request.auth != null && request.auth.uid == address;
      allow write: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

`firebase.json` points to this file. Teera can deploy it from the reviewed branch with:

```sh
firebase login
firebase deploy --only firestore:rules --project lumen-bay
```

Check the Firebase console project name before publishing. The task never runs this command. Admin bypasses client rules to write replay markers. Owner reads require an existing player document; this step creates no player/item data. Subcollections, including player logs, remain denied until a later approved step.

## Validation and remaining checks

Reproduce with Node 24: `npm ci`, `npm test`, `npm run build`, `npm run lint`. For the official rules library, use Java 21 and Firebase CLI: `npm run test:rules`. The explicit `demo-lumen-bay` project and localhost guard prevent tests from using the real database. The emulator test covers owner/other/anonymous reads, all writes, other paths and actual create-only replay races.

The production browser suite uses the **real Firebase browser SDK** with intercepted Auth REST and API responses and generated identities; every Firebase interaction is mocked. Build with dummy public config matching project ID `lumen-bay` (example values are not credentials), start preview, then run `node scripts/test-identity-browser.mjs` with `PLAYWRIGHT_MODULE` / `CHROME_EXECUTABLE` if needed. It covers backup/controller security, SDK persistence, server-refused expiry, unchanged login time on code rotation, new-device unlock despite copied/legacy markers, recovery and no secrets in network/logs. It does not validate real service-account permissions or deployed Firebase/Vercel connectivity.

Dependency additions: `firebase`, server-only `firebase-admin`, and development-only `@firebase/rules-unit-testing`. Firebase's Node Firestore dependency pinned an old gRPC; an override to compatible `@grpc/grpc-js@1.14.5` removes the new advisories and is exercised by emulator tests. Existing package versions are unchanged. The pre-existing source-map-js development advisory remains outside this step. Lazy Auth chunk is about 22.9 KiB gzip; it is absent before first unlock. Physical iPhone timing remains unmeasured.

Preview testing still required: add the six Config values; open this branch preview; create/restore and sign in, reload within 48 hours without code, test another browser, verify identity entry still precedes game/multiplayer, and run the existing phone checks. Verify the service account can create nonce markers and sign custom tokens. Step (c) will need server token/age checks for protected saves; step (e) still owns WebSocket authentication. Client rules alone do not impose a 48-hour read expiry because the requested rule checks UID only.

References: [Firebase custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Auth persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [rules unit tests](https://firebase.google.com/docs/rules/unit-tests), [Vercel server variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Vercel trusted request headers](https://vercel.com/docs/headers/request-headers).

Vocabulary: **nonce** is a random value intended for one use; **replay** is reusing a previously valid request.

Completed checks (Node 24.15.0): `npm test` **80/80 passed**; `npm run test:rules` **2/2 passed** (including actual atomic create race); `npm run build` passed; `npm run lint` exited 0 with **30 existing warnings, zero errors**; mocked production browser suite passed. The emitted client JS contains neither Admin imports nor server-secret environment-variable names. Physical iPhone and real-project checks remain pending.

## Vercel runtime correction — 2026-10-08

The first preview exposed a gap in the source-only checks: Vercel emitted `api/*.js` but preserved relative `.ts` imports, leaving the runtime looking for TypeScript files. All API/server relative imports now use `.js`, including the shared `src/identity/loginMessage.js` import. An API-local tsconfig extends the Node config so the production builder resolves the Node types and checks the API with emission enabled. The Node config no longer permits `.ts` import extensions.

`npm run test:api` uses the pinned official `@vercel/node` builder with production compilation/file tracing, materializes each isolated Lambda's files, and imports emitted `api/nonce.js` and `api/login.js` in fresh Node processes without the source-test resolution hook. It fails on TypeScript diagnostics, import errors, wrong GET status/body, or missing Singapore metadata. `npm run build` runs this check automatically. Unit tests use a test-only `.js`→`.ts` hook, registered before dynamically importing server source. This hook is absent from deployed handlers and the compiled smoke test. No Vercel project pull or real credentials are used.

Region correction: both API exports explicitly request `regions: ['sin1']`, and `vercel.json` pins `api/*.ts` as well as the project default. The emitted Lambda metadata is asserted to be `sin1`. API responses include `X-Lumen-Function-Region` from the actual `VERCEL_REGION`, so verification does not confuse CDN ingress with function execution. The old dashboard/deployment configuration is not accessible through the repository, so its exact reason for applying iad1 cannot be confirmed here. If a project default still needs changing: Vercel → swimming-pool → Settings → Functions → Function Regions → Singapore (`sin1`) only → Save → redeploy. Confirm Root Directory contains this `vercel.json` and that the deployment is built from the updated login branch. [Vercel region configuration](https://vercel.com/docs/functions/configuring-functions/region).

Post-deployment live GET and region proof will be reported in the REVIEW PACKET.

Correction checks: all 80 unit tests passed; `npm run build` passed, including the official-builder import/405/region smoke test; the negative emitted `.ts` fixture reproduces `ERR_MODULE_NOT_FOUND` and is rejected by the smoke check. Lint passed with the existing warnings; the mocked production browser identity suite also passed. Pinned build-test tools are development-only (`@vercel/node@23.0.0`, `@vercel/build-utils@14.20.0`); their dependency audit has remaining advisories (11 high, 1 moderate, including the prior source-map-js advisory). They are not imported by deployed handlers or browser code; no unrelated runtime dependency version was changed.

## Admin dependency and actual runtime region correction — 2026-10-08

The previous preview's `/api/login` crashed while loading `firebase-admin@14.5.0` → `jwks-rsa@4.1.0` → ESM-only `jose@6.2.12`. The latest registry release of Admin is already 14.5.0. A normal Node 24 process allowed CommonJS `require(ESM)`, hiding the incompatibility in the earlier compiled smoke check. `node --no-experimental-require-module --input-type=module -e "await import('firebase-admin/auth')"` reproduced the reported `ERR_REQUIRE_ESM` before the fix. The scoped npm override `"jwks-rsa": { "jose": "5.10.0" }` now provides that package with a CommonJS export. The lockfile records the exact version; no dependency files were patched by hand. [Upstream issue](https://github.com/auth0/node-jwks-rsa/issues/493), [jose v5 exports](https://github.com/panva/jose/tree/v5.x).

`npm run test:api` still builds and imports **both** isolated compiled `api/nonce.js` and `api/login.js`, including the actual traced Firebase Admin import chain. It now launches each child with `--no-experimental-require-module` and asserts that feature is disabled. For login it additionally resolves a generated RSA JWK through Admin's actual `jwks-rsa` dependency and verifies a local signature with the resulting public key. The interceptor supplies generated keys without networking; no real credentials, Firebase project access or source loader is involved. Both GETs must return 405 and exactly `{"error":"Use POST to sign in."}`. Removing a working compatibility constraint will fail this stricter import check. The previous negative `.ts` fixture is retained.

The authenticated Vercel dashboard revealed **Settings → Functions → Function Region** was still saved as Washington (`iad1`). It has now been saved as **Singapore (`sin1`) only**, and reload confirmed the selection persisted. Repository region settings remain `sin1` at project, per-function and API-export levels. The previous Resources table proved configured placement but did not establish the region of a failing invocation; the exact platform reason for the old config/runtime discrepancy is still unconfirmed. This new deployment must be verified using actual runtime evidence, not CDN ingress or build region. [Dashboard setting](https://vercel.com/teeras-projects-d196c4b1/swimming-pool/settings/functions), [Vercel region configuration](https://vercel.com/docs/functions/configuring-functions/region).

For that evidence, Vercel-only 405 replies log the fixed diagnostic `identity-api status=405 region=<VERCEL_REGION>`. The value is restricted to the platform region-code format. No URL, address, headers, body, signature, token, exception or credentials are logged. Existing response-region headers remain. Post-push GET statuses, exact bodies, invocation regions and deployment identifiers will be recorded in the draft PR review packet. A real wallet login is still Teera's final connectivity/permissions test.

## Identity controller/restore correction — 2026-10-08

Identity D-pad input no longer uses `directionForPress()` or the socket's centre. Four transparent HTML arm targets align with the cross artwork and side wall. The handler tests the pointer against those four rectangles; hub/empty-socket taps are ignored, dragging adds no input, and secondary pointers are ignored. This also handles mobile selection of a neighbouring target and WebKit's observed integer CSS-pixel touch coordinates. Game movement retains its existing eight-way drag handling. The four face buttons omit `hover:text-white active:scale-95` during identity mode, and retain the CSS suppression of colour/shadow/transform feedback. Haptics/audio remain suppressed.

At Teera's request, **only a Vercel Preview build AND exact `?debugcombo=1`** displays the currently recorded symbols below the dots. Vite defines a compile-time boolean from the server build's `VERCEL_ENV === 'preview'`, not a URL hostname or `VITE_*` override. Default Preview, local builds without that environment, and Production builds do not show the trace. It uses the same in-memory input array as encryption/decryption, clears on delete/confirm/cancel/lifecycle clearing, and never logs, persists or transmits the symbols. This explicit Preview opt-in is the only exception to the dots-only security UI. Do not share screenshots of your real code; remove the parameter after testing.

`npm run test:controls` runs `scripts/test-identity-controls.mjs` against a built local preview with Playwright. It uses viewport **390×844, DPR 3, touch/mobile mode**; `IDENTITY_BROWSER=webkit` selects the WebKit engine, otherwise Chromium. `PLAYWRIGHT_MODULE` and `CHROME_EXECUTABLE` have the same meaning as the existing browser suite. Build with `VERCEL_ENV=preview npm run build`, start `npm run preview`, and set `IDENTITY_URL=http://127.0.0.1:4173/?debugcombo=1`. All Firebase/API calls are intercepted, with public test words and generated/mock credentials.

Checks include 35 touch points: each D-pad arm's centre/tip/near-hub plus inner corners and side-wall edges; each face button's centre/outer edge/near-hub edge; exact recorded input, inert hub, one-input drag, and unchanged held-button appearance. Mixed and face-only codes are set after recovery, then successfully decrypt after re-entry at different points. HTTP failures at each endpoint and an aborted connection must show an alert and preserve the vault for retry. A successful retry must issue **POST `/api/nonce` then POST `/api/login`**, before Firebase session verification. A wrong local code must show the decryption error and issue neither route. The existing gate already surfaced operation errors; fetch failures and the existing 20-second timeout now have clearer connection/retry messages.

For Production exclusion, build with `VERCEL_ENV=production npm run build` and run the same script with `IDENTITY_DEBUG_EXPECTED=production` and `?debugcombo=1`. It asserts no trace exists while entering a code. Missing query or `debugcombo=0` must also remain dots-only in both modes. Automated results are recorded in the PR review packet; browser emulation is not a physical iPhone test.

Phone retest: use the branch preview with `?debugcombo=1`; restore the same written 12 words, choose and confirm a new seven-press code, and compare the symbols at arm centre/tip/near-hub. Enter it again using different points, then check login and code-free reload. Try face buttons only as a comparison. A vault saved with previously misrecorded inputs cannot have its code inferred or repaired automatically: recover from the written words to set it again. `vault.ts`, `storage.ts`, `policy.ts`, all cryptographic settings, API verification/rate limits/rules and `wsServer.js` are unchanged by this correction.

Controller correction evidence: `npm test` **80/80 passed**; Preview and Production `npm run build` both passed, including `test:api`; lint exited 0 with the same **30 warnings, zero errors**. The 35-point Preview control suite passed in both Chromium and WebKit at 390×844/DPR 3. Both engines also passed mixed/face-only decryption, ordered POSTs, visible endpoint/connection errors and retry, no haptics/audio, query opt-in, and Production trace exclusion with `debugcombo=1`. The full existing production-browser wallet/session/menu suite passed. Production emitted JS contains no `Preview input trace` text. Tests use mocks only; physical iPhone Safari behavior and real-wallet Firebase login remain Teera's retest.
