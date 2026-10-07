# Prompt for ChatGPT: build ID-01 Player Identity (12-word wallet)

Paste everything below the line into ChatGPT (with the repo connected).

---

Read `AI_CONTEXT.md` in the repo first (especially ME-01, P-01 and ID-01). Then help me build **ID-01: Player identity** for my game swimming_pool (Lumen Bay), step by step. Don't write all the code at once.

**What I want**
- When someone opens the game for the first time, it automatically creates their identity: a wallet with a **12-word recovery phrase** and a **6-digit PIN** they choose to confirm. The wallet address is their **Player ID**.
- Every Player ID owns its items (bag items, cards, fish, gifts, progress). Items must be stored correctly, be fair and hard to cheat, and feel truly the player's own.
- When the player comes back (same device: PIN; new device: 12 words), the game knows who they are and loads everything they own.
- For now: wallet ID + login only, on **Polygon testnet (Amoy)**. No real money, no trading yet.
- Backend: **Firebase** (no Supabase). Avoid monthly fees where possible.
- Must stay fast on an iPhone 13 and on low-end phones.

**Security rules you must follow**
- Never send or store the 12 words or the private key on the server. Only the public address leaves the device.
- On the device, encrypt the key with the PIN using a slow key-derivation function (PBKDF2 with a high iteration count, or Argon2 or scrypt). A 6-digit PIN alone is weak, so explain the risk to me honestly.
- Show the 12 words once, with a clear "write these down" step and a check (ask for 2–3 words back).
- Login: the Vercel API route `/api/nonce` gives a one-time nonce. The wallet signs it. The Vercel API route `/api/login` checks the signature, then calls `firebase-admin` `createCustomToken(address)` and returns the token (Sign-In with Ethereum style). The browser calls `signInWithCustomToken`, so the Firebase uid IS the wallet address. Nonces are stored server-side only, expire after 5 minutes, and can be used once.
- Items: Firestore document `players/{address}`. Security rules: a player can read only their own document (`request.auth.uid == address`), and clients can NEVER write items (`allow write: if false`). Only Vercel API routes using firebase-admin (for example `/api/items`) change items, so the client can't cheat. Every item change is also added to an append-only log at `players/{address}/log/{id}`.
- Cost: stay on the free Spark plan, no Cloud Functions (they need the paid Blaze plan). Server code runs on Vercel. Be honest with me: Vercel's free Hobby plan is for non-commercial use only. That's fine for testing, but when real sales start we must move to Vercel Pro or another host. Check usage for 100–200 players against Spark's daily limits (50K reads / 20K writes): never write movement or every fish catch to Firestore; save in batches.
- Secrets: the Firebase service-account key lives only in Vercel environment variables and a local `.env.local` (already git-ignored). Never commit it and never put it in client code.

**How to work with me**
1. First, propose the plan: the data model (collections, documents, fields), the login flow diagram, the security rules, and which libraries (keep them small, e.g. ethers or viem). Wait for my OK.
2. Then build it in small steps I can test on my iPhone after each: (a) create the wallet + PIN on the device, (b) Firebase login via signature, (c) item storage with Vercel API routes + Firestore security rules, (d) restore on a new device with the 12 words.
   (e) later: `server/wsServer.js` must verify the player's Firebase ID token on connect, because today it trusts whatever player ID the browser sends.
3. After each step, update `AI_CONTEXT.md` (block ID-01 + one Log line).

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.
