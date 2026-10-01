# Performance budgets

The game keeps its native 1024 × 576 pixel-art canvas on every display. Do not multiply the backing canvas by devicePixelRatio: the artwork is intentionally pixelated.

- Phone/coarse pointer, narrow screen, reduced motion, Save-Data, or reported memory ≤4 GB: 30 rendered frames/sec during play, 15 while idle after four seconds.
- Desktop: 60 during play, 30 while idle. A 120/144 Hz display must not double game work.
- Active fishing always retains the active frame budget. Physics is subdivided into steps no larger than 1/60 sec; particles and camera use elapsed time.
- Hidden pages cancel rendering, presence heartbeats, HUD animation/polling, and network reconnects. Audio suspends when hidden/muted or after sounds finish.
- At most six image loads run together. Only current-room outfits/NPCs/props and needed water colors are decoded. Room changes release obsolete image references; shared base land sprites and manifest metadata are reused.
- Do not put canvas pixels behind continuously sampled blur on handheld screens. Keep the artwork, color, borders and static shadows.
- UI state should change when its value changes, not on every movement packet. Cache lighting/time calculations and avoid adding per-frame React state.

## Validation

Run `npm test` (Node 24+) and `npm run build` before merging performance changes. Tests cover frame budgets across 60/90/120/144 Hz, image concurrency/cancellation, timezone caching, network/audio lifecycle and HUD visibility/completion. F3 displays actual render rate and loaded sprite count for local inspection.

Browser smoke checks: café → pier → café; pool swim/float change; NPC dialogue; keyboard and mobile controller; fishing cast/reel; hide/resume; repeated room changes. Test portrait and landscape. Dev preview attempts the optional local relay; production does not probe a nonexistent relay.

On a real phone, compare the same scene/brightness for several minutes before and after. Record temperature/battery, frame time and memory using platform profiling where available. Browser/automated tests do not establish a measured battery or heat reduction.

## Multiplayer deployment

Cross-tab BroadcastChannel play remains available. For cross-device play set `VITE_WS_URL=wss://your-relay.example` in Vercel's build environment and redeploy. The optional development relay still uses port 3001. A static Vercel site does not itself run `server/wsServer.js`.
