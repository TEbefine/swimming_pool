# ECO-03 stage 6 step 3 — free-only pacing

2026-10-30 · dev-test-id · Pulled before coding: fast-forwarded63a5655 to4db5f42, including Claude's32898bf Book change and newer shell/UI work. Those incoming files remain unchanged by this step.

Built an immutable free-only profile, explicitly enabled by the free session and snapshotted at cast start. Wait min1.98/spread3.15 (Nice×0.6, floor1.4), fill0.37, unchanged drain0.22/strike/gauge/net controls/species-star1.15. Fish speed≤min(existing difficulty speed,0.65), acceleration≤1.0, target hold≥0.75s, continuous velocity with braking toward targets. No additional animation loops or runtime dependencies. Local practice/fallback tables now use the frozen v2 tier weights; practice still cannot sell or enter the Book.

Story/default casts ignore the opt-in and retain existing TUNING, RNG consumption and state behavior. Tickets, frozen v1/v2 kernels, verified fish/size/baseDiff/big, sale validation,3,000 daily cap,2m balance bound, Book, ice and Bag behavior are unchanged. No cutover/reachability solver/rewards/town/release work.

Validation: **297 unit/integration tests pass, zero failed/cancelled/skipped** (293+4). TypeScript and production build/four compiled Vercel API smoke checks pass. **10/10 Firestore emulator tests pass**, clean exit with isolated CLI settings, demo project only. Existing real-session Nice-edge, catch→Gen→Book/Retry/second-device and practice/storage/ice tests pass with the new free profile.

Four added tests in tests/free-pacing.test.mjs:

- Profile snapshot/immutability, faster wait, story ignores opt-in, unchanged story reel example and gauge/strike/star values.
- Thirty-second extreme-target trajectories at60/30/20fps across difficulties1–5 check speed, per-frame acceleration, rails and target-hold bounds.
- **1,920 controller runs**:60/30/20fps × difficulties1–5 × big on/off × star on/off ×32 random streams (including fixed extreme and alternating targets). Every run catches with input delayed by at least150ms (frame-quantized). Controller observes fish position/velocity and its own queued controls, predicts the net under those controls, and uses hold/release; it has no future target/RNG access. The initial delay-unaware controller failed some runs; accounting for its own pending input queue passes at the approved motion bounds without weakening those bounds.
- **38,400-frame story trace**:64 seeded casts ×600 frames, first-catch variants, three frame steps, taps/holds and phase changes. SHA-256 matches the pre-step-3 kernel generated from4db5f42: ed2d79db6cea6d2595a9327cb05a31fdeb090910705ff0defeda8a80f5863731.

This is finite automated coverage, not a formal all-trajectory guarantee or human success-rate measurement. **Teera's iPhone test is pending**: comfortable strike/reel, modest faster feel, practice fallback, catch→Gen→Book and the new Book ✕ close behavior. No physical-phone/browser UI test is claimed this turn. No shared-database/Preview writes, local save reset, remote settings change or main merge. No reset is needed to test this step after pulling (the existing v2 dataset stays valid).

Step4's short-session income model/calibration remains unstarted. Commit/push dev-test-id, then STOP for review and Teera's phone feedback.
