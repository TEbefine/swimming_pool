import { needsStepUp } from './policy.ts';
export interface Session { address: string; walletSignedInAt: number }
export interface AuthUser { uid: string; idToken: string; claims: Record<string, unknown> }
export interface AuthPort {
  current: () => Promise<AuthUser | null>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}
type Post = (path: string, body: Record<string, unknown>, signal?: AbortSignal) => Promise<Record<string, unknown> | null>;
interface Dependencies { loadAuth: () => Promise<AuthPort>; post: Post; origin: () => string; now?: () => number }
export function createAuthSession({ loadAuth, post, origin, now = Date.now }: Dependencies) {
  const check = async (address: string, signal?: AbortSignal): Promise<Session | null> => {
    signal?.throwIfAborted();
    const auth = await loadAuth();
    signal?.throwIfAborted();
    const user = await auth.current();
    signal?.throwIfAborted();
    if (!user || user.uid !== address || user.claims.walletLoginOrigin !== origin() ||
      typeof user.claims.walletSignedInAt !== 'number' || needsStepUp('enter', user.claims.walletSignedInAt, now())) return null;
    const result = await post('/api/login', { idToken: user.idToken, address }, signal);
    signal?.throwIfAborted();
    if (!result || result.address !== address || typeof result.walletSignedInAt !== 'number' || needsStepUp('enter', result.walletSignedInAt, now())) return null;
    return { address, walletSignedInAt: result.walletSignedInAt };
  };
  return {
    resume: check,
    login: async (address: string, signMessage: (message: string) => Promise<`0x${string}`>, signal?: AbortSignal): Promise<Session> => {
      signal?.throwIfAborted();
      const issued = await post('/api/nonce', { address }, signal);
      signal?.throwIfAborted();
      if (!issued || typeof issued.challenge !== 'string' || typeof issued.message !== 'string') throw new Error('Online sign-in could not start. Please retry.');
      const { validateLoginMessage } = await import('./loginMessage.ts');
      validateLoginMessage(issued.message, address, origin(), now());
      const signature = await signMessage(issued.message);
      signal?.throwIfAborted();
      const response = await post('/api/login', { challenge: issued.challenge, signature }, signal);
      signal?.throwIfAborted();
      if (!response || typeof response.token !== 'string') throw new Error('Online sign-in was not accepted. Please retry.');
      // This load follows wallet unlock/signing on the first visit. No secret enters Auth.
      const auth = await loadAuth();
      signal?.throwIfAborted();
      await auth.signIn(response.token);
      signal?.throwIfAborted();
      const session = await check(address, signal);
      if (!session) { await auth.signOut(); throw new Error('Please unlock your identity to sign in again.'); }
      return session;
    },
  };
}
export const post: Post = async (path, body, signal) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, 20_000);
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body), signal: controller.signal });
    if (response.status === 401 || response.status === 403) {
      // Protected previews can reject the request before our JSON API runs.
      const isJson = /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '');
      const error: unknown = isJson ? await response.json().catch(() => null) : null;
      if (!error || typeof error !== 'object' || !('error' in error) || typeof error.error !== 'string') {
        throw new Error('This preview requires Vercel login. Open it while signed in to Vercel.');
      }
      if (response.status === 401 && body.idToken !== undefined) return null;
    }
    if (!response.ok) throw new Error(response.status === 429 ? 'Too many sign-in attempts. Please wait a minute.' : 'Online sign-in is unavailable. Please retry.');
    return await response.json();
  } catch (err) {
    if (signal?.aborted) throw err; // Lifecycle cancellation is handled by the gate's operation ticket.
    if (controller.signal.aborted) throw new Error('Online sign-in timed out. Please check your connection and retry.');
    if (err instanceof TypeError) throw new Error('Could not reach online sign-in. Please check your connection and retry.');
    throw err;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
};
export const authSession = createAuthSession({
  loadAuth: () => import('./firebaseAuth.ts').then(module => module.firebaseAuth()),
  post, origin: () => location.origin,
});
