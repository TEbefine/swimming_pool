/**
 * Haptic feedback helper with persistent vibration toggle.
 * Safe for all browsers and wrapped in try/catch.
 */

const VIBRATION_STORAGE_KEY = 'pixel_pool_vibration';

export function isVibrationEnabled(): boolean {
  try {
    const val = localStorage.getItem(VIBRATION_STORAGE_KEY);
    return val !== 'false'; // Enabled by default
  } catch {
    return true;
  }
}

export function setVibrationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VIBRATION_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors in private browsing
  }
}

export function triggerHaptic(ms: number = 10): void {
  try {
    if (!isVibrationEnabled()) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore vibration errors
  }
}
