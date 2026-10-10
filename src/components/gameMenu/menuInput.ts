// ONE place that turns raw input into MenuInput. Nothing else in the menu listens to the
// keyboard or the D-pad.
//
//  · keyboard: the same keys the old START menu and Bag used (arrows/WASD, Enter/Z/E/O, X/Esc,
//    M/P/` for START, B for the Bag). The App's single key handler calls menuInputFromKey().
//  · Game Boy D-pad: it reports its position on every touch move, so a finger resting on "down"
//    arrives as dozens of identical events. DpadAdapter turns that into ONE step per press, then
//    a steady repeat while held (like a real handheld).

import type { MenuInput } from './menuModel';

export const DIRECTIONS: readonly MenuInput[] = ['up', 'down', 'left', 'right'];
export const isDirection = (i: MenuInput) => DIRECTIONS.includes(i);

interface KeyLike {
  code: string;
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export function menuInputFromKey(e: KeyLike): MenuInput | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null; // leave browser shortcuts alone
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Enter': case 'NumpadEnter': case 'KeyZ': case 'KeyE': case 'KeyO': return 'confirm';
    case 'KeyX': case 'Escape': return 'back';
    case 'KeyM': case 'KeyP': case 'Backquote': return 'start';
    case 'KeyB': return 'bag';
  }
  return null;
}

/** Held arrow keys repeat; the OS repeats far too fast for a menu, so only every ~90 ms counts. */
export const KEY_REPEAT_MS = 90;

export class KeyGate {
  private last = 0;
  /** True if this key event should move the menu. `now` is injectable for tests. */
  accept(input: MenuInput, repeat: boolean, now: number): boolean {
    if (!repeat) { this.last = now; return true; }
    if (!isDirection(input)) return false; // held ◯/✕/START never re-fire
    if (now - this.last < KEY_REPEAT_MS) return false;
    this.last = now;
    return true;
  }
}

export const DPAD_REPEAT_DELAY_MS = 380;
export const DPAD_REPEAT_EVERY_MS = 110;

/** Resolve the D-pad's (dx, dy) to one direction. Diagonals count as vertical: most lists scroll. */
export function directionFromDpad(dx: number, dy: number): MenuInput | null {
  if (Math.abs(dy) > 0.4) return dy < 0 ? 'up' : 'down';
  if (Math.abs(dx) > 0.4) return dx < 0 ? 'left' : 'right';
  return null;
}

export class DpadAdapter {
  private held: MenuInput | null = null;
  private delay: ReturnType<typeof setTimeout> | null = null;
  private every: ReturnType<typeof setInterval> | null = null;
  private readonly press: (input: MenuInput) => void;

  constructor(press: (input: MenuInput) => void) {
    this.press = press;
  }

  /** Call with every D-pad event, including the (0, 0) release. */
  feed(dx: number, dy: number) {
    const dir = directionFromDpad(dx, dy);
    if (dir === this.held) return; // same direction still held: nothing new
    this.stopTimers();
    this.held = dir;
    if (!dir) return;
    this.press(dir);
    this.delay = setTimeout(() => {
      this.every = setInterval(() => this.press(dir), DPAD_REPEAT_EVERY_MS);
    }, DPAD_REPEAT_DELAY_MS);
  }

  /** Forget everything (the menu closed while a finger was down). */
  reset() {
    this.held = null;
    this.stopTimers();
  }

  private stopTimers() {
    if (this.delay) clearTimeout(this.delay);
    if (this.every) clearInterval(this.every);
    this.delay = null;
    this.every = null;
  }
}
