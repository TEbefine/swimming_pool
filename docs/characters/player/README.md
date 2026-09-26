# Player Character — Motion & Art Plan

> The boy with the white-and-blue swim cap that every player controls.
> Code lives in `src/game/Engine.ts` (`updateLocalPlayer`, `getPlayerSprite`, `renderPlayerSprite`).

## How he moves now (2026-09-26)
| Feature | What it does |
|---|---|
| 4-way facing | Remembers down / up / side. Stops facing the way he walked (front, back or side) |
| Walk cycles | side: walk1 → side_pass → walk2 → side_pass · down: walk_down1 → pass → walk_down2 → pass · up: same with walk_up |
| Walk frames | Front/back walk frames (`walk_down1/2`, `walk_up1/2`) are made from idle art by `scripts/make_walk_frames.py`, lifting one leg at a time. Body stays on the ground (no bob, it looked like a floating ghost) |
| Art fallback | Missing poses borrow the nearest idle (`POSE_FALLBACK`). Add real `walk_down1.webp` etc. to the manifest and they're used automatically |
| Head lining-up | Standing and walking poses are drawn lined up on the head (`HEAD_ANCHOR`), so he doesn't slide back and forth between side-walk frames. Wave, sit and other poses keep the image center |
| Jump | One real hop (520ms, `JUMP_MS` / `JUMP_HEIGHT`) that starts when you press it. The shadow shrinks in the air, with dust on take-off and landing. No double-jump in mid-air. You can jump while walking or running. Remote players see the same hop (pose timing is tracked per player, with no network change) |
| Sit / lie (floor) | Stays down until you walk or press the same button again. Before, he stood up by himself after 2.8s. Cushion seats are unchanged |
| Running | Steps speed up (0.085s instead of 0.13s) + dust puffs behind the feet |
| Idle life | After 7–16s standing still: glance the other way, turn to face the camera, or think. Adds yawn / stretch / look_back once that art exists (`FIDGET_EXTRAS`) |
| Blink | Blinks for about 140ms every 4.2s once `idle_blink` / `side_idle_blink` exist (offset per player) |
| Walls | Slides along furniture instead of stopping dead. Click-to-move gives up after 0.25s blocked (no more walking in place) |
| Keys | Physical key codes, so WASD and 1–5 work on the Thai keyboard layout. Releases all keys when the window loses focus |
| Crisp | Draws on whole pixels (no sub-pixel blur) |
| Network | About 15 position updates/s while walking (was about 60). Pose changes still send instantly |

## Art to make next (ChatGPT → 4×4 sheet → `scripts/process_assets.py`)
Attach `src/assets/spritesheet.png` as the reference, then:

```
Pixel-art sprite sheet, 4x4 grid, 16 equal cells, transparent background.
Same character as the attached sheet: chibi boy, big head, white swim cap with
blue band, black hair, bare chest, navy swim trunks, bare feet. Same size, same
thick dark outline, same flat colors + one highlight, feet on the same baseline
in every cell. No text, no shadows, no background.

Row 1 (walking): front walk left foot forward, front walk right foot forward,
back walk left foot forward, back walk right foot forward.
Row 2: front idle with eyes closed (blink), side idle facing right with eyes
closed, big yawn with one hand over mouth, stretching both arms up.
Row 3: looking back over the shoulder, Thai wai (palms pressed together at
chest, small bow), clapping, peace sign with a smile.
Row 4: side run facing right (long stride, arms swinging) x2 frames,
sleepy (eyes half closed, head tilted), laughing with eyes closed.
```
Side walk: `walk1` and `walk2` from the first sheet are almost the same pose, so side walking looks like one leg doing all the work. Two new side-walk frames (row 4) fix that.

Names for the manifest: `walk_down1, walk_down2, walk_up1, walk_up2, idle_blink, side_idle_blink, yawn, stretch, look_back, wai, clap, peace, run1, run2, sleepy, laugh`.
The code already picks up rows 1–2 and yawn/stretch/look_back. Wai, clap, peace, run and laugh need an emote button or a small code hook.

## Open questions for Teera
- **Outfit:** he wears swim trunks in the café and in My Room. Keep that as the game's signature, or add a land outfit (for example a tee + shorts, keeping the cap) that switches per room?
- **Crispness:** `process_assets.py` downscales with LANCZOS, which makes soft edges and halos. A hard-alpha + palette-quantize pass makes the sprites sharper (comparison image in the chat, 2026-09-26). Apply it to all sprites?
