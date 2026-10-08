import type { Vault } from './vault.ts';
export const DATABASE_NAME = 'lumen-bay-identity';
const STORE = 'identity';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Device storage is unavailable. Enable website storage and try again.'));
    const request = indexedDB.open(DATABASE_NAME, 1);
    let settled = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onblocked = () => { settled = true; reject(new Error('Close other game tabs and try again.')); };
    request.onerror = () => reject(new Error('Device storage could not be opened. Your saved identity has not been replaced.'));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export async function readIdentity(): Promise<{ vault: Vault | null; sessionAddress: string | null }> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const vault = store.get('vault');
    const sessionAddress = store.get('firebase-session-address');
    tx.oncomplete = () => { db.close(); resolve({ vault: vault.result ?? null, sessionAddress: sessionAddress.result ?? null }); };
    tx.onabort = () => { db.close(); reject(new Error('Your saved identity could not be read. Please retry.')); };
  });
}
/** One transaction, including compare-before-write: concurrent tabs cannot overwrite each other. */
export async function saveIdentity(vault: Vault, expected: Vault | null): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let conflict = false;
    const read = store.get('vault');
    read.onsuccess = () => {
      if (JSON.stringify(read.result ?? null) !== JSON.stringify(expected)) { conflict = true; tx.abort(); return; }
      store.put(vault, 'vault');
      store.delete('local-preview-receipt');
      if (expected?.address !== vault.address) store.delete('firebase-session-address');
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => {
      db.close();
      reject(new Error(conflict ? 'Your identity changed in another tab. Reload before continuing.' : 'The identity could not be saved. Keep your written backup and retry.'));
    };
  });
}
/** Public load hint only; authentication always comes from Firebase + server verification. */
export async function markFirebaseSession(address: string, expected: Vault): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const read = store.get('vault');
    read.onsuccess = () => {
      if (JSON.stringify(read.result) !== JSON.stringify(expected) || expected.address !== address) { tx.abort(); return; }
      store.put(address, 'firebase-session-address');
      store.delete('local-preview-receipt');
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error('Your identity changed in another tab. Reload before continuing.')); };
  });
}
export async function requestPersistence(): Promise<'granted' | 'not-granted' | 'unavailable'> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unavailable';
  try { return await navigator.storage.persist() ? 'granted' : 'not-granted'; }
  catch { return 'unavailable'; }
}
