import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { bytesToHex } from 'viem';
import { validateMnemonic } from '@scure/bip39';
import { encodeCombo } from './policy.ts';
import type { ComboInput } from './policy.ts';

export const DERIVATION_PATH = "m/44'/60'/0'/0/0";
export const ITERATIONS = 600_000;
export interface WalletSecret { mnemonic: string; privateKey: string; address: string }
export interface Vault {
  version: 1;
  address: string;
  path: typeof DERIVATION_PATH;
  kdf: 'PBKDF2-SHA-256';
  iterations: typeof ITERATIONS;
  cipher: 'AES-256-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
}
const encoder = new TextEncoder();
function toBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid vault.');
  const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
  if (toBase64(bytes) !== text) throw new Error('Invalid vault.');
  return bytes;
}
export function validateVault(value: unknown): asserts value is Vault {
  if (!value || typeof value !== 'object') throw new Error('This saved identity cannot be read. Restore with your 12 words.');
  const v = value as Vault;
  if (v.version !== 1 || !/^0x[0-9a-f]{40}$/.test(v.address) || v.path !== DERIVATION_PATH ||
      v.kdf !== 'PBKDF2-SHA-256' || v.iterations !== ITERATIONS || v.cipher !== 'AES-256-GCM' ||
      typeof v.salt !== 'string' || v.salt.length !== 24 || fromBase64(v.salt).length !== 16 ||
      typeof v.iv !== 'string' || v.iv.length !== 16 || fromBase64(v.iv).length !== 12 ||
      typeof v.ciphertext !== 'string' || v.ciphertext.length > 2048 || fromBase64(v.ciphertext).length < 16) {
    throw new Error('This saved identity cannot be read. Restore with your 12 words.');
  }
}
function additionalData(v: Omit<Vault, 'ciphertext'>): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify([v.version, v.address, v.path, v.kdf, v.iterations, v.cipher, v.salt, v.iv]));
}
async function deriveKey(combo: readonly ComboInput[], salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const bytes = encodeCombo(combo);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt }, material,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}
export function restoreSecret(words: string): WalletSecret {
  const mnemonic = words.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
  if (mnemonic.split(' ').length !== 12 || mnemonic.length > 160) throw new Error('Enter all 12 recovery words in order.');
  try {
    if (!validateMnemonic(mnemonic, english)) throw new Error();
    const account = mnemonicToAccount(mnemonic, { path: DERIVATION_PATH });
    const key = account.getHdKey().privateKey;
    if (!key) throw new Error();
    const privateKey = bytesToHex(key);
    key.fill(0);
    return { mnemonic, privateKey, address: account.address.toLowerCase() };
  } catch { throw new Error('Those words do not make a valid recovery phrase. Check spelling and order.'); }
}
export function createSecret(): WalletSecret { return restoreSecret(generateMnemonic(english, 128)); }
export function backupPositions(): number[] {
  const result = new Set<number>();
  while (result.size < 3) {
    const value = crypto.getRandomValues(new Uint8Array(1))[0];
    if (value < 252) result.add(value % 12); // rejection sampling avoids modulo bias
  }
  return [...result].sort((a, b) => a - b);
}
export async function encryptVault(secret: WalletSecret, combo: readonly ComboInput[]): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header: Omit<Vault, 'ciphertext'> = { version: 1, address: secret.address, path: DERIVATION_PATH,
    kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, cipher: 'AES-256-GCM', salt: toBase64(salt), iv: toBase64(iv) };
  const plaintext = encoder.encode(JSON.stringify({ mnemonic: secret.mnemonic, privateKey: secret.privateKey }));
  try {
    const key = await deriveKey(combo, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: additionalData(header) }, key, plaintext);
    return { ...header, ciphertext: toBase64(new Uint8Array(ciphertext)) };
  } finally { plaintext.fill(0); }
}
export async function decryptVault(vault: Vault, combo: readonly ComboInput[]): Promise<{ secret: WalletSecret; elapsedMs: number }> {
  const start = performance.now();
  validateVault(vault);
  let plaintext: Uint8Array | undefined;
  try {
    const key = await deriveKey(combo, fromBase64(vault.salt));
    plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv),
      tagLength: 128, additionalData: additionalData(vault) }, key, fromBase64(vault.ciphertext)));
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    if (typeof parsed.mnemonic !== 'string' || typeof parsed.privateKey !== 'string') throw new Error();
    const secret = restoreSecret(parsed.mnemonic);
    if (secret.privateKey !== parsed.privateKey || secret.address !== vault.address) throw new Error();
    return { secret, elapsedMs: Math.round(performance.now() - start) };
  } catch { throw new Error('The code did not unlock this identity. Try again, or restore with your 12 words.'); }
  finally { plaintext?.fill(0); }
}
