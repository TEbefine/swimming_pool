# Bay Fishing loading — Kai's trophy

Teera's rule: every map's loading story combines its own **real photographic NPC**, **pixel background**, a few quietly moving **pixel elements**, and minimal text. Preserve the NPC's reviewed identity, pose and proportions. Keep the real person still; animate only the small pixel layers. Café uses Sun; Quiet Bay / Bay Fishing uses Kai.

## Supplied composition

This scene follows the supplied trophy_still.png, trophy_phone.gif and trophy_desktop.gif previews. It uses Kai's joyful fishing portrait.png (the approved corrected-face, empty-hand photograph), the supplied teerat_thongbai_Pixel_art_game_background_16-bit_SNES-era_sty_dde8b106-d773-42eb-b5da-3dbf7ebf23db_2.png waterfront, and Hanging Yellowtail Pixel Animation Sheet(1).png. The pixel yellowtail hangs at his empty pinch grip with four slow gill/tail frames. His photo never bends or breathes. Tiny water glints reuse an existing sprite. No replacement person or new scene artwork was generated.

| Production layer | Size | Bytes |
| --- | --- | ---: |
| kai-v1.webp | 600×900 alpha photograph | 47,148 |
| bay-v1.webp | 1168-pixel-wide static pixel waterfront | 92,216 |
| yellowtail-v1.webp | 448×270, four 112×270 frames | 82,560 |

New scene art totals **221,924 bytes**, about 5.7 MB decoded RGBA before browser overhead. Original masters stay separate; only optimized derivatives ship. scripts/prepare-bay-loading.mjs reproduces chroma extraction/compression with optional offline Sharp tooling. No live keying, GIF/video playback, runtime dependency or JS animation loop is added.

## Shared lifecycle

The destination is room ID lake_pier (Quiet Bay). Startup, quick return, after cold boot, and every accepted trip into the bay select this scene. It uses the same scene shell, artwork readiness and cancellable presentation promise as café: **at least five seconds from painted essential artwork**, concurrently with real asset loading. Enter automatically only when both finish; slow actual loads remain gated without another five-second delay. Missing essential art uses the existing bounded text fallback. Optional fish/glints never trap entry. Reduced motion stops animation; hidden-page motion pauses; gameplay controls remain blocked until entry.

There is one reviewed bay scene today. As Teera supplies more, add them to TRANSITION_STORIES with the correct destination and identity. Pick once per visit, avoid the last variant when possible, keep selection stable during that visit, and prewarm at most one scene. Never preload the whole future catalogue.

## Verification

183 unit/integration tests and the full TypeScript / Vercel API smoke / Vite production build pass. The optional scripts/test-bay-loading-browser.mjs checks repeat travel, early input, reduced motion, missing art, cold boot, and phone startup. Physical iPhone heat/memory require device checks; compressed file size is not a measurement of device performance.
