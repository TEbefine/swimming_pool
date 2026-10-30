// Local files only: no Firebase client, credentials, remote URL or production handler.
// Stop npm run dev before resetting; restart it afterwards to pin the current window.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function resetDevFishing(root = new URL('../', import.meta.url)) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Fishing reset is local dev only.');
  // Removing the local save directory also clears every local operation log with its paid bits.
  rmSync(new URL('.dev/', root), { recursive: true, force: true });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetDevFishing();
  console.log('Local fishing policy and dev saves/logs reset together. Restart npm run dev to issue the current deck version, then reload every game tab. Your Player ID vault is untouched.');
}
