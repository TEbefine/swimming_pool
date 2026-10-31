import { ECONOMY_EPOCH } from '../../src/game/economy/economyConfig.js';
import { emptyPlayer, normalizePlayer } from './rules.js';
import type { PlayerDoc } from './rules.js';
import { readVerifiedFishBook } from './fishBook.js';
const closing = new WeakMap<PlayerDoc, {reason:string;from:number;to:number;balanceBefore:number;balanceAfter:number}>();
export function epochPlayer(raw: unknown, now: number): PlayerDoc {
  const source = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
  const doc = {...source,...(raw ? normalizePlayer(raw,now) : emptyPlayer(now))} as PlayerDoc;
  doc.ownedCards = (source.ownedCards ?? doc.ownedCards) as PlayerDoc['ownedCards'];
  doc.communityMemory = (source.communityMemory ?? doc.communityMemory) as PlayerDoc['communityMemory'];
  const old = Number.isSafeInteger(source.econEpoch) ? source.econEpoch as number : 0;
  if (raw && old < ECONOMY_EPOCH) {
    const fresh = emptyPlayer(now), balance = doc.coins;
    Object.assign(doc,{coins:0,goods:[],coolerLevel:0,rodLevel:0,paidDecks:[],iceUsedAt:[],econ:fresh.econ,opWindow:fresh.opWindow,writeDay:fresh.writeDay,
      fishBook:readVerifiedFishBook(doc.fishBook).ok ? doc.fishBook : {}});
    closing.set(doc,{reason:'epoch',from:old,to:ECONOMY_EPOCH,balanceBefore:balance,balanceAfter:0});
  }
  doc.econEpoch = Math.max(old,ECONOMY_EPOCH);
  return doc;
}
export const epochClosing = (doc: PlayerDoc) => closing.get(doc);
