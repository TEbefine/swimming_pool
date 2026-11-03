// Firestore (Admin SDK, bypasses rules) for /api/ai-news. Production and test data never mix:
// production → aiNews/* + aiNewsMeta/seen, everything else → aiNewsTest/* + aiNewsMeta/seenTest.
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '../identity/admin.js';
import type { NewsStore, SeenEntry } from './handler.js';

export function newsStore(production: boolean): NewsStore {
  const collection = production ? 'aiNews' : 'aiNewsTest';
  const seenId = production ? 'seen' : 'seenTest';
  return {
    async readSeen() {
      const snap = await getFirestore(adminApp()).collection('aiNewsMeta').doc(seenId).get();
      const items = snap.exists ? snap.get('items') : [];
      return Array.isArray(items) ? items.filter((s): s is SeenEntry => typeof s?.u === 'string' && typeof s?.d === 'string') : [];
    },
    async write(doc, seen) {
      const db = getFirestore(adminApp());
      const batch = db.batch();
      batch.set(db.collection(collection).doc('today'), doc);
      batch.set(db.collection(collection).doc(doc.date), doc);
      batch.set(db.collection('aiNewsMeta').doc(seenId), { items: seen, updatedAt: doc.generatedAt });
      await batch.commit();
    },
  };
}
