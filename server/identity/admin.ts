// Server only. Imported by api/login.ts and server/saves/admin.ts (api/items.ts); never by src/.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { LoginServices } from './handlers.js';
export function adminApp() {
  const existing = getApps().find(app => app.name === 'lumen-bay-login');
  if (existing) return existing;
  // Raw JSON remains server-side. Never print parsing errors or the service account.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || raw.length > 16384) throw new Error('Admin credentials are unavailable.');
  const account = JSON.parse(raw);
  if (account.project_id !== 'lumen-bay' || typeof account.client_email !== 'string' || typeof account.private_key !== 'string') throw new Error('Admin credentials are invalid.');
  return initializeApp({ credential: cert(account), projectId: 'lumen-bay' }, 'lumen-bay-login');
}
export const adminServices: LoginServices = {
  consumeNonce: async (id, data) => { await getFirestore(adminApp()).collection('usedNonces').doc(id).create(data); },
  mintToken: (address, claims) => getAuth(adminApp()).createCustomToken(address, claims),
  verifyToken: token => getAuth(adminApp()).verifyIdToken(token),
};
