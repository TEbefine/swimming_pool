# Café Server — Prompts & Version Log

## 1. ChatGPT — pixel sprite sheet
Attach `src/assets/spritesheet.webp` (player) and `src/assets/npc_barista_sheet.webp`
(barista, his co-worker, for the same style, size and apron).

```
Pixel-art sprite sheet, 4x4 grid, 16 equal cells, transparent background.
Match the style of the attached sheets exactly: chibi proportions, big head, thick
dark outline, flat colors + one highlight, the same character height as the attached
characters, feet on the same baseline in every cell, every cell the same size.

NEW ORIGINAL CHARACTER (not based on any real person): the quiet young male server
at a cozy Bangkok café, co-worker of the attached barista. "Puppy boy" charm: looks
quiet and shy at first, adorable when he smiles. Early 20s Thai man, slim, a little
taller than the barista. Fluffy soft dark-brown hair with bangs over the eyebrows and
two small tufts on top that look like puppy ears. Big round gentle eyes, slightly
droopy. Oversized oatmeal knit sweater with sleeves covering half his hands, the same
dark-brown café apron with a small green leaf emblem as the barista, dark-olive
pants, brown sneakers, a tiny round bandage on one cheek.

Row 1: front idle (calm, neutral face), side idle facing right, back idle, side walk
facing right (left foot forward).
Row 2: side walk facing right (right foot forward), small shy wave with a sweater-paw
hand, talking while rubbing the back of his neck and looking slightly away, happy
with a big closed-eye smile.
Row 3: thinking with a finger on the chin, carrying a small tray with one coffee cup,
wiping a table with a cloth (no table drawn), reading an open book.
Row 4: shy, both sweater-paw hands near his blushing cheeks, Thai wai (palms together
at the chest, small bow), excited little bounce with both fists up and sparkly eyes,
front idle with eyes closed (blink).

No text, no shadows, no background, no props except the tray, cup, cloth and book.
```

**Cut it into the game** (save as `src/assets/npc_server_sheet.webp`):
```
.venv/bin/python scripts/process_npc.py src/assets/npc_server_sheet.webp server 2
```

**Check before approving:** 16 separate figures, same height as the barista, the
"puppy-ear" tufts and sweater sleeves visible in every cell, the apron matches the
barista's, and a real transparent background (not a checkerboard).

## 2. Midjourney — identity (for photo portraits, later)
```
Waist-up portrait photo of an original young Thai man in his early 20s, not a real
celebrity, fluffy soft dark-brown hair with bangs, big round gentle slightly droopy
eyes, shy small smile, oversized oatmeal knit sweater with sleeves covering half his
hands, dark-brown canvas café apron with a small embroidered green leaf, tiny round
bandage on one cheek, looking at the camera, body turned slightly to the left, plain
warm beige studio backdrop, soft window light from the left, natural skin texture,
candid documentary photography --ar 4:5 --raw --s 75
```

## Version log
| Date | Tool | What | File | Approved |
|---|---|---|---|---|
