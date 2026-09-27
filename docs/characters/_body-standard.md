# Body Standard — FINAL (2026-09-27): copy the lifeguard

**Decision (Teera):** the lifeguard sheet (`src/assets/npc_lifeguard_sheet.webp`) is the
style and body for every character. No template, no new proportions. Everything below
this section is history.


## Arm & body rule (2026-09-27, from the server/DJ fixes)
Measured at chest height (front idle): lifeguard total width 74 px, arms ≈ 2 art pixels + outline,
a dark 1-pixel gap between arm and body. DJ came out 92 px (+24 %), the server's sweater arms merged
with the body. Rule for every outfit: **sleeves are as thin as a bare arm, a 1-pixel gap between
arm and body, total width never wider than the lifeguard.**

## Prompt — any character in the lifeguard style
Attach `src/assets/npc_lifeguard_sheet.webp`:
```
Use the attached lifeguard sprite sheet as the exact reference. Draw a NEW 4x4 sprite
sheet (16 equal cells, transparent background) of a different character in EXACTLY
the same style: same pixel size, same body, same head size, same proportions, same
face style, same thick black outline, same shading, same size in every cell, feet on
the same baseline. Only the hair and clothes change.

CHARACTER: young Thai boy, short black hair, white swim cap with a blue band, navy
swim trunks, bare chest, bare feet.

Row 1: front idle, side idle facing right, back idle, side walk facing right (left foot forward).
Row 2: side walk facing right (right foot forward), waving one hand, talking with one
hand open, happy with both arms up.
Row 3: front walk (left foot forward), front walk (right foot forward), back walk
(left foot forward), back walk (right foot forward).
Row 4: thinking with hand on chin, sitting on the floor facing right with knees up,
lying on the belly with lower legs bent up, jumping with one arm up.

No text, no shadows, no background.
```
For another character, change only the CHARACTER line.

---

# Body Standard — one body for every character (v6, 2026-09-27)

**Decision:** the target look is exactly the **swimmer** (player, `src/assets/spritesheet.webp`)
and the **lifeguard** (`src/assets/npc_lifeguard_sheet.webp`). They already share one body.
Every character and every outfit is drawn on this body, so clothes can be swapped and
every animation works for everyone.

## The look, measured from those two sheets
| Rule | Value |
|---|---|
| Pixel grid | real low-res pixel art, about **16 × 32 pixels** per figure, scaled up ~6× nearest-neighbor, every pixel a visible square |
| Edges | stair-stepped, **no smooth curves, no anti-aliasing, no vector/cartoon look** |
| Outline | thick black 1-pixel outline around the whole figure |
| Shading | 2–3 shades per color in pixel clusters (see the cap and the skin) |
| Face | 1×2-pixel black eyes, 2–3-pixel smile, small skin-shadow blush |
| Head | big: **≈ 40 %** of the height (chibi, about 2.5 heads tall) |
| Body | compact and sturdy; shoulders a bit narrower than the head; arms reach the hips |
| Legs | short and straight (≈ 25 % of the height), a small 1-pixel gap between them |
| Canvas | every cell the same size, feet on the same baseline, transparent background |

## v6 polish — why the swimmer/lifeguard still feel a bit "off" (2026-09-27)
| Problem in the current sprites | Fix (now part of the standard) |
|---|---|
| **Stiff "gingerbread" pose**: arms stick out, hands flare, both sides identical | arms hang close to the body with a 1-pixel dark gap, hands small (2 px), relaxed |
| **No neck**: the head sits straight on the shoulders | a 1-pixel neck shadow under the chin |
| **Helmet head**: cap/hair covers half the head, face is small and low | eyes on the middle line of the head, hair as a shape with a spiky fringe, face ≥ half the head |
| **Pillow shading**: dark edge all around every shape | ONE light direction (top-left): shadow only on the right and bottom edges |
| **Double outline / halo** (black + orange rim from upscaling) | single dark outline, soft black-purple `#231A24` instead of pure black |
| **Two different bodies** (swimmer and lifeguard differ in head/leg size) | one template for everyone: `docs/characters/templates/movement_template.png` |
| **Walk has only 2 frames**, and no bounce | 4 frames per direction: contact → passing (body 1 px up) → contact → passing, arms swing opposite to the legs |
| **Idle is frozen** | 2-frame breathing idle: head + torso 1 px down, feet stay planted (no floating) |

Template sizes (native pixels, 20 × 32 canvas): head 12 × 11 · neck 1 · torso 8 × 6 · shorts 3 · legs 3 px wide, 6 long,
2-px dark gap · feet 4 × 2 · arms 2 px wide. Draw it again with `python scripts/mannequin_template.py`.

## Sheets (v6)
**Movement sheet (4×4)**, same for every character. Follow the template:
| Row | Poses |
|---|---|
| 1 | walk_down1 (contact), walk_down_pass, walk_down2 (contact), walk_down_pass2 |
| 2 | walk_up1, walk_up_pass, walk_up2, walk_up_pass2 |
| 3 | walk1 (side contact), side_pass, walk2 (side contact), side_pass2 |
| 4 | idle, idle_breathe, back_idle, side_idle |

**Actions sheet (4×4):** wave, talk, happy, thinking / blink, sit, jump_crouch (anticipation), jump_air /
jump_land (squash), + 7 character-specific poses (whistle, mic, lie, …).

## Prompt v6 — movement sheet on the template
Attach **3 images**: `docs/characters/templates/movement_template.png` (poses + proportions),
`src/assets/spritesheet.webp` (swimmer) and `src/assets/npc_lifeguard_sheet.webp` (style).
```
Image 1 is a pixel-art MOVEMENT TEMPLATE (4x4, 16 frames). Images 2 and 3 show the
art style of my game. Redraw image 1 as a finished character sprite sheet:
- keep EXACTLY the template's grid, frame order, poses, body proportions, head size,
  leg and arm positions, the 1-pixel body bounce and the arm swing in every frame
- real low-resolution pixel art like images 2 and 3: visible square pixels,
  stair-stepped edges, no smooth curves, no anti-aliasing, no vector look
- ONE light direction from the top-left: shadow only on the right and bottom edges
  of each shape (no dark edge all around)
- a single soft black-purple outline, no second colored rim
- small relaxed hands close to the body, a 1-pixel neck shadow, eyes on the middle
  line of the head

CHARACTER: [hair + outfit], e.g. "young Thai man, short spiky black hair, white
swim cap with a blue band, navy swim trunks, bare chest, bare feet".

Row 1: walking toward the viewer, 4 frames. Row 2: walking away, 4 frames.
Row 3: walking to the right, 4 frames. Row 4: front idle, front idle breathing
(1 pixel lower), back idle, side idle facing right.
Transparent background, same size in every cell, no text, no shadows.
```

## (v5) Core sheet — superseded by the v6 sheets above
| Row | Poses (left → right) |
|---|---|
| 1 | idle (front), side_idle (facing right), back_idle, blink (front, eyes closed) |
| 2 | walk1 (side, left foot forward), walk2 (side, right foot forward), walk_down1, walk_down2 (front walk) |
| 3 | walk_up1, walk_up2 (back walk), wave, talk |
| 4 | happy (both arms up), thinking (hand on chin), sit (on floor, facing right, knees up), jump |

Character-only poses (whistle, mic, lie, water poses…) go in a second **extras** 4×4 sheet.

## Prompt 1 — base body in the 16 core poses (ChatGPT)
Attach `src/assets/spritesheet.webp` (swimmer) **and** `src/assets/npc_lifeguard_sheet.webp`.
```
The two attached sprite sheets show the SAME body in the SAME pixel-art style.
Draw a new 4x4 sprite sheet (16 equal cells, transparent background) of this exact
boy as a plain BASE BODY. Copy exactly: the pixel size, the big head, the face, the
compact body, the short legs, the thick black outline, and the 2-3 shade pixel
shading. Real low-resolution pixel art: each figure about 16 pixels wide and 32
pixels tall, scaled up with nearest-neighbor so every pixel is a visible square.
Stair-stepped edges, no smooth curves, no anti-aliasing, no vector look.

Plain look: no cap, short black hair like the lifeguard's, warm tan skin, plain
light-grey tank top, dark-grey shorts, bare feet. A small 1-pixel gap between the legs.

Row 1: front idle, side idle facing right, back idle, front idle with eyes closed.
Row 2: side walk facing right (left foot forward), side walk facing right (right
foot forward), front walk (left foot forward), front walk (right foot forward).
Row 3: back walk (left foot forward), back walk (right foot forward), waving one hand
high, talking with one hand open.
Row 4: happy with both arms up, thinking with hand on chin, sitting on the floor
facing right with knees up, jumping with one arm up and feet off the ground.

Every figure the same size as the attached characters, feet on the same baseline.
No text, no shadows, no background, no props.
```
If it comes back smooth: *"Too smooth. Match the attached sheets pixel for pixel:
16x32 pixels, scaled up with nearest-neighbor, visible square pixels."*

## Prompt 2 — dress any character on the base body
Attach the approved base sheet (`src/assets/base_body_sheet.webp`) + the lifeguard sheet
(as an example of a dressed character).
```
Redraw the attached BASE BODY sheet as a new character. Keep EXACTLY the same pixel
style, body, head size, poses, order, cell size and baseline — only add hair, face
details and clothes on top, the way the attached lifeguard is dressed. Real
low-resolution pixel art, visible square pixels, thick black outline, 2-3 shade
pixel shading, no smooth curves, transparent background.

CHARACTER: [hair + outfit + one signature item]

Same 16 poses in the same order. No text, no shadows, no background.
```
CHARACTER line examples:
- Player (pool): `white swim cap with a blue band, navy swim trunks, bare chest, bare feet.`
- Player (café): `no cap, short black hair, oversized sage-green shirt, charcoal long pants, white sneakers.`
- Lifeguard: `white cap with a red cross, red tank top with a white cross, red shorts, whistle on a cord.`

## History (why v5)
v1–v4 (same day) tried a taller body with long thin limbs described in words. ChatGPT
turned it into a smooth vector cartoon (v1–v3), and the taller body lost the cute
compact look. Lesson: **show a pixel reference, don't describe proportions**.
The swimmer + lifeguard style is the standard.
