/** Keep rendering independent of 60/90/120/144 Hz displays. Simulation uses elapsed time. */
export class FrameBudget {
  private nextFrame = 0;
  private previousFrame = 0;

  reset(now: number) {
    this.nextFrame = now;
    this.previousFrame = now;
  }

  /** null means skip drawing. Late frames never create a catch-up rendering burst. */
  advance(now: number, fps: number): number | null {
    if (now + 0.5 < this.nextFrame) return null;
    const interval = 1000 / fps;
    const dt = Math.min(0.1, Math.max(0, (now - this.previousFrame) / 1000));
    this.previousFrame = now;
    this.nextFrame += interval;
    if (this.nextFrame <= now) this.nextFrame = now + interval;
    return dt;
  }
}

export const LOW_POWER_QUERY = '(pointer: coarse), (max-width: 767px), (prefers-reduced-motion: reduce)';

/** Phones and constrained devices get a sustainable default, regardless of screen width. */
export function prefersLowPower(): boolean {
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return window.matchMedia(LOW_POWER_QUERY).matches ||
    !!device.connection?.saveData ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 4);
}
