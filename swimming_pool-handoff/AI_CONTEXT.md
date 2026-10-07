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
