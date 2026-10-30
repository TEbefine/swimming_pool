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
const rollerCache=new Map();
function roller(version,at,info){const ctx=deckContextAt(at),cast=canonicalDeckCast(info),key=[version,ctx.day,ctx.season,cast.zone,cast.quality].join(':');if(rollerCache.has(key))return rollerCache.get(key);
 const open=SPECIES.filter(f=>(!f.time||(f.time==='day')===ctx.day)&&(!f.season||f.season===ctx.season));
 const habitat=f=>f.where==='any'?R.habitatAny:f.where===cast.zone?R.habitatMatch:R.habitatMiss;
 const tiers=TIERS.filter(t=>open.some(f=>f.tier===t.id)).map(t=>({...t,weight:version===2&&t.id==='legend'?.9:t.weight}));
 const pools=tiers.map(t=>{const p=open.filter(f=>f.tier===t.id);return{fish:p,weights:p.map(habitat),total:p.reduce((n,f)=>n+habitat(f),0)};});
 const weights=tiers.map((t,i)=>t.weight*(cast.quality==='nice'?t.nice:cast.quality==='weak'?t.weak:1)*(i===tiers.length-1?1:Math.max(R.minTierFit,Math.max(...pools[i].weights)/R.habitatMatch)));
 const total=weights.reduce((n,w)=>n+w,0);
 const pick=(r,w,total)=>{let x=r()*total;for(let i=0;i<w.length;i++){x-=w[i];if(x<=0)return i;}return w.length-1;};
 const fn=(seedValue,index)=>{const r=rng(`lumen-bay/fishing-roll/v${version}:${seedValue}:${index}`),ti=pick(r,weights,total),pool=pools[ti],fish=pool.fish[pick(r,pool.weights,pool.total)];let sizeCm=null;if(fish.size){const match=fish.where==='any'||fish.where===cast.zone,pull=(cast.quality==='nice'?R.niceSizePull:1)*(match?R.matchingSizePull:R.otherSizePull),u=1-Math.pow(1-r(),pull);sizeCm=Math.round(fish.size[0]+(fish.size[1]-fish.size[0])*u);}return{fish:fish.id,sizeCm,baseDiff:fish.difficulty,big:!!fish.size&&sizeCm!==null&&sizeCm>=fish.size[0]+(fish.size[1]-fish.size[0])*R.bigShare};};
 fn.probabilities=Object.fromEntries(tiers.map((t,i)=>[t.id,weights[i]/total]));rollerCache.set(key,fn);return fn;
}
const DAY=Date.UTC(2026,9,30,5),NIGHT=Date.UTC(2026,9,30,15);
let parity=0;for(let i=0;i<100000;i++){const at=i%2?DAY:NIGHT,info=MODES[i%MODES.length],owner=addr('parity/'+Math.floor(i/CASTS)),s=seed(owner,1,Math.floor(at/WINDOWS)),index=i%CASTS,a=roller(1,at,info)(s,index),b=rollDeckCatch({version:1,seed:s,castIndex:index,castInfo:info,castAt:at});if(JSON.stringify(a)!==JSON.stringify(b))throw Error('v1 model parity '+i);parity++;}
const odds=[];
for(const version of [1,2])for(const [context,at]of [['day',DAY],['night',NIGHT]])for(const info of MODES){const counts={common:0,rare:0,epic:0,legend:0,god:0},roll=roller(version,at,info);let sellableLegend=0,nonSellable=0;let block=-1,s;for(let i=0;i<100000;i++){if(Math.floor(i/CASTS)!==block){block=Math.floor(i/CASTS);s=seed(addr('odds/'+block),version,Math.floor(at/WINDOWS));}const c=roll(s,i%CASTS),f=FREE_BY_ID[c.fish];counts[f.tier]++;if(!isSellableFish(f))nonSellable++;else if(f.tier==='legend')sellableLegend++;}odds.push({version,context,mode:info.name,n:100000,counts,sellableLegend,nonSellable,analytic:roll.probabilities});}
console.log('ODDS',JSON.stringify(odds));
const PROFILES={
 casual:{quality:[.05,.2,.25,.35,.15],success:[.96,.90,.80,.65,.50],inNet:.65,readSeconds:4,extraSeconds:3,travelSeconds:100,activeMinutes:30},
 regular:{quality:[.02,.13,.2,.3,.35],success:[.99,.96,.90,.82,.72],inNet:.75,readSeconds:2.5,extraSeconds:1.5,travelSeconds:75,activeMinutes:30},
 skilled:{quality:[0,.08,.12,.2,.6],success:[.995,.99,.97,.93,.88],inNet:.85,readSeconds:1.5,extraSeconds:.8,travelSeconds:50,activeMinutes:30},
};
function choose(r,weights){let x=r();for(let i=0;i<weights.length;i++){x-=weights[i];if(x<0)return i;}return weights.length-1;}
function percentile(arr,p){const a=[...arr].sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)];}
function runSession({version,profile,minutes,person,capacity=10,tripMultiplier=1,cap=Infinity,perfectCatch=false,allNice=false}){
 const P=PROFILES[profile],r=rng(`honest/20261030/${person}`),owner=addr(`honest/${person}`);let now=Date.UTC(2026,9,1+(person%28),(person%2)&&minutes<120?15:5);const start=now,end=start+minutes*60000,market=marketOf(start),soldToday={},tierSold={common:0,rare:0,epic:0,legend:0,god:0};
 let index=Math.floor(r()*CASTS),deckId=Math.floor(now/WINDOWS),draws=0,deckSeed=seed(owner,version,deckId),cooler=[],earned=0,caught=0,attempted=0,paid=0,keptTier=0,spoiled=0,ops=0,opsBudget=40,capHit=false;
 function sell(final=false){if(!cooler.length)return true;const trip=P.travelSeconds*tripMultiplier*(final?.5:1);if(now+trip*1000>end)return false;now+=trip*1000;if(ops>=opsBudget)return false;let any=false;for(const c of cooler){const f=FREE_BY_ID[c.fish],limit=f.tier==='legend'?2:f.tier==='epic'?10:Infinity;if(tierSold[f.tier]>=limit){keptTier++;continue;}const q=quoteFish({fishId:c.fish,sizeCm:c.sizeCm,caughtAt:c.caughtAt,icedMin:0},now,market,soldToday[c.fish]??0);if(!q){spoiled++;continue;}if(earned+q.price>cap){capHit=true;continue;}earned+=q.price;paid++;any=true;soldToday[c.fish]=(soldToday[c.fish]??0)+1;tierSold[f.tier]++;}if(any)ops++;cooler=[];return true;}
 while(now<end&&ops<opsBudget){if(cooler.length>=capacity&&!sell())break;
  const info=MODES[allNice?4:choose(r,P.quality)],id=Math.floor(now/WINDOWS);if(id!==deckId){deckId=id;deckSeed=seed(owner,version,id);index=Math.floor(r()*CASTS);draws=0;}if(draws>=CASTS)break;const c=roller(version,Math.round(now),info)(deckSeed,index),d=Math.min(5,c.baseDiff+(c.big?1:0));index=(index+1)%CASTS;draws++;attempted++;
  const successDraw=r();const win=perfectCatch||successDraw<P.success[d-1];const waitScale=version===2?.9:1,wait=Math.max(1.4,(TUNING.waitMin*waitScale+r()*TUNING.waitSpread*waitScale)*(info.nice?TUNING.niceWait:1));
  const q=Math.max(.4,P.inNet-.015*(d-1)),fill=version===2?.37:TUNING.fillRate,reel=(1-TUNING.progressStart)/(q*fill-(1-q)*TUNING.drainRate)+.7;
  const reaction=.28;const aim=TUNING.chargeSweepMs/1000*info.distance,flight=.07+.340+info.distance*.320;
  const elapsed=aim+flight+wait+reaction+reel+P.readSeconds+P.extraSeconds;if(now+elapsed*1000>end)break;now+=elapsed*1000;
  if(win){caught++;if(isSellableFish(FREE_BY_ID[c.fish])){cooler.push({...c,caughtAt:now});}}
  // Planning approximation: failed attempts use the same duration as successful attempts.
  // Honest player never peeks/skips deck indices. A valid tier-capped catch is released after Gen refuses it.
 }
 sell(true);
 return{earned,paid,caught,attempted,ops,keptTier,spoiled,capHit,activeMinutes:minutes,capacity};
}
const economic=[];const N=1000;
for(const version of [1,2])for(const profile of Object.keys(PROFILES))for(const minutes of [30,60]){const results=Array.from({length:N},(_,person)=>runSession({version,profile,minutes,person}));const a=results.map(v=>v.earned);economic.push({version,profile,minutes,capacity:10,n:N,mean:a.reduce((n,x)=>n+x,0)/N,p10:percentile(a,.1),p50:percentile(a,.5),p90:percentile(a,.9),p95:percentile(a,.95),p99:percentile(a,.99),attemptsMean:results.reduce((n,v)=>n+v.attempted,0)/N,paidMean:results.reduce((n,v)=>n+v.paid,0)/N,opsMean:results.reduce((n,v)=>n+v.ops,0)/N,spoiledMean:results.reduce((n,v)=>n+v.spoiled,0)/N});}
const sensitivities=[];for(const args of [{profile:'regular',minutes:60,capacity:20},{profile:'regular',minutes:60,tripMultiplier:.5},{profile:'regular',minutes:60,tripMultiplier:2},{profile:'skilled',minutes:60,capacity:20},{profile:'regular',minutes:60,perfectCatch:true},{profile:'skilled',minutes:60,allNice:true,perfectCatch:true},{profile:'regular',minutes:120},{profile:'skilled',minutes:120},{profile:'casual',minutes:30,tripMultiplier:2}]){const rs=Array.from({length:N},(_,person)=>runSession({version:2,person,...args})),a=rs.map(x=>x.earned);sensitivities.push({...args,version:2,mean:a.reduce((n,x)=>n+x,0)/N,p50:percentile(a,.5),p95:percentile(a,.95),p99:percentile(a,.99),opsMean:rs.reduce((n,v)=>n+v.ops,0)/N});}
const capAnalysis=[];for(const cap of [1000,1500,1800,2000,2500,3000])for(const profile of Object.keys(PROFILES))for(const minutes of [30,60]){const un=Array.from({length:N},(_,person)=>runSession({version:2,profile,minutes,person})),rs=Array.from({length:N},(_,person)=>runSession({version:2,profile,minutes,person,cap}));capAnalysis.push({cap,profile,minutes,hitPercent:100*rs.filter(x=>x.capHit).length/N,mean:rs.reduce((n,x)=>n+x.earned,0)/N,uncappedMean:un.reduce((n,x)=>n+x.earned,0)/N});}
const output={sourceCommit:'b87ba82c3c61b1c145c6a39b54da7c4f7c229e5c',seed:SECRET,parity,odds,profiles:PROFILES,economic,sensitivities,capAnalysis,notes:{model:'Planning estimates, not observed player telemetry. No travel/time/skill distribution is claimed measured. v2 odds/kernel is a scratch candidate, not shipped.',ice:'No ice; actual age bands included. Trips <10m normally keep fish fresh.',caps:'Epic10/day, legend2/day, god never sold, 40 accepted writes/day; coin cap removed for uncapped estimates.',discard:'Tier-capped fish released after a refused/kept sale. No targeted seed/index look-ahead.'}};
writeFileSync(new URL('./ECO-03-v2-model-results.json', import.meta.url),JSON.stringify(output,null,2));
console.log('ECONOMIC',JSON.stringify(economic));console.log('SENSITIVITIES',JSON.stringify(sensitivities));console.log('CAPS',JSON.stringify(capAnalysis));
