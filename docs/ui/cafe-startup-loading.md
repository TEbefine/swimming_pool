# Café loading: Sun reads Le Petit Prince

Teera's approved direction (27 October 2026): combine the supplied photographic Sun with supplied pixel scenery and small pixel animations. Preserve his face, body, book, pose and clothing. This replaces the earlier standing Sun/BTS interpretation. Use the supplied desktop and phone compositions as the framing reference.

The same scene appears on every entry into the café, including quick reopening and after the cold-start boot intro. The scene remains for at least **5 seconds from its painted artwork**, while real room loading runs concurrently. Fast/cached loads still get the whole scene. Slow loads finish before entry; they do not add another five seconds. Then the scene enters automatically. The startup fade is 500 ms; travel uses the engine's existing fade-in. Controls are blocked during loading.

## Supplied layers

| File under public/ui/loading/cafe-reading | Role | Bytes |
| --- | --- | ---: |
| cafe-v1.webp | Static pixel interior with transparent window | 87,464 |
| garden-v1.webp | Static garden behind the window | 85,710 |
| sun-v1.webp | Static photographic Sun, chair, table, mug and book | 64,596 |
| leaves-v1.webp | Window foliage with a 1.2-degree sway | 54,916 |
| steam-v1.webp | Four small steam frames above the mug | 736 |
| bird-v1.webp | Four bird frames, crossing inside the window | 1,188 |
| leaf-v1.webp | Two leaf frames, one slow drift | 478 |
| spark-v1.webp | Two small glint frames | 362 |

Total: **295,450 bytes**, about 8 MB decoded RGBA before browser-specific overhead. Largest side is 1,168 px. No GIF/video, new runtime dependency, canvas animation loop, live chroma key, photo deformation or generated replacement character. Green/magenta mattes were removed once during asset preparation. The original source images remain the user's masters. `scripts/prepare-cafe-reading.mjs` reproduces these optimized derivatives using optional offline Sharp tooling; Sharp is not part of the app.

Source files: `Man reading a vintage Little Prince book(1).png`; the supplied `teerat_thongbai_…cozy_Bangkok_caf…`, `…lush_g…` and `…tropical_lea…` PNGs; `Cozy pixel café ambient sprite sheet.png`. No new image-generation prompts were used in this revision.

## Loading and failure behavior

- `CafeLoadingScene` waits for the three essential images to load and decode, then signals after a painted frame. Optional ambient art never gates entry.
- Failed/stalled essential art gets a calm text fallback after at most 3 seconds. It still releases the viewing gate, so a missing loading image cannot trap the player.
- `createPresentation` owns the cancellable minimum. The engine awaits presentation and actual loading, and clears held input before revealing the destination. Destroying the engine or unmounting App releases pending waits.
- The status says “Opening the café…” until actual assets finish, then “The café is ready.” No invented percentage.
- Reduced motion removes all scene animation; hidden-page motion pauses. There is no added audio.
- `/ui/` uses the existing service-worker art cache. The global meadow/barista preloads were removed. At most one story is prewarmed during idle time; the whole future catalogue is never downloaded at startup.

See `room-transition-stories.md` for adding the next destination. Physical-phone heat, memory and smoothness still need device review; compressed bytes alone do not establish those results.

## Verification

- 171 unit/integration checks pass, including painted-time timing, overlap with slow room loading, repeat visits, cancellation and input locking.
- Full TypeScript, Vercel API smoke and Vite production build pass.
- Chromium: actual App renders checked at 1280×900 and 390×844. Café travel twice, early keys, reduced motion, essential-image failure and cold boot all passed. Travel/boot scene duration was about 5.3–5.4 seconds including reveal; slow startup waits for its real assets.
- `scripts/test-cafe-loading-browser.mjs` reproduces the lifecycle check using an optional local Playwright installation. It starts its own Vite test server; no real identity is used.
- Repository-wide lint still reports two existing rules-of-hooks errors in unchanged `src/components/shop/ShopCounter.tsx`, plus existing warnings. No new lint error in changed loading files.
