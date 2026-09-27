# DJ — Prompts & Version Log

## 1. ChatGPT — pixel sprite sheet (do this first)
Attach **two** images so the style and size match the game:
`src/assets/spritesheet.webp` (player) and `src/assets/npc_barista_sheet.webp` (barista).

```
Pixel-art sprite sheet, 4x4 grid, 16 equal cells, transparent background.
Match the style of the attached sheets exactly: chibi proportions, big head, thick
dark outline, flat colors + one highlight, the same character height as the attached
characters, feet on the same baseline in every cell, every cell the same size.

NEW ORIGINAL CHARACTER (not based on any real person): a Thai K-pop-style male idol
who is the DJ and music host of a cozy Bangkok music club. Early 20s man, soft
two-block haircut with fluffy bangs, jet-black hair with lavender tips, one small
silver star earring, big white over-ear headphones resting around his neck,
oversized lavender bomber jacket with a small gold star patch on the chest, white
tee, thin silver chain necklace, black wide cargo pants, chunky white sneakers.
Bright, confident, friendly smile, slim build.

Row 1: front idle, side idle facing right, back idle, side walk facing right (left foot forward).
Row 2: side walk facing right (right foot forward), waving one hand high, talking with
one hand open, happy with both arms up.
Row 3: thinking with a finger on the chin, K-pop finger heart at the chest with a wink,
DJ pose (one hand pressing a headphone cup to one ear, the other hand forward as if
scratching a record, no turntable drawn), singing into a handheld microphone.
Row 4: dance pose (arms up to the left, one knee bent), dance pose (arms to the right,
other knee bent), pointing forward with a big grin, front idle with eyes closed (blink).

No text, no shadows, no background, no props except the microphone.
```
(Decided 2026-09-26: male idol. An earlier draft was a woman with a high ponytail.)

**Cut it into the game** (save the image as `src/assets/npc_dj_sheet.webp`):
```
.venv/bin/python scripts/process_npc.py src/assets/npc_dj_sheet.webp dj 2
```
The pose names come from `character.json` → `sheetPoses`. The `2` means café / club size (2×).

**Check before approving:** 16 separate figures (no touching); same height; headphones and
lavender tips visible in every cell; a transparent background, not a white one. If ChatGPT adds a
checkerboard pattern, ask again for a real transparent PNG.

## 2. Midjourney — identity (the "real person", for portraits)
```
Waist-up portrait photo of an original Thai K-pop-style male idol in his early 20s,
not a real celebrity, soft two-block haircut with fluffy bangs, jet-black hair with
lavender tips, one small silver star earring, white over-ear headphones resting around
his neck, oversized lavender bomber jacket with a small gold star patch, white tee,
thin silver chain, bright confident smile,
looking at the camera, body turned slightly to the left, plain warm beige studio
backdrop, soft key light from the left, natural skin texture, editorial photography
--ar 4:5 --raw --s 75
```

## 3. Midjourney — expressions (Edit Model, attach the approved identity)
```
Same person, same outfit and backdrop. Big open smile, as if welcoming the crowd.
Same person, same outfit and backdrop. Thinking, one finger on the chin, eyes up.
Same person, same outfit and backdrop. Excited "I have an idea", one finger raised.
Same person, same outfit and backdrop. K-pop finger heart at the chest, playful wink.
```
Cut them with `scripts/process_portraits.py` like the barista.

## Version log
| Date | Tool | What | File | Approved |
|---|---|---|---|---|
