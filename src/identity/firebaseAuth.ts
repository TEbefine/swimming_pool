// Only dynamically imported after first unlock, or to restore an existing Firebase session.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import type { AuthPort } from './authSession.ts';
let port: AuthPort | undefined;
export function firebaseAuth(): AuthPort {
  if (port) return port;
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (Object.values(config).some(value => typeof value !== 'string' || !value) || config.projectId !== 'lumen-bay') throw new Error('Online sign-in is not configured for this preview yet.');
  const app = getApps().some(app => app.name === 'lumen-bay') ? getApp('lumen-bay') : initializeApp(config, 'lumen-bay');
  const auth = initializeAuth(app, { persistence: browserLocalPersistence });
  port = {
    current: async () => {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) return null;
      const result = await user.getIdTokenResult();
      return { uid: user.uid, idToken: result.token, claims: result.claims };
    },
    signIn: async token => { await signInWithCustomToken(auth, token); },
    signOut: () => signOut(auth),
  };
  return port;
}
