// Server-only: closed by default; never use this cache to authorize a money write.
export const CLOSED_TODAY = 'The shop is closed today.';
export function controlOpen(raw: unknown): boolean { return !!raw && typeof raw === 'object' && (raw as {open?:unknown}).open === true; }
export function controlCache(read: () => Promise<unknown>, now = Date.now) {
  let expires = 0, value = false, pending: Promise<boolean> | null = null;
  return async (): Promise<boolean> => {
    if (now() < expires) return value;
    if (pending) return pending;
    pending = read().then(controlOpen, () => false).then(open => { value = open; expires = now() + 60_000; return open; }).finally(() => { pending = null; });
    return pending;
  };
}
