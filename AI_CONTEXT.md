# AI_CONTEXT — swimming_pool (Lumen Bay) · READ THIS FIRST

Any AI working on this repo: read this whole file before doing anything. Every topic has an **ID**. Each ID stores its items: status, decisions, files and what's next. When you finish work, update the blocks you touched and add one line to the **Log** at the bottom. Never delete a rejected idea: move it to "Rejected" with the reason, so nobody repeats it.

Last updated: 2026-10-07 (handoff from Claude to ChatGPT)

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

## ID-01 · Player identity (12-word wallet): NEXT TO BUILD
- Every player gets an auto-created wallet on first visit (12-word recovery phrase + a 6-digit PIN to confirm). For now: wallet ID + login only, on the **Polygon testnet (Amoy)**. Real purchases maybe later.
- **Priority:** store each player ID's items correctly, fairly, and hard to cheat. Players must feel their items are truly theirs. Trading between players is NOT a priority yet.
- The idea is borrowed from how Chronolox auto-creates wallets.
- Status: not started. Build prompt: see `docs/ai/PROMPT_player_id.md`.
- Where it runs: wallet + PIN + private key on the player's device only · `/api/nonce`, `/api/login`, `/api/items` as Vercel API routes with firebase-admin · Firebase Auth + Firestore on the free Spark plan (no Cloud Functions) · wsServer.js unchanged for now, token check later (step e).
- Work rule: one step = one branch = one AI builds, another AI reviews, Teera tests the Vercel preview on iPhone, then merges.

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
- 2026-10-08 · Antigravity · U-03 Step 1 finished (Bag screen shell, pocket bar, item list, description box, input router, cursor memory per pocket, ?test=story fill tool). Branch: `feat/bag`.
- 2026-10-10 · Claude · U-02 Step 2 + U-03 Step 2 finished (ChatGPT menu brief: single menu state machine, field menu, Options screen, Bag redraw, Eat/Check actions on the real save, desktop HUD hidden while open; 81 unit tests + browser flows on handheld/desktop/production build pass).
