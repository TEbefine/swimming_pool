# Memory Disk Cards

Card system for the bag: each card is an item, styled as a floppy disk that saves one memory.
Full design rules live in the claude.ai Project docs `cards/card-front-spec.md` and `cards/card-tiers.md`.

## Open the prototype
Open `prototype/memory-disk-cards.html` in a browser (fully self-contained, works offline).
Same page online: claude.ai artifact "Memory Disk Cards".
- Drag across a card to tilt it. Slide the metal shutter to read the story.
- Common "The First Crate" (Sir Ledger, Wealth, ochre tab) and Rare "Dream High" (Yunseul, Spirit, violet tab with a faint sheen, 2-layer depth).

## Files
| File | What it is |
|---|---|
| `prototype/memory-disk-cards.html` | Working prototype, all images and the font embedded |
| `prototype/template.html` | Same page with `__PLACEHOLDER__` slots instead of embedded images |
| `assets/frame_common.png` | Cream frame with arrow, gray barcode (SAP-B001) and square cut-out. 1086×1448, transparent window |
| `assets/frame_common_base.png` | Cream frame without the spine details |
| `assets/frame_rare.png` | Blue frame (code recolor; replace with the ChatGPT frosted-blue version later). Barcode SAP-D001 |
| `assets/common_the-first-crate_art.png` | Sir Ledger art |
| `assets/rare_dream-high_full.png` | Dream High full image |
| `assets/rare_dream-high_front.png` | Front layer: Yunseul + roof (transparent) |
| `assets/rare_dream-high_back.jpg` | Back layer: scene with the front area filled in |
| `assets/TEERAHandwritingTH.woff2` | Teera's handwriting font, used for the label line |

## Frame geometry (1086×1448)
Picture window x105–1018, y145–1271. Shutter x287–800, y14–233; shutter window x623–727, y62–210. Label sits on the bottom rim.

## Next steps
1. Rare frame: ChatGPT recolor of `assets/frame_common_base.png` to translucent frosted blue.
2. Optional middle layer (village + mountains) for Dream High.
3. Card back (DOS screen), drive click sound, controller buttons (D-pad left/right = shutter, A = flip, B = close).
4. Move into the game: `kind: 'card'` in `src/game/story/items.ts`, tap a card in the bag to open this view.
