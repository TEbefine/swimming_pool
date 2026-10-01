/** Quality tiers. The art never changes: tiers only decide how often the screen is redrawn and how
 *  many tiny ambient specks (sparkles, petals, stars) are drawn.
 *
 *  'auto' starts at the device's default and steps DOWN by itself when the phone starts to
 *  throttle (the same frame suddenly takes much longer to compute = the chip is hot and slowed).
 *  It never steps back up on its own, so it can't oscillate; the player can always choose. */
import { prefersLowPower } from './frameBudget';

export type QualityTier = 'beautiful' | 'balanced' | 'battery';
export type QualityMode = 'auto' | QualityTier;

export interface TierBudget {
  /** Rendered frames/sec while something moves */
  active: number;
  /** After 4 s with nothing moving */
  idle: number;
  /** After 45 s without any input */
  deep: number;
  /** 0..1 share of ambient specks drawn */
  ambient: number;
}

export const TIERS: Record<QualityTier, TierBudget> = {
  beautiful: { active: 60, idle: 30, deep: 20, ambient: 1 },
  balanced: { active: 30, idle: 15, deep: 10, ambient: 1 },
  battery: { active: 24, idle: 10, deep: 6, ambient: 0.5 },
};

export const TIER_LABEL: Record<QualityMode, string> = {
  auto: 'Auto',
  beautiful: 'Beautiful',
  balanced: 'Balanced',
  battery: 'Battery',
};

const ORDER: QualityTier[] = ['beautiful', 'balanced', 'battery'];
const STORAGE_KEY = 'pixel_pool_quality';

export function deviceDefaultTier(): QualityTier {
  if (typeof window === 'undefined') return 'beautiful';
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2)) {
    return 'battery';
  }
  return prefersLowPower() ? 'balanced' : 'beautiful';
}

type Listener = () => void;

class QualityStore {
  private mode: QualityMode = 'auto';
  /** Tier chosen by 'auto' (starts at device default, may step down) */
  private autoTier: QualityTier = 'beautiful';
  private listeners = new Set<Listener>();
  private snapshot = { mode: 'auto' as QualityMode, tier: 'beautiful' as QualityTier, stepped: false };

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as QualityMode | null;
      if (saved && (saved === 'auto' || saved in TIERS)) this.mode = saved;
    } catch { /* private mode */ }
    this.autoTier = deviceDefaultTier();
    this.refresh(false);
  }

  get tier(): QualityTier { return this.snapshot.tier; }
  get budget(): TierBudget { return TIERS[this.snapshot.tier]; }
  getSnapshot = () => this.snapshot;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  setMode(mode: QualityMode) {
    this.mode = mode;
    if (mode === 'auto') this.autoTier = deviceDefaultTier();
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* optional */ }
    this.refresh(false);
  }

  cycleMode() {
    const modes: QualityMode[] = ['auto', 'beautiful', 'balanced', 'battery'];
    this.setMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]);
  }

  /** Called by the throttle watcher. Only acts in auto mode. Returns true if it stepped. */
  stepDown(): boolean {
    if (this.mode !== 'auto') return false;
    const i = ORDER.indexOf(this.autoTier);
    if (i >= ORDER.length - 1) return false;
    this.autoTier = ORDER[i + 1];
    this.refresh(true);
    return true;
  }

  private refresh(stepped: boolean) {
    const tier = this.mode === 'auto' ? this.autoTier : this.mode;
    this.snapshot = { mode: this.mode, tier, stepped: stepped || (this.snapshot.stepped && this.mode === 'auto') };
    this.listeners.forEach((fn) => fn());
  }
}

export const quality = new QualityStore();

/** Detects sustained slow-down (thermal throttling, or a device that can't keep up).
 *  Feed it the CPU time of each rendered frame and the time between rendered frames. */
export class ThrottleWatch {
  private windowStart = 0;
  private workSum = 0;
  private frames = 0;
  private late = 0;
  private baseline = Infinity;
  private badWindows = 0;
  private windows = 0;

  private readonly windowMs: number;
  private readonly needBad: number;

  constructor(windowMs = 5000, needBad = 3) {
    this.windowMs = windowMs;
    this.needBad = needBad;
  }

  /** Forget the baseline (room changed, tier changed: frames now cost something different). */
  reset(now: number) {
    this.windowStart = now;
    this.workSum = 0;
    this.frames = 0;
    this.late = 0;
    this.baseline = Infinity;
    this.badWindows = 0;
    this.windows = 0;
  }

  /** Returns true when the device has been struggling for `needBad` windows in a row. */
  sample(now: number, workMs: number, intervalMs: number, budgetMs: number): boolean {
    if (this.windowStart === 0) this.windowStart = now;
    this.workSum += workMs;
    this.frames++;
    if (intervalMs > budgetMs * 1.6) this.late++;
    if (now - this.windowStart < this.windowMs) return false;

    const avg = this.workSum / Math.max(1, this.frames);
    const lateShare = this.late / Math.max(1, this.frames);
    this.windows++;
    // First two windows only establish what "normal" costs here.
    if (this.windows <= 2 || avg < this.baseline) this.baseline = Math.min(this.baseline, avg);
    const slower = this.windows > 2 && avg > this.baseline * 1.8 && avg > budgetMs * 0.3;
    const missing = this.frames >= 10 && lateShare > 0.35;
    this.badWindows = slower || missing ? this.badWindows + 1 : 0;

    this.windowStart = now;
    this.workSum = 0;
    this.frames = 0;
    this.late = 0;
    if (this.badWindows >= this.needBad) {
      this.badWindows = 0;
      return true;
    }
    return false;
  }

  get baselineMs() { return this.baseline; }
}
