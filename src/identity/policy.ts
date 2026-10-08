export const COMBO_LENGTH = 7;
export const COMBO_INPUTS = ['up', 'down', 'left', 'right', 'triangle', 'circle', 'cross', 'square'] as const;
export type ComboInput = typeof COMBO_INPUTS[number];
export const WALLET_SESSION_MS = 48 * 60 * 60 * 1000;
export const KEY_INPUTS: Readonly<Record<string, ComboInput>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyT: 'triangle', KeyO: 'circle', KeyX: 'cross', KeyQ: 'square',
};

export function encodeCombo(inputs: readonly ComboInput[]): Uint8Array<ArrayBuffer> {
  if (inputs.length !== COMBO_LENGTH || inputs.some(input => !COMBO_INPUTS.includes(input))) {
    throw new Error('Use exactly seven controller presses.');
  }
  // Stable v1 encoding; never log this byte array or store a fast hash of it.
  return new Uint8Array(inputs.map(input => COMBO_INPUTS.indexOf(input)));
}

export function needsStepUp(reason: 'enter' | 'reveal' | 'change' | 'trade' | 'sell', signedInAt: number | null, now = Date.now()): boolean {
  return reason !== 'enter' || !Number.isFinite(signedInAt) || signedInAt === null || signedInAt > now || now - signedInAt >= WALLET_SESSION_MS;
}

/** A press is cardinal, never diagonal. Centre/dead-zone taps do not count. */
export function directionForPress(dx: number, dy: number): ComboInput | null {
  if (Math.hypot(dx, dy) < 12) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
