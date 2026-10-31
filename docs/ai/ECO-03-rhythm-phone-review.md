# ECO-03 rhythm — iPhone feedback follow-up

Base dev-test-id **4f9fd27**, pulled first. All changes are free-only. No main merge, release, reset or shared-database writes.

## Changes

- Normal and combo taps share the same rule: `min(maxSpeed, max(netV, 0) + lift)`. A falling net immediately gets an upward velocity. Normal lift .55; Perfect combo lift .65 from streak2. Dalbit retains its original sum, even if the optional free lift override is passed.
- Perfect requires the fish to overlap the yellow net **before the lift**. Normal events advance physics to their timestamp; delayed events use a bounded 240-sample position history and interpolation between rendered simulation samples. Unknown/out-of-history positions refuse Perfect safely. Off-beat or outside-net presses are normal taps and break the streak. One Perfect shows feedback but has no lift/fill bonus. Streak2/4/6 gets the existing10/20/30% fill bonuses, capped; .65 lift starts at2. Timing windows, latency offset0 and tempo72–104 are unchanged.
- Removed the right-side beat ring. Beat tug is on the mystery fish; the yellow net pulses briefly with the existing scheduled beat click. Reduced motion suppresses the fish displacement while keeping the short colour cue. Perfect ×N appears immediately beside the reel bar, using left canvas padding only in free mode. Dalbit keeps its original56px canvas, bar geometry and player pop text.
- Exact teaching line on the first3 free reels: “Tap ◯ on the tug while the fish is in the yellow zone = Perfect!” Count is device-local with a session fallback if storage is blocked. No Player ID/Book/save API write. Later reels use the normal net-control hint.
- Free cast audio is primed on the cast gesture; unavailable audio is caught and cannot block casting. The whoosh was already synchronous on release (not a frame-delayed sound); it remains there. The free bite now has a cancellable wall-time deadline wake, aligned with the waiting phase, so it can transition and sound without a draw frame. Fractional early timer wakes re-arm; duplicate callbacks cannot repeat a cue. Stop/finish cancel it; hidden-page audio remains suppressed. The draw path can still process the same deadline first, with the same single-cue guard. A blocked JS thread/device audio buffering can still delay audible output: this is not a claim to remove hardware latency.
- Advancing physics on input can itself land a fish. The handler now returns after that completion so the same catch is never awarded again on that press or the next draw.

## Audio diagnostics / phone comparison

In `npm run dev`, each free cast logs **[free fishing audio]** at console debug level (enable verbose/debug messages). Fields: `state`, `baseLatencyMs`, `outputLatencyMs`. Values come directly from that browser's AudioContext in milliseconds; missing properties are null, not estimated. These are browser pipeline reports, not measured button-to-speaker latency, and should not be blindly added together. No actual iPhone numbers were measured in this environment.

After pulling, compare with `npm run build && npx vite preview --host`. DEV diagnostics are removed from that production build, so use dev for reported latency values and the preview for the feel comparison. This task did not change production/Preview economy configuration; ordinary local preview keeps its existing gated/practice behavior. No reset needed. Cast/beat/strike sounds remain under Sound, haptics under Vibration; iPhone timed haptics remain best-effort/unsupported through the existing web helper.

## Verification

- **319 tests pass**, zero failures/cancellations/skips, on `CHOKIDAR_USEPOLLING=1 npm test`. The first normal run hit this environment's EMFILE file-watcher limit; polling resolves that resource limitation without changing application/test semantics.
- **1,920 non-rhythm controller runs** at60/30/20fps with>=150ms delayed input, all difficulties/big/star and extreme targets pass. Additional240 selective-tap tracking cases pass with actual yellow-zone gating and the new tap rule. Drain stays **.24**; no retuning needed.
- Existing random-tap vs on-beat comparisons pass at every tempo (equal-frequency taps with the fish assumed inside, an upper bound on real random Perfects). Species selection, deck odds/version, ticket, roll verification, price, Book/stars, caps, receipts/Retry and social eligibility/room rate limits are unchanged.
- Frozen **38,400-frame Dalbit trace** passes. Existing real-session catch→Gen→Book/Retry/second-device, fallback/storage, ice, boundary and deck tests pass.
- `npx tsc -b` and `npm run build` pass, including all4 compiled Vercel API checks. `npm run test:rules`: **10/10 pass**, demo-lumen-bay emulator only. `git diff --check` passes.

Eight added tests: free falling/upward/capped taps and matching combo formula with story parity; yellow-zone gate and single-Perfect fill; delayed-event historical overlap; first3 hints/reload/blocked storage; latency diagnostic units/unavailable fields; gesture audio priming/mute/unavailable-device safety; actual free-session synchronous whoosh and bite without a draw frame; input-time catch completion awards once. Existing delayed-event real-session test now checks the bar-side Perfect pop. Existing controller tests use the real new tap/zone behavior.

Physical iPhone audio latency, small-screen text placement/readability and the revised feel remain for Teera's retest. No screenshot, human catch-success guarantee or new measured income forecast is claimed. Previous rhythm income estimates remain labelled occupancy assumptions; yellow-zone gating and changed taps are not human-calibrated. Commit/push dev-test-id, then STOP for review.
