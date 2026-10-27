# Room transition stories

Room transitions can show a quiet story: a photo NPC, a pixel setting, a tiny pixel movement and one short line. The first scene is Sun watching the BTS at the café. Sun's new pose is an interpretation generated from the existing server portrait; Teera should review the identity and scene on iPhone.

## How it works

- `GameEngine.changeRoom` emits the destination when a real transition starts and clears it when loading settles. Startup/boot is separate and unchanged. The room loader never awaits this UI or its art.
- The café scene appears at the start of a transition, during the existing 300 ms fade. Other destinations retain the 420 ms threshold. No minimum wait is imposed, and the scene goes away when the loader settles.
- `usePreparedStory` chooses one destination and one story at random after gameplay becomes idle, prepares a maximum of one scene, and retains its two decoded image elements. It aborts unfinished work when gameplay becomes busy. For café, if the scene is not prepared, the small local images are requested as the transition begins; the destination never waits for them. Other destinations without prepared scenes use a plain text fallback. The browser may still use network, CPU and memory; verify on device.
- `pickStory` excludes that room's previous story when possible. With one scene it can repeat. Selection is local to the session and never changes room loading or game state.
- The scene is mounted inside the handheld/desktop game window. One clipped train moves using a transform. Reduced-motion users see a still train.

## Add a future scene

1. Start from the matching character's existing identity image and create a new action with Teera's review. Keep the character photographic and the setting pixel art. Reuse existing room art if it suits the story.
2. Save a right-sized, compressed local image under `public/ui/stories/` using a new filename. Check actual bytes **and decoded dimensions**, and test the silhouette in the small game window. Avoid 4K, video, large sprite sheets, filters and unnecessary animated layers.
3. Add a unique entry to `TRANSITION_STORIES` in `stories.ts`: destination `roomId`, background path, character path, short line and supported effect. Add an effect only when it is truly needed, with a reduced-motion fallback. Do not preload the whole catalogue.
4. Run `npm test`, TypeScript and the production build. Test cached and cold travel, image failures, fast and slow room loads, background/foreground, reduced motion, touch/keyboard controls and consecutive trips. Verify frame smoothness, warmth, network and memory on the iPhone 13; do not assume a size target guarantees performance.

The current implementation prewarms **one scene total**, so as more destinations are added it can fall back often. Improve prediction or a strictly bounded cache only after measuring. Never delay travel merely so the art can appear.
