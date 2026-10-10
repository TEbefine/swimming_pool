// Server only (api/items.ts). Firebase Admin bypasses security rules, so ALL checks live in
// handlers.ts / rules.ts; this file only reads and writes what they return.
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { adminApp } from '../identity/admin.js';
import type { SaveServices } from './handlers.js';

/** Built from getters so the emulator tests can pass a demo-project Firestore (no credentials). */
export function makeSaveServices(db: () => Firestore, auth: () => Auth): SaveServices {
  return {
    verifyToken: token => auth().verifyIdToken(token),
    readPlayer: async address => {
      const snap = await db().collection('players').doc(address).get();
      return snap.exists ? snap.data() ?? null : null;
    },
    transact: (address, operationId, fn) => {
      const store = db();
      const player = store.collection('players').doc(address);
      const log = player.collection('log').doc(operationId);
      // runTransaction may run fn again on contention; fn is pure, so that is safe.
      return store.runTransaction(async tx => {
        const [p, l] = await tx.getAll(player, log);
        const out = fn(p.exists ? p.data() ?? null : null, l.exists ? l.data() ?? null : null);
        if (out.write) {
          tx.set(player, out.write.player);
          tx.create(log, out.write.log); // append-only: a log entry is never overwritten
        }
        return out.response;
      });
    },
  };
}

export const saveServices = makeSaveServices(() => getFirestore(adminApp()), () => getAuth(adminApp()));
