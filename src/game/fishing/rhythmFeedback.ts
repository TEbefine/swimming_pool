import { sound } from '../audio';
import { triggerHaptic } from '../haptics';
// Scheduling is independent of render FPS; judge/ring/clicks share performance-time beat deadlines.
export function startRhythmFeedback(epoch: number, interval: number): () => void {
  let next = 1;
  const pending = new Map<number, { stop: () => void; haptic: ReturnType<typeof setTimeout> }>();
  const tick = () => {
    const now = performance.now();
    for (const [beat, event] of pending) if (epoch + beat * interval + 100 < now) { clearTimeout(event.haptic); pending.delete(beat); }
    if (document.hidden) {
      for (const event of pending.values()) { event.stop(); clearTimeout(event.haptic); }
      pending.clear(); next = Math.max(next, Math.floor((now - epoch) / interval) + 1); return;
    }
    // Skip missed deadlines after a stall; never play a burst of overdue clicks.
    next = Math.max(next, Math.ceil((now - epoch) / interval));
    while (epoch + next * interval <= now + 100) {
      const at = epoch + next * interval;
      const stop = sound.rhythmClick(at);
      const haptic = setTimeout(() => { if (!document.hidden) triggerHaptic(8); }, Math.max(0, at - performance.now()));
      pending.set(next++, { stop, haptic });
    }
  };
  tick(); const timer = setInterval(tick, 25);
  return () => { clearInterval(timer); for (const event of pending.values()) { event.stop(); clearTimeout(event.haptic); } pending.clear(); };
}
