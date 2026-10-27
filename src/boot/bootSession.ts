/**
 * Session time tracking and startup mode selection.
 *
 * Rules:
 * - If absent for a long time (or first open ever):
 *     Game Boy is shown as shut down ("PRESS START TO OPEN").
 *     Pressing START triggers the boot animation sequence ("SWIMMING POOL / by SAP Co.")
 *     then authored destinations show their loading story before entering the game.
 * - If reopened within 5 to 10 minutes (quick reload / return):
 *     Shows the Barista loading screen (LoadingScene) instead of the shut-down/boot animation.
 */

export const LAST_ACTIVE_KEY = 'swimming_pool.last_active_time';

/** Quick reload threshold: 10 minutes (5-10 min window). */
export const QUICK_RELOAD_WINDOW_MS = 10 * 60 * 1000;

export type StartupFlow = 'shutdown' | 'barista';

export interface StartupPlan {
  flow: StartupFlow;
  forceBoot: boolean;
  elapsedMs: number;
}

export function getStartupPlan(): StartupPlan {
  if (typeof window === 'undefined') {
    return { flow: 'shutdown', forceBoot: false, elapsedMs: Infinity };
  }

  const params = new URLSearchParams(window.location.search);
  const forceBoot = params.has('boot');
  if (forceBoot) {
    return { flow: 'shutdown', forceBoot: true, elapsedMs: Infinity };
  }

  if (params.has('barista') || params.has('loading')) {
    return { flow: 'barista', forceBoot: false, elapsedMs: 0 };
  }

  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) {
      // First open ever: shut-down screen + boot intro
      return { flow: 'shutdown', forceBoot: false, elapsedMs: Infinity };
    }

    const lastActive = parseInt(raw, 10);
    if (!Number.isFinite(lastActive) || lastActive <= 0) {
      return { flow: 'shutdown', forceBoot: false, elapsedMs: Infinity };
    }

    const elapsed = Date.now() - lastActive;
    if (elapsed < QUICK_RELOAD_WINDOW_MS) {
      // Reopened within 5-10 minutes: Barista loading screen
      return { flow: 'barista', forceBoot: false, elapsedMs: elapsed };
    }

    // Long absence: Game Boy shut-down screen + boot intro
    return { flow: 'shutdown', forceBoot: false, elapsedMs: elapsed };
  } catch {
    return { flow: 'shutdown', forceBoot: false, elapsedMs: Infinity };
  }
}

/** Record current timestamp as active gameplay time. */
export function recordActiveSession(): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {}
}
