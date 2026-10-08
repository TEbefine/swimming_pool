# AI_CONTEXT — swimming_pool (Lumen Bay) · READ THIS FIRST

Any AI working on this repo: read this whole file before doing anything. Every topic has an **ID**. Each ID stores its items: status, decisions, files and what's next. When you finish work, update the blocks you touched and add one line to the **Log** at the bottom. Never delete a rejected idea: move it to "Rejected" with the reason, so nobody repeats it.

Last updated: 2026-10-08 (wallet and START/bag integration)

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

## ID-01 · Player identity (12-word wallet): STEP (a) APPROVED; INTEGRATION IN REVIEW
- Approved plan: `docs/ai/ID-01-plan.md` supersedes the original prompt's PIN, server-stored nonce, session and save-model details. Original brief: `docs/ai/PROMPT_player_id.md`.
- Branch: **id-01a-wallet**, based on main. Local wallet + mandatory written backup and three-word check; exactly **7 controller presses from 8 inputs** instead of a six-digit PIN. Dot-only entry, no press feedback; desktop arrows + T/O/X/Q.
- Device vault encrypts BOTH the 12 words and private key using PBKDF2-HMAC-SHA-256 (600,000 iterations; random 16-byte salt) + AES-256-GCM (fresh 12-byte IV, 128-bit tag). Secrets never intentionally enter networking, logs or plaintext persistent storage. Short combos remain vulnerable to offline guessing.
- Missing vault is restore-first, never silently creates a replacement. Teera approved local 12-word recovery in (a); server-data recovery remains (d). Request persistent storage and suggest Add to Home Screen; written backup remains required.
- Fresh code is required for revealing words or changing the code. (a) uses a public local preview receipt for 48-hour convenience, NOT server authentication. (b) will use Firebase browserLocalPersistence and server-verified wallet sign-in age, without extending it on token refresh/visits.
- (b) plan: stateless HMAC challenge at `/api/nonce` (zero Firestore writes); `/api/login` verifies first, then create-only used-nonce marker, then Firebase custom token. Both routes require per-IP limiting; serverless/shared-limiter limits must be explicit. Amoy 80002; no money or trading yet.
- (c) plan: Dalbit end-of-day validated save + local draft; Lumen Bay only community knowledge/fortune memory. Lumen Bay fish are released after NPC finish and recorded as Fish Book knowledge, never inventory fish. Cards save immediately. Catalogue/quantity/action-rate validation; append-only API logs and owner-read/no-client-write rules. Old local saves may reset. Reward validation does not block (a)/(b).
- Firebase Spark + Vercel API routes, no Cloud Functions. Service account/HMAC secret remain server-only. `server/wsServer.js` unchanged; token checks later in (e).
- Main files: `src/identity/*`, controller identity mode in `GameBoyMobile.tsx`, app entry/START row 3 integration, Home Screen manifest. Verification and phone checklist: `docs/ai/ID-01-review.md`.
- Wallet review and initial iPhone 13 flow approved by Teera; exact physical unlock timing remains unmeasured. Integration branch: `integrate/id-01a`. START row 3 is the only profile/Player ID entry; one overlay pause API prioritizes identity, then menus/bag/SceneBox, then player input.
- Next: integration preview and physical iPhone 13 unlock timing/10-minute performance check; Teera approval before merge or step (b). One step = one branch = one AI builds, another reviews, Teera tests the preview, then merges.
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
- My handwriting font **TEERA Handwriting TH** (Thai + English) and the pixel font **Sabai Pixel / Pixelify Sans**. Docs: `docs/ui/*` (talk screen, handheld shell).

## U-02 · START menu (Pokémon FireRed/LeafGreen style)
- **Status:** Step 1 finished (shell, cursor memory, description box, input routing, mutual overlay exclusivity, EMOTE sub-screen, FISH BOOK, BAG, HELP, EXIT).
- **Decisions:**
  - Placed on the right side inside the game screen (~46% width), cream background `#FFF8EC` with 2px `#1E293B` border and inner highlight (dark mode uses `--gb-*` tokens).
  - No backdrop blur for smooth iPhone 13 performance; subtle dimming layer.
  - Labels in uppercase pixel font (minimum 16px to avoid iOS zoom).
  - Description box at the bottom explaining active highlighted row.
  - Controls: D-pad / WASD navigate cursor, ◯ / Enter / Z confirms, ✕ / Escape backs out. START button / KeyM toggles START menu.
  - In multiplayer, local player stops walking, but the world keeps ticking (NPCs and players keep moving).
  - Overlay exclusivity: START closes SceneBox; SELECT (SceneBox) closes START menu.
- **Files:** `src/components/startMenu/` (`StartMenu.tsx`, `MenuList.tsx`, `EmoteScreen.tsx`, `useMenuStack.ts`, `menu.css`), `src/game/haptics.ts`, `src/game/audio.ts`, `src/game/Engine.ts`, `src/App.tsx`, `src/components/GameBoyMobile.tsx`.
- **Integration:** START row 3 opens the existing profile/Player ID flow; controller feedback is suppressed during identity code entry. Input pause preserves multiplayer world updates.
- **Next:** Step 2 — OPTION screen + VIBRATION setting.

## U-03 · Bag (Pokémon Black/White & ORAS style)
- **Status:** Step 1 finished (fullscreen bag layout inside handheld shell, centered arcade cabinet window on desktop, top pocket bar with inline pixel SVGs & dot pagination, carried coins display, item list with ▶ cursor and count, auto-scroll to keep cursor visible, mother's empty notice, CLOSE BAG terminal row, per-pocket cursor memory, bottom description box with 48px pixel icon & metadata infoline, open/close routing from START / B / HUD, dev sandbox "+ Fill Bag" button).
- **Decisions:**
  - One source of truth for pockets: `pocketOf(id)` and `POCKETS` (`items`, `fish`, `cards`, `key`) in `src/game/story/items.ts`.
  - Full screen coverage on mobile over the game screen (HUD is hidden underneath, Coins counter is displayed in the pocket bar). Centered 420px panel on desktop with backdrop dimming.
  - Pockets remember their row cursor position across pocket switching.
  - Controls: ←/→ change pocket, ↑/↓ navigate items, ◯ confirms, ✕ backs out.
  - Back navigation routing: opened from START → ✕ reopens START menu on BAG row. Opened from B or HUD button → ✕ closes bag.
  - All inventory changes will flow through `src/game/story/bagActions.ts` (prepared for ID-01 server authority).
- **Files:** `src/game/story/items.ts`, `src/components/bag/` (`BagScreen.tsx`, `PocketBar.tsx`, `ItemList.tsx`, `bag.css`), `src/components/StoryHud.tsx`, `src/dev/storyTest.tsx`, `src/App.tsx`.
- **Integration:** bag shares the overlay pause API and keeps its existing START/B/HUD routing.
- **Next:** Step 2 — Action menu (EAT, CHECK, CANCEL) + `bagActions.ts`.

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
