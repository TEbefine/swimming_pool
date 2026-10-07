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
- Login: the server sends a one-time nonce, the wallet signs it, a Cloud Function verifies the signature and returns a Firebase custom token (Sign-In with Ethereum style).
- Items: Firestore keyed by Player ID. **Players can only read their own items. Only server code (Cloud Functions) can write items**, so the client can't cheat. Every item change is written to an append-only log.
- Tell me which Firebase plan this needs. Cloud Functions require the Blaze pay-as-you-go plan, which includes a free quota. Explain the real cost for 100–200 players.

**How to work with me**
1. First, propose the plan: the data model (collections, documents, fields), the login flow diagram, the security rules, and which libraries (keep them small, e.g. ethers or viem). Wait for my OK.
2. Then build it in small steps I can test on my iPhone after each: (a) create the wallet + PIN on the device, (b) Firebase login via signature, (c) item storage with Cloud Functions + security rules, (d) restore on a new device with the 12 words.
3. After each step, update `AI_CONTEXT.md` (block ID-01 + one Log line).

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.
