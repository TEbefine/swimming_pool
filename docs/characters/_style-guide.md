# Art Style Guide (shared by every character and scene)

Lessons learned while building the pool, café and My Room. Follow these and new art fits on the first try.

## Characters
| Thing | Rule |
|---|---|
| Sprite sheets | 4×4 grid, one pose per cell, same size in every cell, feet on the same baseline, transparent background |
| Pose order | idle, side_idle, back_idle, walk1 / walk2, wave, talk, happy / thinking, (special), (special), (special) / (special ×4) |
| Size in game | 1× rooms (pool): 48×82 px frames. 1.5× rooms (café, My Room): 72×121 px frames |
| Style | big head, thick dark outline, flat colors + one highlight (see the player sheet) |
| Dialogue portraits | REAL PHOTO style (Midjourney): half-body, plain white/beige backdrop, 5 faces: neutral, smile, thinking, idea, wai. Cut with `scripts/process_portraits.py` → 760×1000 transparent, aligned by head. The world stays pixel art; the photo appears only in conversations |
| Identity image | realistic photo-style reference (Midjourney) — the "real person" every pixel version is drawn from |

## Scenes
| Thing | Rule |
|---|---|
| Canvas | 1024×576 (16:9) |
| The ruler | the DOOR: bookshelf ≈ door height, bed ≈ door height long, desk/counter ≈ half the door |
| Furniture | sized to the ROOM, not to the chibi body |
| Rooms | empty room image + separate furniture pieces (4×4 sheets, transparent) |
| Windows | ask for flat magenta #FF00FF glass → cut out → shared city panorama shows through |
| Layers | sky (code) → far movers → city → train → room → wall decor → floor → depth-sorted objects & people → overhead → light/night |
| Tall items | nothing on counters/desks taller than a mug near where a character's face will be |

## UI
| Thing | Rule |
|---|---|
| Dialogue colors | cream #FFF6E5, brown border #4A2E1A, portrait backing #ECDEC4 |
| Fonts | Press Start 2P (English), Itim (Thai) — in public/fonts/ |
| Text | no emoji inside dialogue (pixel fonts can't draw them) |
