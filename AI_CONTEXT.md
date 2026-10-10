# AI_CONTEXT — swimming_pool (Lumen Bay) · READ THIS FIRST

Any AI working on this repo: read this whole file before doing anything. Every topic has an **ID**. Each ID stores its items: status, decisions, files and what's next. When you finish work, update the blocks you touched and add one line to the **Log** at the bottom. Never delete a rejected idea: move it to "Rejected" with the reason, so nobody repeats it.

Last updated: 2026-10-10 (ID-01c saves built on id-01c-saves, in review)

---

## ME-01 · Who I am (Teera) and how to work with me
- Teera Thongbai (call me Teera-san). Frontend developer in Bangkok, from Sukhothai. Personal brand: **SAP by Teera**. Everything I build connects back to it.
- **Language:** English first (I'm improving my vocabulary: teach 1–2 good words in context with a short definition). Thai only when I ask, or when the topic is complex.
- **Work style:** step by step. Show me the design (images or a live page), don't just describe it. I decide by seeing and reacting.
- Give honest analysis, not validation. Tell me when an idea won't work and why, then offer a better path. Advise, don't override my ideas.
- No filler, no repeating the same answer in a new wrapper. Every answer must be worth reading.
- I test on an **iPhone 13**. The game must stay fast on low-end phones.
- Live site: https://swimming-pool-five.vercel.app · I sync two computers through GitHub `main` (push at one, pull at the other).

## P-01 · The project
- **swimming_pool / Lumen Bay**: a pixel-art walk-and-talk community web app. Scenes: pool, café, My Room, club, plus a spirit temple. NPCs share daily knowledge. Mobile-first inside a Game Boy-style shell; desktop matters too. Target: 100–200 players together.
- **Backend:** Google **Firebase** (I don't want Supabase). Avoid monthly fees where possible.
- **Art workflow:** Midjourney → ChatGPT realism/edit → code for effects. Sprite sheets are made in ChatGPT; the AI writes prompts and code.
- **Music:** Suno, cozy Animal Crossing / Harvest Moon feel.
- **Story (spirit NPC):** first story "Dalbit": the heir Kang Yunseul (real name Wol Hwi), a fictional world only *inspired* by Korea. Systems: fishing (wait → strike → reel), Pokémon-style battles, items/bag, gifts and relationships.
- Detailed design docs live in `docs/` (cards, characters, world, ui, audio, tech). Read the doc for an ID before changing it.

## ID-01 · Player identity (12-word wallet): STEP (c) SAVES BUILT ON `id-01c-saves`, IN REVIEW (b still unmerged)
- Approved plan: `docs/ai/ID-01-plan.md` supersedes the original prompt's PIN, server-stored nonce, session and save-model details. Original brief: `docs/ai/PROMPT_player_id.md`.
- Branch: **id-01a-wallet**, based on main. Local wallet + mandatory written backup and three-word check; exactly **7 controller presses from 8 inputs** instead of a six-digit PIN. Dot-only entry, no press feedback; desktop arrows + T/O/X/Q.
- Device vault encrypts BOTH the 12 words and private key using PBKDF2-HMAC-SHA-256 (600,000 iterations; random 16-byte salt) + AES-256-GCM (fresh 12-byte IV, 128-bit tag). Secrets never intentionally enter networking, logs or plaintext persistent storage. Short combos remain vulnerable to offline guessing.
- Missing vault is restore-first, never silently creates a replacement. Teera approved local 12-word recovery in (a); server-data recovery remains (d). Request persistent storage and suggest Add to Home Screen; written backup remains required.
- Fresh code is required for revealing words or changing the code. (b), branch `id-01b-login` from `integrate/id-01a`, replaces the local preview receipt with Firebase browserLocalPersistence and server-verified 48-hour wallet-signature age. Token refresh, visits and code changes do not extend it. Auth loads after the first unlock, and on returning visits to verify a saved session; public device markers grant no access.
- (b) implemented: stateless HMAC challenge at `/api/nonce` (zero Firestore writes); `/api/login` verifies first, then create-only used-nonce marker, then Firebase custom token. Both routes have bounded per-instance IP limits (nonce 10/minute, login/session 5/minute); these are not a global quota. Signature login creates one replay marker; cleanup is manual to preserve one-write scope. Amoy 80002; no money or trading yet.
- Protected-preview fix: same-origin API requests include the browser's Vercel authentication cookie via `credentials: 'same-origin'`. Non-API 401/403 responses explain that Vercel login is required, before the expired-session fallback; real API errors retain existing handling. Cookie-gated transport regression tests cover both routes and session checks.
- (c) plan: Dalbit end-of-day validated save + local draft; Lumen Bay only community knowledge/fortune memory. Lumen Bay fish are released after NPC finish and recorded as Fish Book knowledge, never inventory fish. Cards save immediately. Catalogue/quantity/action-rate validation; append-only API logs and owner-read/no-client-write rules. Old local saves may reset. Reward validation does not block (a)/(b).
- Firebase Spark + Vercel API routes, no Cloud Functions. Service account/HMAC secret remain server-only. `server/wsServer.js` unchanged; token checks later in (e).
- Main files: `src/identity/*`, controller identity mode in `GameBoyMobile.tsx`, app entry/START row 3 integration, Home Screen manifest. Verification and phone checklist: `docs/ai/ID-01-review.md`.
- Wallet review and initial iPhone 13 flow approved by Teera; exact physical unlock timing remains unmeasured. Integration branch: `integrate/id-01a`. START row 3 is the only profile/Player ID entry; one overlay pause API prioritizes identity, then menus/bag/SceneBox, then player input.
- Identity D-pad uses four fixed arm hit areas and checks the original pointer against their rectangles, avoiding socket-centre angles and mobile target rounding. Face press effects are absent in identity mode. Teera's opt-in `?debugcombo=1` trace is compiled only for Vercel Preview; normal entry and production remain dots-only. Existing vaults are not rewritten; restore the written words to reset a previously misrecorded code.
- Review: `docs/ai/ID-01b-review.md` documents routes, server-only secrets, empty env example, Config variables and undeployed owner-read/no-client-write Firestore rules. Functions explicitly request `sin1`; Vercel's saved project default was corrected from `iad1` to `sin1`, with live execution proof required for each new preview. Firebase project `lumen-bay` uses Spark and Bangkok Firestore. No item saves or WebSocket trust changes.
- (c) built 2026-10-10 (Claude) on branch **`id-01c-saves`** = `id-01b-login` + today's `main` merged (menu state machine, fonts, Quiet Bay, Nami/Kai). Review packet + deploy steps: `docs/ai/ID-01c-review.md`.
  - `POST /api/items` (`api/items.ts` → `server/saves/`): Firebase ID token (`Authorization: Bearer`, uid = address, 48-hour wallet window, origin-bound) → ops `load`, `fishbook.record`, `story.saveDay`. One Firestore transaction per op: `players/{address}` snapshot + create-only `players/{address}/log/{operationId}`; a retry with the same operationId replays, a different body under the same id is 409.
  - Validation (`server/saves/rules.ts`, shared pure catalogues `src/game/fishing/freeFishCatalog.ts`, `src/game/story/items.ts`, `src/game/story/storyKeys.ts`): catches = ready-sheet kind, size in range, ≤ 7 days old, not in the future, day/night + season (with slack), ≥ 3 s apart and after the newest recorded catch, ≤ 2,000/day; valid catches in a batch are kept and bad ones reported by index. Story = day-end only (`d<N>_end`), N ≤ `STORY.lastDay` (1), never the same day twice, baseRevision must match, coins/bag per-item and total gains bounded per day covered (a missed day-end is caught up), ledger append-only, flags/counters only from the shared allowlist (`setFlag`/`addCounter` are typed with it).
  - Quotas: stateless checks run before any read; per-ID 30 ops/min + 200 accepted ops/day stored in the document; in-memory per-ID 20 requests/min + 600/day and per-IP 60/min (per instance). No global budget: many throwaway IDs can still exhaust Spark (documented).
  - Game: Quiet Bay catches wait on the device (`free_fishing_pending_v1_<address>`) until **Nami (day) / Kai (night)** record them ("Record my catches (N)"). Dalbit plays on an address-scoped draft and saves itself at the end of each day (HUD: "Day N is saved to your Player ID."); the server copy wins when the draft continues an older save. Any device that unlocks the same Player ID loads the same Fish Book and story. Guests and `?test=` pages keep browser-only saves; old guest saves are not uploaded (the guest story is only a starting point, checked at day end).
  - Rules: owner may read `players/{address}` and its `log`; no client writes anywhere (deploy with `firebase deploy --only firestore:rules`).
  - Limits, honestly: the CLIENT still rolls which fish bites, so a modified client can claim a rare fish that passes every rule; the fix is server-rolled "cast tickets" (proposed next). Firestore emulator tests could not run in the build container (download blocked) — run `npm run test:rules`.
- Next: Teera tests the `id-01c-saves` preview on iPhone (deploy rules first), then merge order (b) → (c). After that: server-rolled cast tickets (anti-cheat for catches), cards save immediately (C-01), (d) polish for new-device restore, (e) WebSocket token check. One step = one branch = one AI builds, another reviews, Teera tests the preview, then merges.
- Rejected/superseded: numeric PIN → controller combo; Firestore nonce issuance → stateless challenge; memory-only Firebase auth → persistent auth + step-up; discarded phrase → encrypted phrase for gated reveal; silent identity regeneration → restore-first.

## C-01 · Card system "Memory Disk"
- Cards are items in the bag (`kind: 'card'`). Tap the icon to view the full card. Trade it away and you can't view it anymore.
- 3:4 floppy-disk-inspired frame: shutter at the top (slide it to read the story), art window, info on the bottom rim.
- Tiers: **Common = "Before"** (an NPC's humble beginning, no effect) · **Rare = "Dream"** (rainbow holo shimmer) · **Legend = "Creator"** (1 of 1, gold foil on the planets).
- Types (color): Wealth #C99234 · Wisdom #3F5E8C · Heart #B5544B · Courage #C0692E · Craft #6F7A3A · Spirit #857C99.
- Full spec: `docs/cards/card-tiers.md` and `docs/cards/card-front-spec.md`.

## C-LEG-01 · Legend card "The Creator": DONE (2026-10-06)
Files: `docs/cards/legend/` (live page `creator-orbit.html`, source template, art, planets, masks, tools).
- **Frame:** "Gundam two-tone", rendered live in WebGL. Top 3/4 is black glass (fine gold hairlines only); bottom 1/4 is a satin gold plate, joined by a small 45° step seam. Black shutter with a gold edge; gold film window. Studio light drifts and moves when the card tilts.
- **Inscription:** one sentence only, laser-etched dark into the gold: **EVERY DREAMER NEEDS A WAY IN** (Chakra Petch SemiBold, caps, wide tracking), centered with equal space above and below.
- **Creator:** a faceless white linen cloak floating in space, one bare human arm in a Creation-of-Adam gesture. **Tiny: about 5% of the card height.** The planets are the power; the Creator is only the bridge. Inside the cloak is a living universe: the nebula art plus about 240 realistic twinkling lights, breathing violet light, light rising out.
- **Six planets = feelings:** Wonder, Missing someone, Understanding (Yunseul), Courage, Healing, Dream. Each has gold foil that sweeps as it moves.
- **Motion = 13-layer carousel:** 6 layers in front, the Creator in layer 7, 6 behind. Straight left → right in front, right → left behind, on a narrow track that stays inside the window. Planets never change size. Two masses of worlds (above and below) with a corridor for the Creator.
- **Quiet sky:** very slow. Loops per year: Wonder 12, Missing someone 6, Understanding 4, Courage 3, Healing 2, Dream 1. You notice movement day to day, never while watching.
- **Birthday Alignment:** every year at **sunrise on 21 February (Bangkok, ≈06:38)** all six planets reach one designed composition (Wonder touching the Creator's fingertip). The positions are computed from the real clock, so everyone sees the same sky.
- Rejected (don't redo): gray Apple finishes ("not special"), handwritten label, riveted plate, Game Boy twin lines ("old man — think 2026"), Energy-seam / Armor-detail styles, single crystal core, visible crystal shapes, 3D orbits with size change, fast planets.
- Next: check on iPhone; wire the card into the bag (`kind: 'card'`); design the card back (DOS style).

## C-COM-01 · Common card #1 "Sir Ledger": "The First Crate" (art done 2026-10-03, Wealth)
## C-RARE-01 · Rare card "Dream High": prototype done (Spirit type)

## N-01 · NPCs and characters
- One shared slim body standard (the lifeguard style). Docs: `docs/characters/*` (body standard, art style guide, barista, DJ, lifeguard, server, spirit, family, market people, AI-town NPCs).
- 4 AI-personified NPCs talk about AI news (Gemini = tycoon, ChatGPT = cool girl, Claude = Emma Watson-like, plus one for other AIs).

## U-01 · UI and fonts
- Default font: **Pool Pixel Default 0.4**, self-hosted Thai + English, with custom E/e/T/K/ข and compact พ/ฟ/ฬ bodies matched to ผ/ฝ. All 44 Thai consonants plus ฤ/ฦ and marks are covered.
- Applied to UI, inputs, menus, dialogue and canvas labels; name-tag height accommodates Thai marks. Font URL `?v=0.4` refreshes existing caches. Both OFL notices are included. Details: `docs/ui/default-font.md`.
- **TEERA Handwriting TH** remains available for artwork.
- Rejected: raster-derived Pool Soft Pixel v0.1 (unstable strokes); the wider v0.3 พ body is superseded by the ผ/ฝ-style body. Earlier VT323/Plex and Sabai defaults are replaced by the requested bilingual pixel face.
- Validation: production build and phone/desktop browser checks pass; physical iPhone review pending.

## U-02 · START menu (Pokémon FireRed/LeafGreen style)
- **Status:** Step 2 finished (2026-10-10, from the ChatGPT brief): one controller-driven menu system inside the game screen. Field menu (Fish book, Bag, <player name>, Emotes, Options, Help, Resume), EMOTES list, OPTIONS screen (Sound, Music, Vibration, Quality: real stores), description box, hint bar, one Back stack, cursor memory.
- **Decisions:**
  - Design: navy `#1b313d`, cream `#eee6c8`, gold `#e7bd66`, blue-gray borders, square double-border frames with a small offset shadow, triangle cursor, selected row = navy + cream text. Tokens are `--gm-*` in `menu.css`; the typeface is `--gm-font` (follows the app font; one line switches it to Sabai Pixel).
  - Field panel compact in the upper-right, world visible behind; divider before Options; description box near the bottom; hints on the bottom edge (glyphs on handheld, key names on desktop).
  - Logic lives in ONE pure state machine `menuModel.ts` (`reduce`, `MenuStore`); UI only draws it. One keyboard entry point (`useGameMenu().handleKey` called first in the App key handler) and one D-pad adapter (`DpadAdapter`: one step per press, repeat after ~380 ms).
  - Back is exactly one level: item actions → Bag → Field menu → Gameplay. START closes everything from any depth. A menu opened directly (B key / HUD bag button) closes to gameplay on Back.
  - The field cursor, each pocket and each pocket's selected item are remembered (state lives in the store, not in a mounted component).
  - While the menu is open the player stops walking, the world keeps ticking. On desktop the HeaderBar, ActionBar and ChatBar are hidden (the ChatBar "Enter focuses chat" shortcut used to steal the confirm key).
  - Menu does not open over a dialog, story panel or loading scene; opening a dialog or SELECT box closes it.
  - Keys: arrows/WASD move, Enter/Z/E/O confirm, X/Escape back, M/P/` START, B Bag. Shell ◯ = confirm, ✕ = back, START toggles.
- **Rejected:** the old cream `#FFF8EC` panel with uppercase labels, and the old START/BAG wiring (separate state plus nudge/trigger counters in `App.tsx`, `useMenuStack.ts`): the cursor was lost on re-mount and a D-pad drag stepped several rows. `useMenuStack.ts` was deleted; the store above replaces it.
- **Files:** `src/components/gameMenu/` (`menuModel.ts`, `menuInput.ts`, `useGameMenu.ts`, `GameMenu.tsx`, `HintBar.tsx`, `DescriptionBox.tsx`), `src/components/startMenu/` (`StartMenu.tsx`, `MenuList.tsx`, `EmoteScreen.tsx`, `OptionsScreen.tsx`, `optionRows.ts`, `menu.css`), `src/App.tsx`, `tests/game-menu.test.mjs`.
- **Integration (ID-01):** START row 3 (the player name) opens the profile/Player ID flow (Name modal → "Player ID & recovery backup"); controller feedback is suppressed during identity code entry. Identity pause (`engine.setPause('identity')`) outranks the menu pause; the world keeps ticking.
- **Next:** Fish book / Name / Help still close the menu to gameplay when they open (they are separate overlays); returning to the field menu when they close is the open item.

## U-03 · Bag (Pokémon Black/White & ORAS style)
- **Status:** Step 2 finished (2026-10-10): Bag screen redrawn (BAG title + player name, pocket tabs with ◂ ▸, pixel backpack + pocket name + coins, framed item list with right-aligned quantities, fixed description box) and item actions **Eat / Check / Cancel** that change the real save.
- **Decisions:**
  - One source of truth for pockets: `pocketOf(id)` and `POCKETS` (`items`, `fish`, `cards`, `key`) in `src/game/story/items.ts`. The Gear / Bait / Tools idea was NOT used: the game has no equipment, bait or tools yet, so there is no equipped marker either.
  - Every inventory action goes through `src/game/story/bagActions.ts` (`itemActionsFor`, `runItemAction`, `itemFacts`), prepared for ID-01 server authority. Eat refuses when energy is already full (item is kept). Check shows rarity, habitat, best catch, energy, prices from the real save.
  - The action popup owns input; ←/→ and the list ignore keys until it closes. After an action the cursor stays on the same pocket and item (clamped if the stack ran out); feedback shows in the description box for ~3 s or until the next input.
  - Full screen on handheld, centered 600 px frame on desktop. "CLOSE BAG" row removed: Back / START close it.
- **Files:** `src/game/story/items.ts`, `src/game/story/bagActions.ts`, `src/components/bag/` (`BagScreen.tsx`, `PocketBar.tsx`, `ItemList.tsx`, `ItemActionMenu.tsx`, `PixelBackpack.tsx`, `bag.css`), `src/components/StoryHud.tsx`, `src/dev/storyTest.tsx`, `src/App.tsx`.
- **Next:** Cards pocket needs a viewer action (Check shows only item facts today). Add Equip / Set bait to `itemActionsFor` + a marker in `ItemList` when equipment exists.

## W-01 · World
- Lumen Bay plan, Dalbit market art. Docs: `docs/world/*`.

---

## Rules for any AI
1. Read this file first, then the doc for the ID you'll touch.
2. Show designs visually and work step by step. Ask one short question only when a wrong guess would be expensive.
3. Keep it fast on iPhone 13 (no heavy libraries, lazy-load images, prefer CSS/WebGL with fallbacks).
4. After each session, update this file: the touched ID blocks plus one Log line.

## Log
- 2026-10-06 · Claude · C-LEG-01 finished (frame, inscription, living universe, carousel, gold foil, Birthday Alignment, quiet sky).
- 2026-10-07 · Claude · Handoff file created. Next: ID-01 player identity.
- 2026-10-07 · Antigravity · Moved handoff to repo root + docs/; ID-01 plan set to Spark + Vercel API routes (no Cloud Functions).
- 2026-10-07 · Antigravity · U-02 Step 1 finished (START menu shell, cursor memory, description box, input router, overlay exclusivity, EMOTE screen). Branch: `feat/start-menu`.
- 2026-10-08 · Codex · ID-01a: saved amended plan and implemented local encrypted wallet, controller combo, required backup, restore and step-up screens on id-01a-wallet; backend stages deferred; reviewer/iPhone verification pending.
- 2026-10-08 · Antigravity · U-03 Step 1 finished (Bag screen shell, pocket bar, item list, description box, input router, cursor memory per pocket, ?test=story fill tool). Branch: `feat/bag`.
- 2026-10-08 · Codex · Merged id-01a-wallet into integrate/id-01a from main; unified overlay pause/input routing, retained START/bag controls, removed duplicate profile entry points and documented pending physical unlock timing.
- 2026-10-08 · Codex · ID-01b: built SIWE/HMAC Firebase login, atomic replay markers, bounded IP limits, persistent 48-hour sessions and undeployed owner-only rules on id-01b-login from integrate/id-01a; tested with mocks/demo emulator, real preview verification pending.
- 2026-10-08 · Codex · ID-01b runtime fix: changed server ESM imports to .js, added Vercel API compiler/build-import smoke check and explicit sin1 function regions; post-deployment GET/region proof reported in the review packet.
- 2026-10-08 · Codex · ID-01b Admin runtime fix: scoped jwks-rsa to CommonJS-compatible jose 5.10.0, tested both Vercel-built routes with require(ESM) disabled and generated RSA keys, and saved Singapore as the Vercel project default; new-preview GET/runtime-region evidence belongs in the PR review packet.
- 2026-10-08 · Codex · ID-01b controller fix: replaced centre-angle identity input with explicit arm hit areas, removed face press effects, added Preview-only combo tracing and phone-size touch/restore/login/error checks; protected vault/crypto files unchanged and physical iPhone retest pending.
- 2026-10-08 · Codex · ID-01b protected-preview fix: use same-origin credentials and distinguish Vercel protection from API/session errors; added a cookie-gated mock regression. Real iPhone/Mac login retest remains required after deployment.
- 2026-10-10 · Claude · U-02 Step 2 + U-03 Step 2 finished (ChatGPT menu brief: single menu state machine, field menu, Options screen, Bag redraw, Eat/Check actions on the real save, desktop HUD hidden while open; 81 unit tests + browser flows on handheld/desktop/production build pass).
- 2026-10-10 · Codex · U-01: applied Pool Pixel Default 0.4 to current main; refined พ/ฟ/ฬ to match ผ/ฝ bodies, preserved E/e/T/K/ข and full Thai coverage, updated font cache URLs, and checked production build plus phone/desktop rendering.
- 2026-10-10 · Claude · ID-01c: merged main into the login branch as `id-01c-saves`; built `/api/items` validated saves (Fish Book via Nami/Kai, Dalbit day-end save, load on any device), owner-read log rules, review fixes from an independent reviewer (2 rounds); 117 unit tests, API build smoke, identity + controls + new saves browser suites pass; emulator rules test not runnable here.
