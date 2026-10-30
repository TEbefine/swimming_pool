// Read-only server projection. No local catch, guest or sandbox can award a Book entry.
import { FISH_BOOK_BY_ID, FISH_BOOK_KINDS } from './fishBookConfig.js';
export interface FishBookEntry { best: number; starred: boolean }
export interface FishBook { entries: Record<string, FishBookEntry>; totalKinds: number }
export const EMPTY_BOOK: FishBook = { entries: {}, totalKinds: FISH_BOOK_KINDS.length };
export function parseBookView(raw: Record<string, unknown>): { revision: number; book: FishBook } | null {
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || raw.totalKinds !== FISH_BOOK_KINDS.length
    || !raw.fishBook || typeof raw.fishBook !== 'object' || Array.isArray(raw.fishBook)) return null;
  const entries: Record<string, FishBookEntry> = {};
  const source = raw.fishBook as Record<string, unknown>;
  if (Object.keys(source).length > FISH_BOOK_KINDS.length) return null;
  for (const [id, value] of Object.entries(source)) {
    const fish = Object.hasOwn(FISH_BOOK_BY_ID, id) ? FISH_BOOK_BY_ID[id] : undefined;
    if (!fish || !value || typeof value !== 'object') return null;
    const entry = value as FishBookEntry;
    if (Object.keys(entry).length !== 2 || !Number.isInteger(entry.best) || entry.best < fish.size[0] || entry.best > fish.size[1] || typeof entry.starred !== 'boolean') return null;
    entries[id] = { best: entry.best, starred: entry.starred };
  }
  return { revision: raw.revision as number, book: { entries, totalKinds: FISH_BOOK_KINDS.length } };
}
export interface BookStorage { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
export class FishBookStore {
  private address: string | null = null;
  private revision = -1;
  private book: FishBook = EMPTY_BOOK;
  private storage: BookStorage;
  private listeners = new Set<() => void>();
  constructor(storage: BookStorage) { this.storage = storage; }
  get() { return this.book; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(fn => fn()); }
  private key(address: string) { return `sp_verified_book_v1_${address}`; }
  attach(address: string | null) {
    if (address === this.address) return;
    this.address = address; this.revision = -1; this.book = EMPTY_BOOK;
    // Discard obsolete pending data without parsing or ever uploading it. No vault/identity keys.
    for (const key of ['free_fishing_book_v1', 'free_fishing_book_test', ...(address ? [`free_fishing_pending_v1_${address}`, `free_fishing_pending_op_v1_${address}`] : [])]) {
      try { this.storage.remove(key); } catch { /* blocked storage is harmless */ }
    }
    if (address) {
      try { const raw = this.storage.get(this.key(address)); if (raw) this.receive(address, JSON.parse(raw)); } catch { /* absent/corrupt cache */ }
    }
    this.emit();
  }
  reset(address: string) {
    if (address !== this.address) return;
    try { this.storage.remove(this.key(address)); } catch { /* memory only */ }
    this.revision = -1; this.book = EMPTY_BOOK; this.emit();
  }
  receive(address: string | null, raw: Record<string, unknown>) {
    if (!address || address !== this.address) return;
    const parsed = parseBookView(raw);
    if (!parsed || parsed.revision < this.revision) return;
    this.revision = parsed.revision; this.book = parsed.book;
    try { this.storage.set(this.key(address), JSON.stringify({ revision: this.revision, fishBook: this.book.entries, totalKinds: this.book.totalKinds })); } catch { /* memory only */ }
    this.emit();
  }
}
