// Planning-only experiment. This file does not change any application configuration.
import { createHash, createHmac } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
const ROOT = new URL('../../../', import.meta.url).pathname;
await import(ROOT + 'tests/register-api-ts.mjs');
registerHooks({ resolve(s,c,next) { if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return next(u.href,c);}return next(s,c); } });
const { DECK_SPECIES_V1: SPECIES, DECK_TIERS_V1: TIERS, DECK_RULES_V1: R } = await import(ROOT+'src/game/fishing/deckRollV1.ts');
const { rollDeckCatch, canonicalDeckCast, deckContextAt } = await import(ROOT+'src/game/fishing/deckRoll.ts');
const { FREE_BY_ID } = await import(ROOT+'src/game/fishing/freeFishCatalog.ts');
const { marketOf, quoteFish, isSellableFish, bkkDay } = await import(ROOT+'src/game/economy/market.ts');
const { SELL, FRESH } = await import(ROOT+'src/game/economy/economyConfig.ts');
const { TUNING } = await import(ROOT+'src/game/story/fishing.ts');
const SECRET='planning-only-not-a-live-deck-secret-20261030';
const WINDOWS=21600000, CASTS=8192;
function rng(key){let state=0x811c9dc5;for(let i=0;i<key.length;i++)state=Math.imul(state^key.charCodeAt(i),0x01000193)>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const addr = key => '0x'+createHash('sha256').update(key).digest('hex').slice(0,40);
const seed = (owner,version,id) => createHmac('sha256',SECRET).update(JSON.stringify(['lumen-bay/fishing-deck',version,owner,id])).digest('hex');
const MODES=[{name:'weak-near',distance:.05,nice:false},{name:'normal-near',distance:.2,nice:false},{name:'normal-mid',distance:.5,nice:false},{name:'normal-far',distance:.98,nice:false},{name:'Nice-far',distance:.85,nice:true}];
function roller(version,at,info){return(seedValue,index)=>rollDeckCatch({version,seed:seedValue,castIndex:index,castInfo:info,castAt:at});}
const DAY=Date.UTC(2026,9,30,5),NIGHT=Date.UTC(2026,9,30,15);

const PROFILES={
 casual:{quality:[.05,.2,.25,.35,.15],success:[.96,.90,.80,.65,.50],inNet:.65,readSeconds:4,extraSeconds:3,travelSeconds:100,activeMinutes:30},
 regular:{quality:[.02,.13,.2,.3,.35],success:[.99,.96,.90,.82,.72],inNet:.75,readSeconds:2.5,extraSeconds:1.5,travelSeconds:75,activeMinutes:30},
 skilled:{quality:[0,.08,.12,.2,.6],success:[.995,.99,.97,.93,.88],inNet:.85,readSeconds:1.5,extraSeconds:.8,travelSeconds:50,activeMinutes:30},
};
function choose(r,weights){let x=r();for(let i=0;i<weights.length;i++){x-=weights[i];if(x<0)return i;}return weights.length-1;}
function percentile(arr,p){const a=[...arr].sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)];}
function runSession({version,profile,minutes,person,capacity=10,tripMultiplier=1,cap=Infinity,perfectCatch=false,allNice=false,rhythm=false}){
 const P=PROFILES[profile],r=rng(`honest/20261030/${person}`),owner=addr(`honest/${person}`);let now=Date.UTC(2026,9,1+(person%28),(person%2)&&minutes<120?15:5);const start=now,end=start+minutes*60000,market=marketOf(start),soldToday={},tierSold={common:0,rare:0,epic:0,legend:0,god:0};
 let index=Math.floor(r()*CASTS),deckId=Math.floor(now/WINDOWS),draws=0,deckSeed=seed(owner,version,deckId),cooler=[],earned=0,caught=0,attempted=0,paid=0,keptTier=0,spoiled=0,ops=0,opsBudget=40,capHit=false;
 function sell(final=false){if(!cooler.length)return true;const trip=P.travelSeconds*tripMultiplier*(final?.5:1);if(now+trip*1000>end)return false;now+=trip*1000;if(ops>=opsBudget)return false;let any=false;for(const c of cooler){const f=FREE_BY_ID[c.fish],limit=f.tier==='legend'?2:f.tier==='epic'?10:Infinity;if(tierSold[f.tier]>=limit){keptTier++;continue;}const q=quoteFish({fishId:c.fish,sizeCm:c.sizeCm,caughtAt:c.caughtAt,icedMin:0},now,market,soldToday[c.fish]??0);if(!q){spoiled++;continue;}if(earned+q.price>cap){capHit=true;continue;}earned+=q.price;paid++;any=true;soldToday[c.fish]=(soldToday[c.fish]??0)+1;tierSold[f.tier]++;}if(any)ops++;cooler=[];return true;}
 while(now<end&&ops<opsBudget){if(cooler.length>=capacity&&!sell())break;
  const info=MODES[allNice?4:choose(r,P.quality)],id=Math.floor(now/WINDOWS);if(id!==deckId){deckId=id;deckSeed=seed(owner,version,id);index=Math.floor(r()*CASTS);draws=0;}if(draws>=CASTS)break;const c=roller(version,Math.round(now),info)(deckSeed,index),d=Math.min(5,c.baseDiff+(c.big?1:0));index=(index+1)%CASTS;draws++;attempted++;
  const successDraw=r();const win=perfectCatch||successDraw<P.success[d-1];const waitScale=version===2?.9:1,wait=Math.max(1.4,(TUNING.waitMin*waitScale+r()*TUNING.waitSpread*waitScale)*(info.nice?TUNING.niceWait:1));
  const q=Math.max(.4,P.inNet-.015*(d-1)),fill=version===2?.37*(rhythm?1.18:1):TUNING.fillRate,drain=version===2?.24:TUNING.drainRate,reel=(1-TUNING.progressStart)/(q*fill-(1-q)*drain)+.7;
  const reaction=.28;const aim=TUNING.chargeSweepMs/1000*info.distance,flight=.07+.340+info.distance*.320;
  const elapsed=aim+flight+wait+reaction+reel+P.readSeconds+P.extraSeconds;if(now+elapsed*1000>end)break;now+=elapsed*1000;
  if(win){caught++;if(isSellableFish(FREE_BY_ID[c.fish])){cooler.push({...c,caughtAt:now});}}
  // Planning approximation: failed attempts use the same duration as successful attempts.
  // Honest player never peeks/skips deck indices. A valid tier-capped catch is released after Gen refuses it.
 }
 sell(true);
 return{earned,paid,caught,attempted,ops,keptTier,spoiled,capHit,activeMinutes:minutes,capacity};
}

const rows=[];const n=1000;
for(const rhythm of [false,true])for(const profile of Object.keys(PROFILES))for(const minutes of [10,20,30,60]){
 const results=Array.from({length:n},(_,person)=>runSession({version:2,profile,minutes,person,cap:3000,rhythm}));
 const a=results.map(r=>r.earned);
 rows.push({rhythm,profile,minutes,n,mean:a.reduce((a,b)=>a+b,0)/n,p50:percentile(a,.5),p95:percentile(a,.95),capHitPercent:100*results.filter(r=>r.capHit).length/n,genTripsMean:results.reduce((a,b)=>a+b.ops,0)/n});
}
const sensitivities=[];
for(const args of [{profile:'regular',minutes:60,capacity:20},{profile:'skilled',minutes:60,capacity:20},{profile:'regular',minutes:30,tripMultiplier:2},{profile:'skilled',minutes:120}])for(const rhythm of [false,true]){
 const results=Array.from({length:n},(_,person)=>runSession({version:2,person,cap:3000,rhythm,...args})),a=results.map(r=>r.earned);
 sensitivities.push({...args,rhythm,p50:percentile(a,.5),p95:percentile(a,.95),capHitPercent:100*results.filter(r=>r.capHit).length/n});
}
writeFileSync(new URL('./ECO-03-rhythm-model-results.json',import.meta.url),JSON.stringify({base:'e96b8ad',n,profiles:PROFILES,rows,sensitivities,assumptions:{roll:'actual shared v2 kernel; honest sequential indices, random start; no peeking/skipping',reel:'Average occupancy approximation, NOT measured humans. Same q/success assumptions as original plan; current fill .37/drain .24. Rhythm effective fill +18% is an explicit assumed time-average, not measured combo uptime. Reel estimate adds .7s settling overhead. Controller sweeps separately validate finite catchability; their skilled tracking is not a human timing forecast.',trips:'Assumed 100/75/50 seconds round trip casual/regular/skilled. genTripsMean counts successful sale operations, excluding all-kept trips.',caps:'3000/day, legend2, epic10,40 successful ops; one fresh day per session, no ice or shopping. Gross fishing coins, not net income.',limitations:'No human telemetry, true phone travel/reaction/beat accuracy unknown. Does not model time-varying impulses, audio output latency or a player deliberately waiting for more combo.'}},null,2));
console.log(JSON.stringify(rows));
