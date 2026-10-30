# ECO-03 stage 6 step 4 — reel rhythm and final verification

Base: dev-test-id e96b8ad, pulled first (Claude's six-hour map resume retained). Teera approved step 3 and described the iPhone feel as “middle-easy”; this packet implements the subsequently approved free-only rhythm layer. Local/emulator only. No main merge or production/Preview database writes.

## Implemented feel and timing

Free reels use 72/80/88/96/104 BPM by effective difficulty (including existing big-fish difficulty). First beat follows one full interval of preview. A bounded cosine pull eases fish speed between 70% and 100% of its existing difficulty speed; speed/acceleration rails remain. Ring contracts to each beat; reduced motion uses a static-size brightness accent. Combo and Perfect feedback use existing canvas rendering, without frame-rate React updates.

Perfect window is ±min(140ms, 18% of interval): 140, 135, 122.727, 112.5, 103.846ms. Keyboard and pointer event timestamps reach fishingPress; epoch-style Safari timestamps normalize to performance.timeOrigin. Judging uses the original event time even if dispatch/render is late. Input offset is `REEL_RHYTHM.rhythmLatencyOffsetMs` in src/game/fishing/reelRhythm.ts, initially 0. Positive values subtract measured lateness from input; they do not move the audible/visible beat. Tune after a physical phone test.

Ring, judge, fish pulse and scheduler use the same performance-time origin/deadlines. A 25ms scheduling wake queues clicks 100ms ahead in Web Audio, translating deadlines with getOutputTimestamp when available (currentTime/performance.now mapping fallback). Output/device latency can still vary; this is not a measured iPhone calibration. No audio-context time is used for catch tickets. The scheduler skips overdue clicks after stalls, cancels queued clicks/haptics on stop/finish, and suppresses hidden-page feedback. SoundManager owns mute/visibility/source cleanup. Haptics reuse the Vibration toggle/helper; unsupported browsers safely do nothing. iPhone Safari timed vibration remains unsupported; sound/ring carry the cue there.

A fresh Perfect press lifts .65 versus normal .55, under the unchanged speed cap. Consecutive 2/4/6 Perfects give +10/20/30% in-net fill until the next beat; missed/off-beat inputs lose the bonus with no extra progress penalty. At most one award per beat; held keys and keyboard repeat cannot earn repeated awards. Normal hold control, .37 fill, net size and strike windows stay. Free drain is .24: all required non-rhythm sweeps pass, so no reduction was needed. Full-perfect means at least one Perfect and no off-beat/duplicate/skipped/overdue beat through the completed reel; unfinished final timing windows are not misses.

Successful reels announce only at peak streak >=6 or full-perfect. Rhythm and rare-fish text are merged into one existing sendChat call; server chat gap, room audience and transport remain unchanged. “Clean catch!” distinguishes free fishing's old never-left-net badge from rhythm Perfects; Dalbit retains its existing Perfect wording and exact state trace.

## Files and boundaries

New pure reelRhythm.ts and small rhythmFeedback.ts; freeFishingTuning.ts, story/fishing.ts, fishingSession.ts, audio.ts, FishingHud.tsx; timestamp forwarding only in App.tsx/GameBoyMobile.tsx. Tests and this packet/model/context added. No dependencies, API/wire schema, odds, deck version, ticket, sale/paid-bit, price, Book/star, cap, dev reset or resume-map code changed. No extra writes or gameplay network messages except the approved catch announcement.

## Verification

- npm test: **311 pass, zero failed/cancelled/skipped** (302 on pulled base including Claude's five resume tests, plus 9 new tests).
- npx tsc -b: exit 0.
- npm run build: exit 0; all four compiled Vercel API import/GET checks pass. Fishing lazy chunk 98.03KB / 32.65KB gzip.
- npm run test:rules: **10/10 pass**, exit 0, demo-lumen-bay only, isolated Firebase CLI config.
- git diff --check: passes.
- Existing 1,920 non-rhythm hold-controller sweeps pass at 60/30/20fps with >=150ms queued input, all difficulties/big/star and fixed/extreme/seeded targets. Motion bound checks and 38,400-frame Dalbit golden trace pass. Existing real catch → Gen → Book, ice, unavailable deck/practice, Retry and second-device tests pass.

Nine new tests:

1. Scaled timing-window edges/neighbours; strike is not a beat; one award per beat.
2. Event-time accuracy under 0/150/350ms dispatch delay, epoch normalization and latency-offset sign.
3. Random vs on-beat tapping at every tempo: 10,000 taps per row, equal one-tap-per-interval frequency. Random Perfect counts **3412/3646/3565/3556/3527**, versus **10000** on beat at every tempo. This tests random timing, not resistance to a modified client or unlimited input flooding; rhythm is never payment security.
4. Combo tiers, expiry, skipped/off-beat breaks and social >=6/full-perfect eligibility.
5. In-net-only bonus, .24 free drain and story ignoring rhythm effects.
6. Additional 240 causal tracking runs with >=150ms queued hold control and selective, timed upward rescue taps (all land). These are not a claim that blindly tapping every beat lands every trajectory: stronger upward taps can overshoot a descending fish.
7. Lookahead deadlines, no duplicate scheduling, hidden/stalled skip and stop cleanup.
8. Actual SoundManager Web Audio output-time mapping, source cancellation, mute and visibility.
9. Compiled real session: input dispatched 350ms late still produces Perfect from its original event timestamp. Existing VM fixtures only gained timeOrigin and scheduler stubs; gameplay remains real.

Early test iterations exposed an inaccurate rhythm controller (it tapped into descending fish) and an overly strict floating-point audio assertion. The final selective controller and tolerance-based clock assertion address those test assumptions. Runtime motion bounds/drain were not weakened to pass them. No universal catchability or beginner-success proof is claimed.

## Honest short-session income model

Reproduce: `node docs/ai/analysis/ECO-03-rhythm-model.mjs`. Actual shared v2 roll and real quoteFish/market; random start followed sequentially, no peeking or skipped indices. 1,000 deterministic sessions per row; gross coins, fresh day per session. Daily3000, legend2/epic10, cooler10, operation40 remain. Full JSON includes Gen sale counts and 60-minute/large-cooler/long-trip sensitivities.

This is an **occupancy approximation**, not measured human income or a full frame-level rhythm simulation. Retains original explicit casual/regular/skilled success, in-net-share, reading and 100/75/50s round-trip assumptions. Uses implemented .37 fill/.24 drain; rhythm column assumes **+18% average effective fill**, not a measured combo uptime. Controller sweeps validate finite landing coverage separately; they do not establish human timing, travel or rhythm mastery. The model's nominal timing omits individual lift impulses and beat-phase occupancy changes. These limitations matter more than small predicted income differences.

| Profile | Minutes | Normal P50 / P95 | Rhythm P50 / P95 |
|---|---:|---:|---:|
| casual | 10 | 190 / 461 | 222 / 513 |
| casual | 20 | 531 / 833 | 542 / 860 |
| casual | 30 | 813 / 1193 | 852 / 1214 |
| regular | 10 | 417 / 742 | 421 / 763 |
| regular | 20 | 933 / 1407 | 989 / 1442 |
| regular | 30 | 1332 / 1830 | 1360 / 1864 |
| skilled | 10 | 731 / 1131 | 737 / 1150 |
| skilled | 20 | 1410 / 1862 | 1464 / 1893 |
| skilled | 30 | 1839 / 2177 | 1875 / 2214 |

No sampled 10/20/30-minute session hits the 3,000 cap in either modeled style. The skilled 60-minute rhythm sensitivity has P50 2,718/P95 2,956 and 3% clipping. Keep the approved 3,000 cap; rhythm does not justify a new cap or price change. Spending still cannot refill the daily earned allowance. Multiple IDs remain outside this per-ID ceiling.

## Review limits / next action

Physical iPhone ring/audio alignment, haptic availability, comfort of the .65 kick, readable combo placement and thermal feel are **not verified here**. Test Sound off, Vibration off, reduced motion, hide/resume, normal hold play and rhythmic taps on Teera's iPhone. No browser screenshot or measured human session is claimed. No local save reset needed. Commit/push dev-test-id and STOP for review; no main merge or release.
