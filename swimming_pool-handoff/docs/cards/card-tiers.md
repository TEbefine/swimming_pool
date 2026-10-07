# Cards — design, tiers and art prompts (v18, 2026-10-06)

Cards are items in the bag (`kind: 'card'`). Tap the icon → the full card opens. Trade it away → it leaves your bag.
Pipeline: art in Midjourney → realism fix in ChatGPT → frame overlay (ChatGPT, cleaned by script) → text, colors and effects in code. Never put text in the MJ art.

## Card front — current design (candidate to lock)
Inspired by a 3.5" floppy disk (save = keep a memory), not a copy of one. Mockup history: square disk → tall 2:3 → **3:4 portrait** (keeps disk proportions, still a card).
- **Frame**: thick matte cream-beige plastic rim, chamfered top-right corner, brushed-metal shutter at top center (half height, sits mostly on the top rim). Write-protect slider REMOVED (Teera: "just border"). Clean file: `frame_common.png` 1086×1448, picture window x105–1018, y145–1271; shutter window x623–727, y62–210.
- **Zones**: top rim = the object only (no printed info) · window = full art · bottom rim = all info.
- **Shutter window** = "the disk inside": magnetic film with fine tracks; material shows the RARITY (Common bronze-brown, Rare deep blue, Legend gold). Rejected: glowing light dot (looked like an app button). Sheen can move on tilt/slide.
- **Bottom label** (sits only on the bottom rim, flat normal corners, never covers art): off-white paper, faint ruled lines, **colored header strip = TYPE, color only, no icon or text** (Teera's call).
  - Name: handwritten, blue ballpoint (Caveat in mockup; Thai needs its own handwriting font later).
  - Short line: **the game's pixel font (Pixelify Sans, Sabai Pixel fallback for Thai)**.
- No card number (Teera: name + short line only).
- **Interaction**: slide the metal shutter sideways (like a real floppy) → the card's longer story appears; slide back to close; tiny drive click. One small shutter wiggle the first time a card is opened teaches it (no arrow). Tap = flip to the back. Controller: D-pad left/right = shutter, A = flip, B = close.
- **Back** (to design): DOS-style screen in the pixel font, e.g. `A:\> TYPE LEDGER.SAV`.

## Types (header colors)
| Type | Thai | Color | Example |
|---|---|---|---|
| Wealth | ความมั่งคั่ง | Ochre gold #C99234 | Sir Ledger |
| Wisdom | ปัญญา | Ink blue #3F5E8C | Clara |
| Heart | ความเมตตา | Soft red #B5544B | Mother |
| Courage | ความกล้า | Burnt orange #C0692E | Father |
| Craft | ฝีมือ | Olive green #6F7A3A | Barista |
| Spirit | จิตวิญญาณ | Lavender grey #857C99 | Spirit, Creator |
Icons (if ever needed, e.g. bag filters): use the Lucide set already in the project (coins, book-open, heart, flame, hammer, moon-star) — one consistent system, never hand-drawn one-offs.

## Tiers (rarity)
| Tier | Theme | Meaning | Shutter film | Effect (code) |
|---|---|---|---|---|
| Common | **Before** | Each NPC's humble beginning — the work before they became who they are | Bronze-brown | Still |
| Rare | **Dream** | Real life + a dream you keep believing in and fighting for | Deep blue | Slow holo shimmer |
| Legend | **Creator** | Teera, who opened the door between the real world and this one. 1 of 1 | Gold | **Gold foil on the planets only** (the Rare holo, in gold) + real-time planet carousel |
Rim material per tier: Common cream plastic · Rare translucent frosted blue · Legend **Gundam two-tone: black glass above, satin gold below, rendered live** (WebGL; LOCKED 2026-10-06; see "Legend frame" below). Progression idea: plastic → metal shutter → glass + gold.
Open question: Legend 1/1 owned by Teera leaves players nothing to chase at the top → maybe Creator = "Origin 1/1" plus a few limited Legends (e.g. each NPC's "Creator" moment: the day they start making something for others).

Card #1: **Sir Ledger** (Wealth, Common/Before) — "Every fortune starts with one heavy crate." Story (shutter): "Before the top hat and the gold coins, he carried crates at the harbor from dawn to dusk. He kept one cheap tin star from those days. He still wears it." (draft)

## ChatGPT recolor prompts (attach the clean `frame_common.png`)
- Rare: "Make the exact same frame, same shape and openings. Only change the plastic rim to translucent frosted blue plastic with a faint iridescent edge; keep the silver shutter."
- Legend: done in code (live WebGL two-tone material, no ChatGPT frame).
Fix-up reply if it drifts: "Only the colors change. Restore everything else to match the original exactly."

## Midjourney V8 art prompts (use --ar 3:4 for new art; existing 2:3 art crops fine)
Rule for all tiers: keep the top ~15% of the art as empty sky (the shutter covers it). All tiers are fine-art PHOTOGRAPHS (one series look).

### Common: Before (NPC origin stories)
Look: warm dawn light, low angle, hands in focus, film grain. Keep ONE identity clue from the NPC's current look (Sir Ledger = little two-pointed star pin). Attach the NPC's current portrait at low weight for face shape.
Sir Ledger art: done 2026-10-03 (MJ + ChatGPT realism edit).
```
Fine-art photograph, the humble beginning of a future tycoon: an original young man, age 24, not a real celebrity, working as a harbor porter at dawn, carrying a heavy wooden crate on his shoulder along an old wooden pier, thick wavy dark-brown hair swept back, a young full mustache, rosy cheeks, kind blue-grey eyes full of determination, sweat on his brow, rolled-up sleeves on a worn cream cotton shirt, patched navy vest with mismatched buttons, a tiny cheap tin two-pointed star pin with chipped blue-violet paint on the vest, seen from a low quiet angle, soft warm side light from the early sun, long gentle shadows, morning mist over the water, simple background with breathing space, warm earthy palette of ochre, cream and navy, mood: quiet dignity, the hard work before the dream comes true, medium format film photography, subtle grain --ar 2:3 --v 8 --raw --s 100 --no top hat, cane, gold, suit, old man, text, watermark, logo, frame, border
```
(Note: MJ may block prompts that state an age; use "young man" if it does.)
Next Commons: barista's first cup at a tiny street stall · lifeguard as a kid learning to swim · DJ practising alone in a small room with one lamp.

### Rare: Dream
```
Surreal fine-art photograph, a lone small figure standing on an ordinary quiet rooftop at blue hour, looking up as the night sky above slowly turns into a calm glowing ocean with a single whale swimming through the clouds, real world below and dream world above, soft cool light from the dream sky falling on the figure, warm city window lights far below, big negative space, cinematic wide composition, magical realism, mood: the dream is still possible if you keep believing, deep blues with gentle gold accents, subtle film grain --ar 2:3 --v 8 --raw --s 250 --no text, watermark, logo, frame, border
```

### Legend: Creator (1/1) — v6 "Real-time Worlds" (2026-10-06, current — all art final)
Concept: the Creator floats at the center; six planets (worlds of imagination) orbit around it. Their positions come from the **real clock**. Prototype artifact: "Creator Orbit" (card + orbit clock with preview speeds + top-down map).

**Creator art — FINAL v2 "floating" (2026-10-06).** Empty matte off-white linen cloak (whitened in code from cream — Teera: "should be white"), rounded hood, deep universe (blue-violet nebula) inside the hood and a narrow front opening. The cloak FLOATS in space: heavy cloth hanging straight down, long calm folds, hem level with a gentle ripple, no floor, no flare. Warm rim light from the upper right (matches the planets), left side in soft shadow. One bare human arm comes out through the front opening like an arm stuck out of a wrapped cloth — no sleeve, no cloth on the arm — in the Creation-of-Adam gesture, turned only ~15° toward the viewer (same direction as the hood), natural hand size. Grey backdrop, 1086×1448.
- Made with ChatGPT edits on the first standing Creator, step by step: float + space light → fabric back to matte linen (satin rejected) → hang straight (reference: a floating figure in heavy hanging cloth) → longer → arm out through the gap (no sleeve; showing the first Creator as the arm reference worked best) → straight level hem → arm angle (75° too much, ~15° right) → smaller hand.
- Cut-out: rembg isnet-general-use on the whitened image; crop (240,10)-(835,1300) = 595×1290; body axis x≈247, hem bottom y≈1278, fingertip ≈ (577, 494) in the crop. Gold light pool under the feet removed (no floor).
- **Inside = living universe (code, 2026-10-06).** Teera: keep the universe inside (not one single object) but make it beautiful and full of power. The nebula from the art stays; code adds on top (screen blend, clipped to the opening): a breathing violet heart of light (~6 s), three slowly swirling nebula glows (pink, cyan, violet), 46 twinkling inner stars (4 with a soft cross sparkle), light rising up through the opening, and violet light spilling onto the hood rim. Masks: `creator_inside_mask.png` + `creator_spill_mask.png`. Plus **many, many lights** (Teera: "only light, many many lights, near true"): ~240 realistic light points (hot white core + soft halo, three colour temperatures, sizes weighted small like real stars), each twinkling on its own rhythm and drifting slowly at different depths; a few rise upward; the 5 brightest get a soft cross sparkle. Rejected the same night: a single glowing crystal core ("not only one thing"); visible crystal shapes ("don't want to see crystals, only light").
- **Scale rule (Teera, final 2026-10-06):** the planets are the POWER, the Creator is only the BRIDGE. The Creator is TINY — about 5% of the card height (6.5% of the window), feet at 55% — floating in a thin corridor of space; the planets are giants (28–70% of the window height) in two masses above and below, the biggest cropped by the window edge, so the background no longer takes the view. Fingertip spark scales with the Creator.
- First standing version (studio pose on a floor) superseded: "doesn't belong in space".

**Background — FINAL:** true black space with real-looking stars (MJ "deep space, NASA/National Geographic, --raw --s 50" → ChatGPT clean-up: no noise, natural star sizes and colors, calmer center). 1086×1448. 14 brightest stars twinkle slowly in code (each its own rhythm, 3 brightest get a soft 4-point sparkle). Rejected: Milky Way photos ("too busy"), blue Earth night sky ("not space").

**Planets = worlds of imagination, focused on FEELING.** Every planet is beautiful; even hard feelings become beautiful. Real planets seen from space (not glass balls, not miniatures). Light from the UPPER RIGHT on all (day side right, night side left) — the night side holds each planet's soul (lights), so planets keep their baked shadows (decided 2026-10-06; full-lit planets would lose the night lights).

Workflow per planet: MJ prompt (template below) → ChatGPT "improve" with the finished planets attached as style references (pure black background, no stars, same framing/light, the planet's metaphor made visible) → Claude cuts it out (night-side left edge + top/bottom edges find the circle; glowing rim kept; ring planets cut by brightness so the ring stays whole).
```
A whole imaginary planet seen from space, cinematic space photograph, the full round planet floating in deep black space, [WORLD], a thin glowing atmosphere around its edge, soft sunlight from the upper right, vast scale, majestic, breathtaking, dreamlike but realistic, like a real space-mission photo of an imaginary world --ar 1:1 --v 8 --s 250 --no glass, glass ball, terrarium, miniature, diorama, macro, table, reflection, text, logo, watermark, frame, border, other planets
```

All six FINAL (2026-10-06):
| Planet | Look + metaphor | Real-time orbit |
|---|---|---|
| Wonder | blooming flower forests (pink, white, gold) seen from orbit; night side = millions of tiny lanterns | 1 month |
| Missing someone | deep blue ocean, silver spiral rain storms, soft glowing blue seas at night; ONE warm golden light on one small island | 2 months |
| Understanding (Yunseul) | half golden sunrise / half lantern-lit night, glowing line of dawn between; small fishing-village lights on the coasts ("not good or bad, it depends where you stand") | 1 season |
| Courage | warm amber/gold land, rivers of golden light branching like tree roots from ONE bright source (courage grows from one heart); not lava, not cracks | 4 months |
| Healing | fresh emerald forests, rivers of soft silver-blue light like veins, mist, green aurora; night forests breathe a faint green light | 6 months — healing takes time |
| Dream | pearl-white + lavender silk clouds, glittering ice ring, a whale shape in the night-side clouds (echo of the Rare card "Dream High") | 1 year — the slowest |

**Motion rules (code) — v2 "layered carousel" (2026-10-06, Teera's logic; replaces the 3D tilted orbits):**
- **13 depth layers**: 6 in front of the Creator · the Creator (layer 7) · 6 behind. **No size change** — every planet keeps its own size.
- In the **front layers planets travel straight left → right**; in the **back layers right → left**. **Narrow stadium track (2026-10-06, Teera: "narrower — Healing goes out of the frame")**: planet centres stay inside the window (6% inset each side); at each edge a short smooth turn (radius 14% of the window width) swings the planet from front to back (right edge) or back to front (left edge), switching layer at the turn's midpoint, brightness easing with depth. No planet ever fully leaves the frame; big ones are only cropped at the edges. Layers pair into one loop: **1↔13, 2↔12, 3↔11, 4↔10, 5↔9, 6↔8** — a planet leaving layer 1 on the right comes back in layer 13 from the right, and so on round (a carousel seen exactly from the front). Each planet owns one pair and one lane (height); its front and back passes share the lane.
- Position from the **real clock**, anchored to the **Birthday Alignment** (2026-10-06, Teera): every year at **sunrise on 21 February in Bangkok** (computed per year with the NOAA sunrise formula, ≈06:38–06:39) all six worlds arrive at one designed composition, then drift apart for a year. Between two birthday sunrises A and B each planet makes a whole number of loops: **Wonder 12 (≈1 month) · Missing someone 6 (≈2 months) · Understanding 4 (a season) · Courage 3 (≈4 months) · Healing 2 (≈6 months) · Dream 1 (a year)**. **Quiet sky (2026-10-07, Teera: "don't move too fast — small moves; yesterday it was there, next month you'll notice, or maybe no one knows")**: the fastest world moves ≈5% of the window width per day — never visible while watching, only day to day. Preview speeds: Live · 1 s = 1 h · 1 s = 1 day, so loop fraction = N·(now−A)/(B−A) + home. Everyone sees the same sky at the same moment.
- **Home composition (the alignment)** — x as a fraction of the window width: Dream .48 front (crowning the top, ring across) · Healing .22 behind (upper left) · Understanding .80 front (the dawn planet, upper right, at sunrise) · Wonder .718 front — waits just at the Creator's fingertip, almost touching (Creation of Adam), spark at full glow · Missing someone .27 front (lower left) · Courage .64 front (rising bottom centre-right). The eye travels an S-curve from the crown through the touch down to Courage.
- The orbit clock shows the next alignment date with a countdown and a **"See the alignment"** button that freezes the card at that moment ("Back to now" returns to live).
- Lanes (y and diameter as fractions of window height) and pairs: upper mass — Dream 1 year y .06 Ø .62 (pair 6) · Healing 1 moon y .22 Ø .40 (pair 2) · Understanding 1 day y .30 Ø .28 (pair 5); corridor — Wonder 2 min y .51 Ø .30 (pair 4, the only one crossing the Creator, briefly); lower mass — Missing someone 1 h y .80 Ø .46 (pair 3) · Courage 1 week y 1.0 Ø .70 (pair 1, outermost). The Creator is never hidden for long. Six pairs = six planets: more planets would need shared lanes or more layers.
- **Gold foil (2026-10-06, Teera: Rare has rainbow, Legend = gold, planets only):** each planet carries a gold holo band (115°, overlay blend + a thin screen-blend highlight) masked to its exact shape (Dream's ring included); the band's position follows the planet's screen x and the card tilt, so the gold sweeps across each world as it travels.
- Back passes are slightly dimmer (brightness .80); card tilt gives layer parallax (front layers shift most, back layers shift the other way). Fingertip spark brightens when a front planet passes the finger.
- The orbit clock's top-down map shows six nested loops (front edge near the gold camera mark).
- No self-spin, no video (decided). Superseded: 3D tilted orbits with perspective size change ("don't do big and small").

Next steps: save the final art files into the repo (docs/cards/legend/) and commit; balance planet sizes once more on a phone; then wire the card into the game's bag (`kind: 'card'`).

Card text (draft):
- Name: **The Creator** / ผู้สร้าง
- Short line: "Every dreamer needs a way in."
- Story (shutter): "On Earth, creators make music, dance, knowledge and healing. This one makes ways between worlds. Inside the cloak there is no body — only worlds, waiting. If you have imagination, if you want to learn, if you feel lost, or if your soul wants to grow — take the hand."

### Legend frame — v4 "Gundam two-tone" (LOCKED 2026-10-06)
Teera's idea: think Gundam — the frame is armour in two colours: **top 3/4 black, bottom 1/4 gold, joined like Gundam plates**. Minimal gold, modern ("think 2026").
- **Rendered live (WebGL)** from surface maps, lit by a virtual photo studio (overhead softbox, left strip, cool right rim, front fill). Tilt/drag swings the light across the materials; when untouched the light drifts slowly (off with reduced motion). No WebGL → static gold images + the paper label.
- **Top 3/4 = black glass**: smoked glass you can see the universe through (refracted at the edges, tiny prism fringe). Gold only as **fine hairlines** (~2px) on the outer edge and the window edge (Teera: thick gold was "too bold — more minimal"). Barcode + arrow = polished gold inlay.
- **Bottom 1/4 = satin gold plate** (18k-warm), mirror-polished contoured edge and window chamfer.
- **The join (style "Clean")**: at 75% card height on each side rail, a small 45° step (outer edge 12px higher than the window side), fine dark groove + soft shadow where the black plate overlaps the gold.
- **Shutter = black** brushed metal with a polished gold edge (Teera: top should be black too); the shutter window still shows the **gold film** (Legend rarity) like a small core.
- **Inscription**: no title, no subtitle — ONE sentence, **EVERY DREAMER NEEDS A WAY IN**, laser-etched dark into the gold plate in **Chakra Petch SemiBold** (Thai foundry Cadson Demak; squared, cut-corner letters echo the Gundam cuts; has Thai glyphs for later), caps, tracking ~0.24em. Centred on the card horizontally and exactly midway between the window's gold line and the bottom edge. The little square sits on the same centre line (moved up 24px) as a black window in a gold bezel. Text comes from the label's DOM text (one source; screen readers read it).
- Shape cleanup (all versions): Rare silhouette rebuilt at 4× precision, long edges snapped straight, arrow redrawn as a vector, outer edge contoured, window edge diamond-cut, marks engraved.
- Code: `glmat.js` (shader + texture builders), `material_maps.py` (normal/height + masks: etch, outer hairline, inner hairline), `apple_frame.py` (static fallback). Fonts embedded: Chakra Petch 600 (+ Cinzel, Jost italic, Pixelify kept for the alternates in code). Repo copy still to do.
- Built and kept in code but not chosen: **Energy seam** (bold 45° armour cut with violet Spirit light breathing through it + glowing status window) and **Armor detail** (energy + chamfered panel line, seam echo, three slanted vents). Teera went back to Clean.
- Rejected on the way (2026-10-06, in order): static gray Apple finishes ("looks normal, not special") → gray WebGL materials → Teera: "I like gold" → three golds (Black Glass & Gold chosen) → paper label ("should be premium") → engraved handwriting nameplate with gem + SAP hallmark + 1/1 ("no handwriting") → riveted brushed-gold plate with stamped Cinzel caps ("don't feel it") → glass inscriptions (laser frost / gold inlay / inner light / deep stamp) → Game Boy bezel line with twin lines ("old man — think 2026") → Gundam two-tone (chosen).

### Earlier Legend versions
- v1 (2026-10-04, rejected): figure holding a handheld game controller/joystick — "joystick was bad".
- v2 (2026-10-05, rejected): art-nouveau tarot Magician with the Creator + 4 AI NPCs as people around an altar — "too much".
- v3 (2026-10-05, superseded): faceless cloak in a city of server towers built like condos, open server-rack door.
- v4 (2026-10-05, superseded): hand made of golden nebula → charred and creepy. Lesson: the hand stays a normal human hand; only its position is strange.
- v5 (2026-10-06, superseded): planets = the game's places as cute dioramas, constant-speed orbit.
- Rejected planet ideas: element/type mapping (hot/cold/fire/water — "too easy"); small glass-ball planets; each planet spinning by itself (video or code); fully lit planets with code shadows (loses the night lights).
- Concept note (2026-10-05): a "human at a desk at night" Origin card was suggested; Teera kept the cloak Creator.
