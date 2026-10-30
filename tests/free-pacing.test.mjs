import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
registerHooks({ resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return next(u.href,c);}return next(s,c);} });
const { cast, press, step, TUNING } = await import('../src/game/story/fishing.ts');
const { FREE_FISHING_TUNING: P } = await import('../src/game/fishing/freeFishingTuning.ts');
const { DECK_SPECIES_V2 } = await import('../src/game/fishing/deckRollV2.ts');
function rng(seed){let x=seed;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
function free(d,big=false,star=false){return cast(()=>.5,{freePacing:true,table:{species:[{id:'fish',difficulty:d,tier:'common',where:'any',size:[10,20]}],tiers:[]},rolled:{fish:'fish',sizeCm:20,baseDiff:d,big},starred:()=>star});}
test('free profile changes only wait/fill/movement, snapshots immutable settings; story ignores opt-in',()=>{
 const f=free(5);assert.equal(f.biteAt,(1.98+.5*3.15));assert.equal(f.freeTuning,P);assert.ok(Object.isFrozen(P));
 const story=cast(()=>.5,{firstCatch:true});assert.deepEqual(cast(()=>.5,{firstCatch:true,freePacing:true,starred:()=>true}),story);
 assert.equal(story.biteAt,2.2+.5*3.5);assert.equal(story.freeTuning,undefined);
 const reel=press({...story,phase:'bite'}),next=step(reel,.05,()=>.5,true);
 assert.ok(Math.abs(next.netV-.07)<1e-12);assert.equal(next.fishY,.365);assert.equal(next.progress,.3+.34*.05);
 assert.equal(TUNING.chargeSweepMs,900);assert.equal(TUNING.biteWindow(5),.4);assert.equal(f.strikeMultiplier,1);
 assert.equal(free(5,false,true).strikeMultiplier,1.15);
});
test('free motion stays within speed/acceleration bounds through extreme targets and rails',()=>{
 for(const fps of [60,30,20])for(const d of [1,2,3,4,5]){
  let s=press({...free(d),phase:'bite'});const dt=1/fps;let n=0;
  for(let i=0;i<fps*30;i++){
   const old=s;s=step({...s,phase:'reel',progress:.5},dt,()=>((n++)%2?1:0),i%2===0);
   assert.ok(Math.abs(s.fishV)<=Math.min(P.maxFishSpeed,TUNING.fishSpeed(d))+1e-10);
   assert.ok(Math.abs(s.fishV-old.fishV)<=P.fishAcceleration*dt+1e-10);
   assert.ok(s.fishY>=0&&s.fishY<=1);if(old.fishTurnIn<=dt)assert.ok(s.fishTurnIn>=.75);
  }
 }
});
test('causal controller lands free fish at 60/30/20 fps with 150ms delayed input, all difficulties/big/stars and adversarial targets',()=>{
 let runs=0;
 for(const fps of [60,30,20])for(const d of [1,2,3,4,5])for(const big of [false,true])for(const star of [false,true])for(let seed=0;seed<32;seed++){
  const dt=1/fps,r=seed===0?()=>0:seed===1?()=>1:seed===2?(()=>{let i=0;return()=>[0,.5,1,.5][i++%4];})():rng(seed);let s={...free(d,big,star),phase:'bite'};
  for(let i=0;i<Math.ceil(.15/dt);i++)s=step(s,dt,r,false);
  assert.equal(s.phase,'bite');s=press(s);
  const queue=Array(Math.ceil(.15/dt)).fill(false);let lastY=s.fishY;
  for(let i=0;i<fps*60&&s.phase==='reel';i++){
   const fishV=(s.fishY-lastY)/dt;lastY=s.fishY;
   const target=Math.max(.10,Math.min(.90,s.fishY+fishV*.15));
   let y=s.netY,v=s.netV;
   for(const held of queue){v=Math.max(-1.1,Math.min(1.1,v+(-1.6+(held?3:0))*dt));y+=v*dt;if(y<0){y=0;v=Math.max(0,v)*.3;}if(y>.8){y=.8;v=Math.min(0,v);}}
   const hold=y+.10+v*.35<target;
   queue.push(hold);s=step(s,dt,r,queue.shift());
  }
  assert.equal(s.phase,'caught',JSON.stringify({fps,d,big,star,seed,s}));runs++;
 }
 assert.equal(runs,1920);
});

function digest(m){const hash=createHash('sha256');for(let seed=0;seed<64;seed++){let x=seed;const r=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};let s=m.cast(r,{firstCatch:seed%2===0,info:{distance:.85,nice:true}});for(let i=0;i<600;i++){if(i===50)s=m.press({...s,phase:'bite'});if(i%11===0&&s.phase==='reel')s=m.press(s);s=m.step(s,[1/60,1/30,.05][seed%3],r,i%13<7);hash.update(JSON.stringify(s));}}return hash.digest('hex');}

test('story state trace matches the pre-step-3 kernel across 38400 frames',async()=>{const m=await import('../src/game/story/fishing.ts');assert.equal(digest(m),'ed2d79db6cea6d2595a9327cb05a31fdeb090910705ff0defeda8a80f5863731');});
