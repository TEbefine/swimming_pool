# Room transition stories

## Creator contract

Each map will have its own character and situation. Teera supplies the elements; compose them as layers: photographic NPC with the same identity, pixel background, a few quietly moving pixel elements, and minimal story text. Keep the real person still. Do not replace supplied artwork with a generated interpretation.

The approved first scene is **Sun reading Le Petit Prince in the café**. Only café gets this new scene now. Future maps receive their own reviewed artwork; do not reuse Sun or Bao indiscriminately. Café has one scene today. As more are supplied, choose one at entry and avoid the previous one when another option exists; do not rotate scenes during a single load.

## Shared lifecycle

`GameEngine.changeRoom` announces the destination and begins real loading. App mounts the selected story immediately and returns a presentation promise. Essential artwork paints (or a bounded fallback is shown), then the five-second viewing clock begins. Room loading and this clock run in parallel. The engine keeps controls locked until both finish, then reveals the destination. Failed room loading clears the overlay; cancellation/disposal releases pending waits.

`LoadingScene` uses the same café renderer on startup. A quick return shows it immediately. A cold open preserves PRESS START and the boot intro, then shows the café scene before gameplay. Explicit developer `?autostart`/test harnesses skip startup presentation only; normal map travel still shows the destination story.

Destinations without a supplied story retain the existing simple fallback and 420 ms threshold. They do not inherit the café's five-second hold. The scene is inside the Game Boy/desktop game window, with one responsive camera crop for the interior and window layers.

## Add the next scene

1. Get Teera's reviewed NPC, setting and optional sprite elements. Preserve original masters separately. Remove chroma once during preparation, export compressed alpha WebP, and measure file bytes and decoded dimensions. Do not ship full GIFs or videos or do chroma keying at runtime.
2. Add a unique record to `TRANSITION_STORIES` (`stories.ts`) with destination `roomId`, layer paths, one short line, `effect` and `minimumMs: 5000`. Reuse an existing renderer when the composition matches. Different layouts can get their own small renderer, but must use the same presentation promise and report `onPresented` after essential artwork/fallback paints.
3. `pickStory` handles per-destination selection and avoiding repeats; the record chosen for a visit must stay fixed until it ends. Keep prewarming bounded to one selected story; do not preload the catalogue.
4. Prefer small CSS transforms/opacity and short sprite strips. Static NPC and background; reduced-motion still frame; pause motion while hidden; no sound without user action.
5. Check narrow/wide layouts, five-second fast and cached entries, slower real loads, missing art, input blocking, cancellation, cold boot, and repeat trips. Run the project's tests and full build. Check real-phone memory/heat separately.

Current café assets, source provenance and timings: `cafe-startup-loading.md`.
