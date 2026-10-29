# AI_CONTEXT — swimming_pool (Lumen Bay) · READ THIS FIRST

Any AI working on this repo: read this whole file before doing anything. Every topic has an **ID**. Each ID stores its items: status, decisions, files and what's next. When you finish work, update the blocks you touched and add one line to the **Log** at the bottom. Never delete a rejected idea: move it to "Rejected" with the reason, so nobody repeats it.

Last updated: 2026-10-11 (cleanup and production asset audit)

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

## ID-01 · Player identity (12-word wallet): STEPS (a)–(c) LIVE ON MAIN (2026-10-11)
- Approved plan: `docs/ai/ID-01-plan.md` supersedes the original prompt's PIN, server-stored nonce, session and save-model details. Original brief: `docs/ai/PROMPT_player_id.md`.
- Branch: **id-01a-wallet**, based on main. Local wallet + mandatory written backup and three-word check; exactly **7 controller presses from 8 inputs** instead of a six-digit PIN. Dot-only entry, no press feedback; desktop arrows + T/O/X/Q.
- Device vault encrypts BOTH the 12 words and private key using PBKDF2-HMAC-SHA-256 (600,000 iterations; random 16-byte salt) + AES-256-GCM (fresh 12-byte IV, 128-bit tag). Secrets never intentionally enter networking, logs or plaintext persistent storage. Short combos remain vulnerable to offline guessing.
- Missing vault is restore-first, never silently creates a replacement. Teera approved local 12-word recovery in (a); server-data recovery remains (d). Request persistent storage and suggest Add to Home Screen; written backup remains required.
- Fresh code is required for revealing words or changing the code. (b), branch `id-01b-login` from `integrate/id-01a`, replaces the local preview receipt with Firebase browserLocalPersistence and server-verified 48-hour wallet-signature age. Token refresh, visits and code changes do not extend it. Auth loads after the first unlock, and on returning visits to verify a saved session; public device markers grant no access.
- (b) implemented: stateless HMAC challenge at `/api/nonce` (zero Firestore writes); `/api/login` verifies first, then create-only used-nonce marker, then Firebase custom token. Both routes have bounded per-instance IP limits (nonce 10/minute, login/session 5/minute); these are not a global quota. Signature login creates one replay marker; cleanup is manual to preserve one-write scope. Amoy 80002; no money or trading yet.
- Protected-preview fix: same-origin API requests include the browser's Vercel authentication cookie via `credentials: 'same-origin'`. Non-API 401/403 responses explain that Vercel login is required, before the expired-session fallback; real API errors retain existing handling. Cookie-gated transport regression tests cover both routes and session checks.
- (c) plan: Dalbit end-of-day validated save + local draft; Lumen Bay only community knowledge/fortune memory. Lumen Bay fish are released after NPC finish and recorded as Fish Book knowledge, never inventory fish. Cards save immediately. Catalogue/quantity/action-rate validation; append-only API logs and owner-read/no-client-write rules. Old local saves may reset. Reward validation does not block (a)/(b).
- **`npm run dev` = TEST Player ID** (branch `dev-test-id`, 2026-10-11): no wallet/12 words (Web Crypto is missing when a phone opens the dev server over http), fixed address `0x…de57` (`src/identity/devTestIdentity.ts`), badge "TEST ID · dev saves". `/api/items` is served by the dev server itself (`server/dev/devSaves.ts`, Vite plugin, serve only) with the REAL handler + rules, stored in git-ignored `.dev/saves.json` (delete it to reset). Never touches real Firestore; absent from production builds (checked). `?realid=1` shows the real identity flow on localhost.
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
- 2026-10-11: Teera tested the `id-01c-saves` preview on iPhone (rules deployed; catch → Nami → Fish Book, Dalbit Day 1 save, works) and approved; `main` fast-forwarded to it, which also carries (b) — PR #5 can be closed. Next: server-rolled cast tickets (anti-cheat for catches), cards save immediately (C-01), (d) polish for new-device restore, (e) WebSocket token check. One step = one branch = one AI builds, another reviews, Teera tests the preview, then merges.
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
- **Status:** Step 2 finished (2026-10-10), Link Row & Empty State polish added (2026-10-11): Bag screen redrawn (BAG title + player name, pocket tabs with ◂ ▸, pixel backpack + pocket name + coins, framed item list with right-aligned quantities, fixed description box) and item actions **Eat / Check / Cancel** that change the real save.
- **Decisions:**
  - One source of truth for pockets: `pocketOf(id)` and `POCKETS` (`items`, `fish`, `cards`, `key`) in `src/game/story/items.ts`. The Gear / Bait / Tools idea was NOT used: the game has no equipment, bait or tools yet, so there is no equipped marker either.
  - Every inventory action goes through `src/game/story/bagActions.ts` (`itemActionsFor`, `runItemAction`, `itemFacts`), prepared for ID-01 server authority. Eat refuses when energy is already full (item is kept). Check shows rarity, habitat, best catch, energy, prices from the real save.
  - The action popup owns input; ←/→ and the list ignore keys until it closes. After an action the cursor stays on the same pocket and item (clamped if the stack ran out); feedback shows in the description box for ~3 s or until the next input.
  - Generic pocket link rows (`PocketLink`, `PocketRow` in `menuModel.ts`): FISH pocket displays `FISH BOOK <N> kinds` (and `<N> waiting for Nami/Kai` badge when pending catches exist). Confirm on the row emits `{ type: 'fishbook' }` and opens the Fish Book. Cursor memory and wrap-around stay intact.
  - Doubled empty message eliminated: list area shows short centered pocket prompt (FISH "No fish yet. Cast a line at the Lake Pier.", ITEMS "Nothing here yet.", CARDS "No cards yet.", KEY "No key items yet."). Description box shows Mother's line in story rooms (`isStoryRoom`) and neutral hint outside story rooms. Empty FISH pocket always renders the FISH BOOK link row.
  - Full screen on handheld, centered 600 px frame on desktop. "CLOSE BAG" row removed: Back / START close it.
- **Files:** `src/game/story/items.ts`, `src/game/story/bagActions.ts`, `src/components/bag/` (`BagScreen.tsx`, `PocketBar.tsx`, `ItemList.tsx`, `ItemActionMenu.tsx`, `PixelBackpack.tsx`, `bag.css`), `src/components/gameMenu/` (`menuModel.ts`, `useGameMenu.ts`, `GameMenu.tsx`), `docs/ui/game-menu.md`, `docs/ai/ID-02-world-bag-plan.md`, `src/App.tsx`, `tests/game-menu.test.mjs`.
- **Next:** Cards pocket needs a viewer action (Check shows only item facts today). Add Equip / Set bait to `itemActionsFor` + a marker in `ItemList` when equipment exists. Future ID-02 World Bag (see plan in `docs/ai/ID-02-world-bag-plan.md`).

## U-04 · Boot intro "SWIMMING POOL / by SAP Co." & Game Boy Shut-Down: UPDATED 2026-10-16
- Teera's finished design (animation + sound) lives in `src/boot/` (`boot.css`, `bootIntro.ts`, `bootSound.ts`, `bootSession.ts`), ported 1:1 from the project doc `ui/boot-intro-final.html`; spec `ui/boot-intro.md`. **Do not change the look, timing, fonts or sound** — only `BOOT_SOUND.syncMs` / `BOOT_DEFAULTS.speed` when Teera asks.
- Startup Flow:
  1. Long absence (or first open ever / `?boot=1`): Game Boy is displayed in shut-down state (`GameBoyShutDown.tsx`, bezel power LED dimmed, "PRESS START TO OPEN"). Pressing START triggers the boot intro animation directly, smoothly transitioning into active gameplay without showing the Barista loading screen (only one screen on cold open).
  2. Quick reload / reopen within 5–10 minutes: shows the Barista loading screen (`LoadingScene.tsx`), then normal chime into the game.
- Session time tracking: `src/boot/bootSession.ts` records `swimming_pool.last_active_time` periodically and on page events with a 10-minute threshold (`QUICK_RELOAD_WINDOW_MS = 10 * 60 * 1000`).
- Skip: tap the screen, any key, ◯ or START (GameBoyMobile dispatches `boot:skip`), ignored in the first 0.6 s. Game input is ignored while it plays; `music.holdForBoot()` keeps room music back and the AudioContext awake.
- Assets: `public/fonts/Rubik-800-italic-latin.woff2`, `VT323-400-latin.woff2` (+ OFL notes), `public/audio/boot_note.wav`, `boot_glow.wav` (exact bytes from the HTML; sw.js `v4` caches .wav).
- Checks: `tests/music.test.mjs` (hold), `npm test` (122 tests pass), `tsc -b`, `npm run build`.

## U-05 · Destination loading stories: FIRST CAFÉ SCENE (2026-10-27, review pending)
- Intent: real-photo NPC in a pixel setting, with one small pixel motion and a short line; the same identity can have different actions. First scene: Sun watches the train at the café. Photo pose generated from the existing server portrait, needs Teera’s identity/visual review.
- Room-transition lifecycle comes from `GameEngine.changeRoom` and does not block loading. A 420 ms display threshold includes the existing fade, with immediate removal on completion. Boot/startup remains separate. Only one scene is prepared ahead, with a simple fallback when unavailable; future scene selection avoids the last story when possible. Reduced motion uses a still.
- Files: `src/components/roomTransition/`, `src/App.tsx`, `src/game/Engine.ts`, `public/ui/stories/sun-window.webp`, `tests/room-transition.test.mjs`, `tests/engine-integration.test.mjs`, `docs/ui/room-transition-stories.md`.
- Validate on iPhone 13 for real smoothness, temperature, visual identity and network/memory before treating performance as confirmed. See the doc for extension and one-scene cache limits.

## CAFE-01 · Café: order a drink (steps 1–2 built 2026-10-20, on `main` working tree, not committed)
- **Idea (Teera):** the café is a once-a-day place to rest and learn by doing: order a coffee, learn whether it's strong or soft, drink it, and a random NPC scene plays. Knowledge told by an NPC is boring; knowledge found through an action sticks.
- **Step 1 (done):** the barista asks first, like a real café: "Would you like to order, or just talk?" → **Order a drink** / **Just talk** (the old Today's tip / About / Bye menu).
- **Step 2 (done):** "Order a drink" → her line "Here's our menu" → an order app in a Thai food-delivery-app layout: store header (the café postcard), category tabs (Coffee · With milk · Thai classics · No coffee), 10 drinks with a pixel glass icon, price and a **Taste** meter (5 beans, soft → strong), drink sheet (Hot/Iced +฿10 · sweetness 0/25/50/100% · Fresh/Oat milk +฿15 · cups), floating basket bar, basket (qty stepper, trash at 1), "Place order" → "Order sent!" → the barista reads the order back, "That's ฿X. It's on the house today!", "Here you are! Enjoy." **Fake for now:** no cup in the bag, no money, no cutscene.
- **Decisions:** caffeine is NOT shown on the menu, only taste strength: caffeine is the surprise for the future "guess while she brews" step (Mayo Clinic: 1 oz espresso ≈ 63 mg, 8 oz brewed ≈ 96 mg). Basket max 5 cups (`MAX_CUPS`), kept in memory until an order is placed. Café green `#1fa855`, gold D-pad focus ring that only shows while the controller/keyboard is used. Phones: fills the Game Boy screen; desktop: a phone-sized panel.
- **Input:** touch everywhere; ◯ confirm, ✕ back one screen (menu → closes, barista: "No rush"), D-pad ↑↓ move, ←→ change an option / jump category / change a basket qty (App forwards through `cafeInputRef` + a `DpadAdapter`); keyboard arrows/WASD, Enter/E/O, X/Esc (the app's capture-phase listener owns the keys while open). START/SELECT/emotes wait while ordering.
- **Files:** `src/game/cafe/cafeMenu.ts` (pure menu data + prices + basket helpers), `src/game/cafe/cafeBarista.ts` (her read-back lines), `src/components/cafe/` (`CafeOrder.tsx`, `CupIcon.tsx`, `cafeOrder.css`), barista nodes `greet`/`order`/`talk` in `dialogues.ts`, wiring in `App.tsx` (search "Café order app"), `tests/cafe-menu.test.mjs`.
- **Next (Teera decides):** one cup a day (Bangkok day) · "guess while she brews" question · drink → random NPC scene (watch-only vs. NPC talks to you) · a cup item in the bag.

## ECO-01 · Fish shop economy: buy, sell, money (logic 2026-10-27 on main; shop room + screens on branch `feat/fish-shop`)
- Loop: Quiet Bay catch → cooler (10 slots, fish spoil in 30 min) → Harbour Fish Shop: **Gen** buys fish, **Minato** sells sashimi/meals/drinks, Gen sells pantry/supplies → goods in the bag (gifts later).
- Fish price = tier × size × freshness × "Gen wants today" (2 species/day, ×1.5, same for everyone) × glut (×0.9 per same species sold today, floor ×0.5). God tier, protected animals and treasure are not for sale. ≈23 coins/catch.
- 48 goods from Teera's 3 sheets (icons cut to `public/sprites/shop/`), daily specials and limits, ice (+15 min freshness), cooler upgrades (+5 slots ×2). Shop goods can never be sold back. Minato never makes sashimi from freshwater fish (liver fluke).
- **Off in the live game** (`ECONOMY_ON` = `npm run dev` or `?test=shop|free`) until the save server holds the wallet (step 8).
- Doc: `docs/tech/fish-economy.md`. Code: `src/game/economy/` (pure `market.ts`, `wallet.ts`; store `walletStore.ts`; flag `flags.ts`), `tests/economy.test.mjs`.
- **Steps 2–4 built 2026-10-27 (Claude, branch `feat/fish-shop`):** room `fish_shop` "Harbour Fish Shop" (`rooms/fishShop.ts` + `fishShopLayout.ts`, art `src/assets/fish_shop_src.webp` → `scripts/process_fish_shop.py`), reached by walking off Quiet Bay's LEFT shore (the shop's right edge leads back). Gen (left, fish display) and Minato (right, sashimi tray) stand in front of the counter; sprites cut from Teera's sheets with `process_npc.py` (`docs/characters/{gen,minato}/character.json`; no dialogue portraits yet). Talk: `game/economy/shopTalk.ts` (Gen: Sell my fish / Buy supplies / What do you want today? / How do you price fish?; Minato: See the menu / Today's special / Sashimi from river fish? (liver fluke) / About you); lines ≤ 64 chars (2 rows). Counter screen `components/shop/ShopCounter.tsx` (+ `shop.css`, Bag look): Gen tabs Sell fish · Supplies · My bag; Minato tabs Sashimi · Meals · My bag; each fish shows a freshness countdown and its price in parts (base × size × fresh × wanted × glut); cart + Pay; ice usable from Sell / My bag; refusals in the NPC's voice. Corner chip `WalletChip.tsx` = coins + cooler at the bay and the shop. Touch, D-pad (one step per press) and keyboard; App wiring = search "Fish shop counter". The room, the bay exit and the chip exist ONLY when `ECONOMY_ON` (`npm run dev`, `?test=shop|free`); `tests/fish-shop.test.mjs` proves the live game has none of it. Not yet: eating/gifting goods, catch feedback "→ cooler (n/10)", portraits, coin icon + currency name, server wallet (step 8).

## ECO-02 · Server items and money — (a) merged; (b) shop.sell implemented, review pending (2026-10-28)
- Owner corrections supersede `PROMPT_item_system.md`: never enable `ECONOMY_ON` in ECO-02; ECO-04 opens it only after ECO-03. Stage (d) ends at server-answer caching. Sales do NOT record in the Fish Book; Nami/Kai, `lastCatchAt` and `catchDay` are unchanged. Price with shared `quoteFish` / `market.ts`, never a cooler-free `sellFish` adapter.
- (a) merged: server `coins`, `coolerLevel`, `goods[{uid,id,qty,at,expiresAt}]`, `econ{day,soldToday,earnedToday,boughtToday}`. Reads normalize without throwing, including bad balances; daily counters clamp on reduced limits. Expired goods disappear on read with no cleanup write. Catalogue perishability repairs preserve legacy stacks. Existing story money is separate; no local wallet import.
- (b): `POST /api/items` `shop.sell` accepts only operationId + chronological catches `{fish,sizeCm,caughtAt}`. `server/saves/sales.ts` owns the pure transaction calculation; `validateSaleCatch` is the single authenticity entry point for ECO-03 deckId/castIndex. Reuses `catchProblem` with 10s sale clock tolerance; Fish Book retains its existing 60s tolerance. Sale freshness replaces the book's 7-day recording age: old but otherwise valid fish are kept as spoiled.
- Impossible/unsellable fish, invalid size/time/season, duplicate/already-sold timestamps, gaps <3s and batches beyond owned cooler capacity refuse the whole operation. Spoiled and over-cap fish return indexed keptLines in Gen's voice; valid fish still sell. If every fish is kept, HTTP 422 includes kept details and writes nothing. Only paid fish advance glut and enter the sold set. checkedCoinBalance guards the computed balance before commit (current ceiling 2,000,000).
- Response: current player view + `result{sold,earned,kept,keptLines,balanceAfter,pricedAt,marketDay}`. Sold lines retain SellLine fields (fishId, base, size, fresh.label/mult, wanted multiplier, glut, price, uid, capped=false) plus index/sizeCm/caughtAt/isWanted, directly usable by `sellReceipt`. Kept lines carry their own reason/message; the old receipt's generic kept note remains a client concern for stage (d). Replay returns the original logged receipt, including its historical balance, alongside the current view; it never reprices. Same ID/different body is 409.
- Storage: root `recentSoldAt` sorted unique timestamps, retained until caughtAt+60min and across midnight; cap derives from 40 ops * 20 maximum slots = 800. No live eviction, including malformed/oversized stored arrays: reads remain non-throwing and sales refuse overflow. Normal successful writes never exceed 800. Current timestamp array max is 11,201 compact JSON bytes (13-digit timestamps), 6,400 integer payload bytes before Firestore overhead; safe-integer JSON maximum 13,601 bytes. It is internal to the player document, not returned by playerView. Stage (a) economy fields retain their 5,268-byte tested JSON bound. Proposed ice events (stage c) remain absent.
- **Known gaps:** (1) stage (b) prices with zero ice: an iced catch can pay less than the phone preview, or be kept as spoiled, until (c) verifies server-owned ice. (2) the phone still claims the fish AND its size; a cheater can claim maximum size within the catalogue range. ECO-03 fixes authenticity. (3) caughtAt-only identity can collide on a millisecond across devices; ECO-03 deck identity fixes it. A 60-minute sold-set window may span two daily budgets; full means refusal, never eviction.
- Budget: accepted sale remains **2 reads + 2 writes** (player + immutable operation log), before contention retries. 40 accepted ops/day shared with existing saves; 200 players = at most 16,000 writes plus other traffic. Replays/refusals write nothing. No town/VAT/stock read or write, no epoch reset yet. TOWN-01 will extend the transaction; ECO-04 must reset sold markers and prevent old-epoch receipts restoring money while retaining the ledger.
- `walletStore.ts`, the shop UI, live gate and Firestore rules unchanged. Stage (c) buy MUST create one slot per food piece using goodsAfter's behavior even though normalization preserves legacy stacks.
- Validation on dev-test-id: npm test **199 pass**, `tsc -b`, Vercel API build smoke (nonce/login/items) and production build pass. Firestore emulator (Java 21) **4 pass**, including concurrent duplicate sale, identical-operation replay, independent concurrent sales and ownership/write denial. Physical iPhone test not claimed; stage (b) is API-only until client integration in (d). Next: owner review, then (c) shop.buy + bag.use.

## TOWN-01 · The town layer — planned, prompt ready (2026-10-28); runs after ECO-04 + a week of live play
- One shared `town/lumen-bay` document: fish `stock` per species (lazy logistic regrowth per Bangkok day, a `reserve` the server never goes below, auto closed season with a gap between `closeBelow` and `reopenAt`), VAT `fund`, `built` projects, audit `totals`, and the same `epoch` as the players.
- Decided: VAT is included in the price and taxes buying, not selling; no bank; stock drops when a fish is SOLD (not caught); stock never changes which fish bite (the ECO-03 deck stays stateless); closed species are refused by Gen and released by the phone as a courtesy; no voting and no client admin in v1. `TOWN.targetPlayers` (default 50) scales every capacity.
- Facts shown to players: Thailand's standard VAT is 10%, the reduced 7% is extended to 30 Sep 2027 (Royal Decree No. 807); the central Gulf is closed to fishing 15 Feb to 15 May each year (Fisheries Department). Sources are linked at the bottom of the prompt; re-check the year's order before a real date is shown.
- **Budget warning:** the town document makes every accepted sale/buy 3 writes (player + log + town), so `opsPerDay = 40` at 200 players is 24,000 > 20,000. The plan must show the numbers and propose a fix before code. The town document is also a hot document (about 1 write/s).
- Prompt: `docs/ai/PROMPT_town.md`. Open for Teera: currency name, expected concurrent players.

## ECO-04 addendum · fresh-start epoch (2026-10-28)
- `ECONOMY_EPOCH` (starts at 1) + player `econEpoch` (missing = 0). An older epoch lazily resets coins, goods, cooler level, counters and sold-set; the ledger is never erased (one closing entry `epoch`); Fish Book, story, relationships and cards are NOT touched. Bump it once right before the gate comes off. Prompt updated in `docs/ai/PROMPT_economy_live.md`.

## P-02 · Cleanup (2026-10-11)
- Removed verified unused starter files, retired greybox tooling, old transfer snapshots, unused public map exports, and superseded font assets. Original production-art sources and active development harnesses remain.
- Tailwind scans application source and the HTML entry only; design documents no longer add unused utility styles.
- Fixed Dalbit Market’s missing thumbnail reference using its existing market artwork.
- Full deletion inventory, measured size changes, and validation: `docs/tech/cleanup-2026-10-11.md`.

## W-01 · World
- Lumen Bay plan, Dalbit market art. Docs: `docs/world/*`.

---

## Rules for any AI
1. Read this file first, then the doc for the ID you'll touch.
2. Show designs visually and work step by step. Ask one short question only when a wrong guess would be expensive.
3. Keep it fast on iPhone 13 (no heavy libraries, lazy-load images, prefer CSS/WebGL with fallbacks).
4. After each session, update this file: the touched ID blocks plus one Log line.
5. **Test on `dev-test-id`, ship on `main`** (Teera, 2026-10-11): build and test features on the `dev-test-id` branch (`npm run dev` = TEST Player ID, local dev saves); merge to `main` only when complete.
6. **Test-only things never reach the real game**: test IDs, test saves, test badges/tools/hooks must be guarded (e.g. `import.meta.env.DEV`, `?test=`) so they have no effect and leave no trace in the production build — check the built bundle when adding one.

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
- 2026-10-11 · Claude · ID-01 (a)–(c) merged to main (fast-forward to `id-01c-saves` after Teera's iPhone preview test); production deploy READY.
- 2026-10-11 · Claude · `npm run dev` plays as a TEST Player ID with local dev saves through the real save rules (branch `dev-test-id`); fixes the iPhone dev error `crypto.subtle.importKey` (insecure http context).
- 2026-10-11 · Antigravity · U-03: Added generic pocket link row (FISH BOOK with live species + pending badges), pocket-specific empty messages, Mother's line in story rooms only, docs/ui/game-menu.md, and ID-02 World Bag plan.
- 2026-10-11 · Antigravity · U-03: Disaggregated FISH pocket to list each caught fish directly; moved fish sprite to the left showcase tile (replacing the backpack) with full-width description below.
- 2026-10-11 · Codex · P-02: audited the actual Projects/swimming_pool checkout, removed verified unused files and narrowed generated CSS sources; retained current identity/saves and art pipelines. See the cleanup report for validation and measured savings.
- 2026-10-16 · Claude · U-04: wired Teera's boot intro into Press START (src/boot, self-hosted fonts + WAVs, sw.js v4, input/music hold, ◯/START skip); npm test, tsc, build and production-preview browser checks (390×844, 1280×720) pass.
- 2026-10-16 · Antigravity · U-04: Unified startup to single screen flow. Long absence / cold open shows Game Boy shut-down screen ("PRESS START TO OPEN") with unlit power LED, then triggers boot animation straight into game (no Barista loading screen). Quick reopen within 5–10 min shows Barista loading screen.
- 2026-10-20 · Claude · CAFE-01 steps 1–2: barista asks Order / Just talk; delivery-app style order screen (menu, options, basket, place order) with touch + D-pad + keyboard; barista reads the order back and says "Here you are!" (fake). tsc, vite build, `npm test` (+5 café tests) and browser runs at 390×844 + 1280×760 pass.
- 2026-10-27 · Claude · ECO-01: fish shop economy logic (market, cooler, sell/buy, ice, cooler upgrades, daily limits, safe save parsing), 48 shop icons + cutter, catch → cooler wiring, dev console; 24 new tests, 151 total pass, tsc clean. Not committed.
- 2026-10-27 · Claude · ECO-01 steps 2–4 on `feat/fish-shop`: Harbour Fish Shop room (exit from Quiet Bay's left shore), Gen + Minato sprites and talk, sell/buy/bag counter screen, coins + cooler chip; dev/sandbox only. 155 tests, tsc, vite build pass; dev-server browser runs at 1280×760 and 390×844.

- 2026-10-27 · Codex · U-05: first destination story framework and café Sun scene; test and iPhone/visual review pending.


- 2026-10-28 · Codex · ECO-02(a): bounded server economy fields, read-time goods expiry, Bangkok counter reset, 40-op daily budget, backward-compatible load; owner corrections recorded. Tests/type-check passed; production builder and physical iPhone validation limitations documented. Review pending; live economy remains gated.

- 2026-10-28 · Codex · ECO-02(a) review fixes: clamp daily counters on config reductions; repair goods perishability through SHOP_BY_ID while retaining legacy stacks; enforce configured 2,000,000-coin balance ceiling; trim file endings. 23 targeted API tests and API TypeScript check pass. Teera verified the prior stage with npm test (178), tsc -b, test:api and build; earlier EISDIR confirmed environmental. Stage (b) sold-set shape presented before implementation.

- 2026-10-28 · Codex · ECO-02(a) final review: balance normalization clamps without throwing, including fractional/over-ceiling balances; write-path guard remains strict. Sold-set design now derives 800 entries from the operation budget and maximum cooler size; timestamp collision and food-purchase slot invariants documented. 23 API tests and API TypeScript check pass locally; Teera verified preceding fixes with 181 tests, tsc -b and build. Await Teera's stage (a) merge before stage (b).

- 2026-10-28 · Claude · TOWN-01 prompt (fish stock, VAT fund, Mayor and board, money audit, simulation tests) in docs/ai/PROMPT_town.md; ECO-04 prompt gains the fresh-start epoch. Docs only; no code changed, ECO-02 files untouched. Write-budget warning recorded (3 writes per op once the town document exists).

- 2026-10-28 · Claude · ECO-01 polish (branch `feat/shop-receipt`, dev/sandbox only): receipt slip after Pay/Sell at the counter (lines, total, VAT 7% included + price before VAT on buys, "No VAT: selling your catch is not taxed" on sales, balance, Bangkok time); pure `economy/receipt.ts` (`vatIncluded` one rule per receipt, reusable by TOWN-01) + `VAT.rate` in economyConfig; catch card shows "→ Cooler n/10" / "Cooler full!". 5 new tests, 186 pass, tsc + build clean; browser run 390×844 (buy + sell slips). Display only: no fund yet, money unchanged.

- 2026-10-28 · Codex · ECO-02(b): synced dev-test-id with main (receipt included); implemented atomic server-priced shop.sell, 800-entry redemption markers, original-receipt replays, spoiled/capped kept lines, and no Fish Book changes. 199 tests, tsc, API smoke and build pass; all 4 emulator tests pass including concurrent sales. Zero-ice and client-claimed maximum-size gaps recorded; gate/cache remain unchanged.
