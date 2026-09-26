# Barista — Prompts & Version Log

Always attach the approved identity image (`references/identity_front.png`) when a tool accepts images.
Log every image you approve at the bottom.

## 1. Midjourney — identity (the "real person")
Default model V8.2. Clean backdrop first: easiest to reuse everywhere.

```
Waist-up portrait photo of a friendly Thai barista in their late 20s, short slightly messy
dark-brown hair, round thin-rimmed glasses, olive-green wool beret, cream short-sleeve linen
shirt with rolled sleeves, dark-brown canvas apron with a small embroidered green leaf,
warm gentle closed-mouth smile, calm kind eyes looking at the camera, body turned slightly
to the left, plain warm beige studio backdrop, soft window light from the left,
natural skin texture, candid documentary photography --ar 4:5 --raw --s 75
```
Mood version (same person in the café, for promotion — not for pixel conversion):
```
Same person, standing behind a wooden coffee bar in a small sunny Bangkok café,
morning window light, pour-over kettle in hand, shallow depth of field --ar 4:5 --raw --s 75
```

## 2. Midjourney — same person, new expressions (Edit Model)
Web: Imagine bar → image icon → add `identity_front.png` as reference.
Discord: add `--edit <image URL>` (up to 4 reference images).
One prompt per image, keep `--ar 4:5 --raw`:
```
Same person, same outfit and backdrop. Warm open smile, as if greeting a regular customer.
Same person, same outfit and backdrop. Thinking, one hand touching the chin, eyes up.
Same person, same outfit and backdrop. Excited, "I have an idea", one finger raised.
Same person, same outfit and backdrop. Thai wai: palms pressed together at the chest, eyes closed, gentle smile.
Same person, same outfit, full body, front view, then side view, then back view (character turnaround), plain backdrop.
```

## 3. ChatGPT — dialogue portraits (pixel, 8 frames)
Attach: identity photo + pixel sprite sheet.
```
Create a set of 8 HALF-BODY dialogue portraits (waist up) of the person in the attached
photo, drawn in the pixel-art style of the attached sprite sheet — same outfit and colors,
but MORE realistic proportions and MORE detail than the small sprite: detailed pixel art,
soft shading, warm and friendly. Body turned slightly to the LEFT, looking at the viewer.
Transparent background. No text. 2 rows × 4, every portrait the SAME size and framing.
Portraits 1–4 IDENTICAL except the face (same pose/position) so the mouth can animate:
Row 1: neutral (mouth closed) | neutral, mouth slightly open | warm smile (closed) | warm smile, mouth open
Row 2: thinking, hand on chin | excited, one finger raised | Thai wai, eyes closed | neutral, eyes closed (blink)
```

## 4. ChatGPT — pixel sprite sheet (✅ used 2026-09-25)
See `src/assets/npc_barista_sheet.png` (4×4, poses: idle, side_idle, back_idle, walk1 /
walk2, wave, talk, happy / thinking, wai, pour, serve / read, idea, point, blink).

## Version log
| Date | Tool | What | File | Approved |
|---|---|---|---|---|
| 2026-09-25 | ChatGPT | pixel sprite sheet, 16 poses | src/assets/npc_barista_sheet.png | ✅ |
| 2026-09-26 | Midjourney V8.2 | identity front (plain beige backdrop) | references/identity_front.png | ✅ |
| 2026-09-26 | Midjourney Edit Model | expressions: smile, thinking, idea, wai | references/expressions_v1.png | ✅ |
| 2026-09-26 | rembg + scripts/process_portraits.py | 5 photo portraits cut & aligned | public/sprites/npc/barista/portrait/*.webp | ✅ |
