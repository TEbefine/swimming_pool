// Client landing skill only. Never used to choose or verify a fish.
export const REEL_RHYTHM = Object.freeze({
  tempos: [72, 80, 88, 96, 104] as readonly number[],
  rhythmLatencyOffsetMs: 0, // Positive: subtract this much input/display latency before judging.
  maxWindowMs: 140, windowShare: 0.18, perfectLift: 0.65,
});
export const beatIntervalMs = (difficulty: number) => 60_000 / REEL_RHYTHM.tempos[Math.max(0, Math.min(4, difficulty - 1))];
export const perfectWindowMs = (interval: number) => Math.min(REEL_RHYTHM.maxWindowMs, interval * REEL_RHYTHM.windowShare);
export const comboFill = (streak: number) => 1 + (streak >= 6 ? .3 : streak >= 4 ? .2 : streak >= 2 ? .1 : 0);
// DOMHighResTimeStamp normally uses performance.timeOrigin; old WebKit used epoch milliseconds.
export function inputTimeMs(stamp: number, origin: number, fallback: number): number {
  return Number.isFinite(stamp) && stamp > 0 ? (stamp > 1e12 ? stamp - origin : stamp) : fallback;
}
export interface ReelRhythm {
  interval: number; streak: number; peak: number; lastBeat: number;
  perfects: number; broken: boolean; bonusUntil: number; perfectAt: number;
}
export function newRhythm(difficulty: number): ReelRhythm {
  return { interval: beatIntervalMs(difficulty), streak: 0, peak: 0, lastBeat: 0, perfects: 0, broken: false, bonusUntil: 0, perfectAt: -Infinity };
}
// Beat 1 follows one full interval of preview. A press may arrive late from the browser,
// but is judged against its original event timestamp, never the render/dispatch time.
export function rhythmPress(s: ReelRhythm, elapsedMs: number, offset = REEL_RHYTHM.rhythmLatencyOffsetMs, inNet = true): { state: ReelRhythm; perfect: boolean } {
  const t = elapsedMs - offset, beat = Math.round(t / s.interval);
  const perfect = inNet && beat >= 1 && beat > s.lastBeat && Math.abs(t - beat * s.interval) <= perfectWindowMs(s.interval);
  if (!perfect) return { state: { ...s, streak: 0, broken: true, bonusUntil: 0 }, perfect: false };
  const consecutive = beat === s.lastBeat + 1;
  const streak = consecutive ? s.streak + 1 : 1;
  return { perfect: true, state: { ...s, streak, peak: Math.max(s.peak, streak), lastBeat: beat,
    perfects: s.perfects + 1, broken: s.broken || !consecutive,
    bonusUntil: (beat + 1) * s.interval, perfectAt: elapsedMs } };
}
export function rhythmFill(s: ReelRhythm, elapsedMs: number): number {
  return elapsedMs < s.bonusUntil ? comboFill(s.streak) : 1;
}
export function rhythmCombo(s: ReelRhythm, elapsedMs: number): number {
  return elapsedMs > (s.lastBeat + 1) * s.interval + perfectWindowMs(s.interval) ? 0 : s.streak;
}
export function rhythmAnnouncement(s: ReelRhythm, elapsedMs: number): string | null {
  const completed = Math.max(0, Math.floor((elapsedMs - perfectWindowMs(s.interval)) / s.interval));
  const full = !s.broken && s.perfects > 0 && s.lastBeat >= completed;
  return s.peak >= 6 || full ? `Perfect catch ×${s.peak}!` : null;
}

/** Positions are sampled before input and after physics; interpolate late browser events. */
export interface ReelPosition { at: number; fishY: number; netY: number }
export function inNetAt(samples: readonly ReelPosition[], at: number, netSize: number): boolean {
  if (!samples.length || at < samples[0].at || at > samples[samples.length - 1].at) return false;
  const right = samples.findIndex(p => p.at >= at);
  const b = samples[right], a = samples[Math.max(0, right - 1)];
  const t = a.at === b.at ? 0 : (at - a.at) / (b.at - a.at);
  const fish = a.fishY + (b.fishY - a.fishY) * t, net = a.netY + (b.netY - a.netY) * t;
  return fish >= net && fish <= net + netSize;
}
// Device-local onboarding only; never a player save/Book write. Blocked storage is session-only.
export function nextReelHint(storage: Pick<Storage, 'getItem' | 'setItem'> | null, sessionCount: number): { show: boolean; count: number } {
  let saved = sessionCount;
  try { const n = Number(storage?.getItem('sp_free_reel_hints_v1')); if (Number.isFinite(n)) saved = Math.max(saved, Math.min(3, Math.max(0, n))); } catch { /* Private mode. */ }
  const count = Math.min(3, saved + 1);
  try { storage?.setItem('sp_free_reel_hints_v1', String(count)); } catch { /* Session fallback. */ }
  return { show: saved < 3, count };
}
