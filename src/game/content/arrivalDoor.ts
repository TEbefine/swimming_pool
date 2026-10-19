// Arrival Hall door rule: a first-timer checks in at the counter (talks to Fah or Tawan) before Phu
// lets them out through the glass doors. Remembered on this device (localStorage); if storage is
// blocked (private mode), it's remembered for this session only — never a hard lock.

const KEY = 'lumenbay.arrival.checkedIn';

/** Talking to any of these counts as checking in. */
export const CHECK_IN_NPCS = new Set(['fah', 'tawan']);

let memo: boolean | null = null;

export function hasCheckedIn(): boolean {
  if (memo !== null) return memo;
  try {
    memo = localStorage.getItem(KEY) === '1';
  } catch {
    memo = false;
  }
  return memo;
}

export function markCheckedIn(): void {
  memo = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // storage blocked: the in-memory flag still lets them out this session
  }
}
