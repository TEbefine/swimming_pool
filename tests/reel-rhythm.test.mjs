import './register-api-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
registerHooks({ resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return next(u.href,c);}return next(s,c);} });
const R = await import('../src/game/fishing/reelRhythm.ts');
const F = await import('../src/game/story/fishing.ts');
function random(seed){let x=seed;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
const free = d => F.press({...F.cast(()=>.5,{freePacing:true, table:{species:[{id:'fish',difficulty:d,tier:'common',where:'any'}],tiers:[]},rolled:{fish:'fish',sizeCm:null,baseDiff:d,big:false}}),phase:'bite'});
test('scaled Perfect windows include edges, exclude neighbours and award once per beat',()=>{
 for(let d=1;d<=5;d++){
  const s=R.newRhythm(d),i=s.interval,w=R.perfectWindowMs(i);
  assert.equal(w,Math.min(140,i*.18));
  for(const sign of [-1,1]){
   assert.ok(R.rhythmPress(s,i+sign*(w-1e-7)).perfect);
   assert.ok(!R.rhythmPress(s,i+sign*(w+.001)).perfect);
  }
  const first=R.rhythmPress(s,i).state;
  assert.ok(!R.rhythmPress(first,i+1).perfect);
  assert.equal(R.rhythmPress(first,i+1).state.perfects,1);
  assert.ok(!R.rhythmPress(s,0).perfect,'strike is not a rhythm beat');
 }
});
test('input event timestamps survive dispatch/frame delays, epoch stamps normalize and offset sign is explicit',()=>{
 const epoch=10_000,origin=1_700_000_000_000,s=R.newRhythm(5),event=epoch+s.interval;
 for(const dispatchDelay of [0,150,350]){
  const normalized=R.inputTimeMs(event,origin,event+dispatchDelay);
  assert.ok(R.rhythmPress(s,normalized-epoch).perfect);
  assert.ok(R.rhythmPress(s,R.inputTimeMs(origin+event,origin,0)-epoch).perfect);
 }
 assert.ok(R.rhythmPress(s,s.interval+160,160).perfect);
 assert.ok(!R.rhythmPress(s,s.interval+160).perfect);
 assert.equal(R.inputTimeMs(NaN,origin,123),123);
});
test('random taps earn far fewer Perfects than on-beat taps at all five tempos',()=>{
 for(let d=1;d<=5;d++){
  let on=R.newRhythm(d),off=R.newRhythm(d);const rng=random(917+d),n=10000;
  for(let beat=1;beat<=n;beat++){
   on=R.rhythmPress(on,beat*on.interval).state;
   off=R.rhythmPress(off,(beat-.5+rng())*off.interval).state;
  }
  assert.equal(on.perfects,n);assert.ok(off.perfects < n*.4,JSON.stringify({d,perfects:off.perfects}));
 }
});
test('combo tiers expire, skipped beats break streak and social threshold is six or full-perfect',()=>{
 let s=R.newRhythm(1); const i=s.interval;
 for(let b=1;b<=6;b++){
  s=R.rhythmPress(s,b*i).state;
  assert.equal(R.rhythmFill(s,b*i),b>=6?1.3:b>=4?1.2:b>=2?1.1:1);
 }
 assert.equal(R.rhythmFill(s,7*i),1);assert.equal(R.rhythmCombo(s,8*i),0);
 assert.equal(R.rhythmAnnouncement(s,8*i),'Perfect catch ×6!');
 let short=R.rhythmPress(R.newRhythm(1),i).state;
 assert.equal(R.rhythmAnnouncement(short,i+10),'Perfect catch ×1!');
 assert.equal(R.rhythmAnnouncement(short,3*i),null,'missed beats are not full-perfect');
 short=R.rhythmPress(short,3*i).state;assert.equal(short.streak,1);assert.equal(short.broken,true);
 short=R.rhythmPress(short,3.5*i).state;assert.equal(short.streak,0);assert.equal(R.rhythmFill(short,3.5*i),1);
});
test('rhythm fill rewards in-net skill only; free drain .24, story ignores all reel effects',()=>{
 const s=free(1),inside={...s,fishY:.5,fishTarget:.5,netY:.35,netV:0,progress:.5};
 const effects={elapsedMs:200,intervalMs:800,fillMultiplier:1.3};
 assert.equal(F.step(inside,.01,()=>.5,false,effects).progress,.5+.37*1.3*.01);
 assert.equal(F.step({...inside,netY:0},.01,()=>.5,false,effects).progress,.5-.24*.01);
 const story=F.press({...F.cast(()=>.5,{firstCatch:true}),phase:'bite'});
 assert.deepEqual(F.step(story,.02,()=>.5,true,effects),F.step(story,.02,()=>.5,true));
});
test('causal tracking with timed rescue taps lands all difficulties at 60/30/20fps +150ms hold latency',()=>{
 let wins=0;
 for(const fps of [60,30,20])for(let d=1;d<=5;d++)for(let seed=0;seed<16;seed++){
  let s=free(d),rhythm=R.newRhythm(d),last=s.fishY;const dt=1/fps,rng=random(seed),queue=Array(Math.ceil(.15/dt)).fill(false);
  for(let f=0;f<fps*60&&s.phase==='reel';f++){
   const ms=(f+1)*dt*1000,vel=(s.fishY-last)/dt;last=s.fishY;
   let y=s.netY,v=s.netV;
   for(const h of queue){v=Math.max(-1.1,Math.min(1.1,v+(-1.6+(h?3:0))*dt));y+=v*dt;if(y<0){y=0;v=Math.max(0,v)*.3;}if(y>.7){y=.7;v=Math.min(0,v);}}
   const hold=y+.15+v*.35<Math.max(.15,Math.min(.85,s.fishY+vel*.15));queue.push(hold);
   // The beat is predictable from the tug; input is timestamped on the next frame near its deadline.
   const beat=Math.round(ms/rhythm.interval);
   if(beat>rhythm.lastBeat&&Math.abs(ms-beat*rhythm.interval)<=dt*1000/2&&s.netV<-.5&&s.netY+.3<s.fishY){
    const judged=R.rhythmPress(rhythm,ms,0,s.fishY>=s.netY&&s.fishY<=s.netY+.3);rhythm=judged.state;
    // Lift is optional: a player tracking a descending fish may leave this beat alone.
    s=F.press(s);if(judged.perfect&&rhythm.streak>=2)s={...s,netV:Math.min(1.1,Math.max(s.netV,0)+.65)};
   }
   s=F.step(s,dt,rng,queue.shift(),{elapsedMs:ms,intervalMs:rhythm.interval,fillMultiplier:R.rhythmFill(rhythm,ms)});
  }
  assert.equal(s.phase,'caught',JSON.stringify({fps,d,seed}));wins++;
 }
 assert.equal(wins,240);
});

test('lookahead schedules audio deadlines independently of frames, skips stalls and cancels feedback',async t=>{
 const { sound } = await import('../src/game/audio.ts');
 const { startRhythmFeedback } = await import('../src/game/fishing/rhythmFeedback.ts');
 let now=0,intervalTick,cleared=0,stopped=0;const scheduled=[],timeouts=new Map();let id=0;
 t.mock.method(performance,'now',()=>now);
 t.mock.method(globalThis,'setInterval',fn=>{intervalTick=fn;return 1;});
 t.mock.method(globalThis,'clearInterval',()=>{cleared++;});
 t.mock.method(globalThis,'setTimeout',(fn,delay)=>{timeouts.set(++id,{fn,delay});return id;});
 t.mock.method(globalThis,'clearTimeout',key=>timeouts.delete(key));
 t.mock.method(sound,'rhythmClick',at=>{scheduled.push(at);return()=>{stopped++;};});
 const oldDoc=globalThis.document;globalThis.document={hidden:false};
 try{
  const stop=startRhythmFeedback(0,600);
  assert.deepEqual(scheduled,[]);now=510;intervalTick();assert.deepEqual(scheduled,[600]);
  now=550;intervalTick();assert.equal(scheduled.length,1);
  globalThis.document.hidden=true;intervalTick();assert.equal(stopped,1);assert.equal(timeouts.size,0);
  now=2500;globalThis.document.hidden=false;intervalTick();assert.equal(scheduled.length,1,'no overdue click burst');
  now=2910;intervalTick();assert.equal(scheduled.at(-1),3000);
  stop();assert.equal(cleared,1);assert.equal(timeouts.size,0);assert.equal(stopped,2);
 }finally{globalThis.document=oldDoc;}
});

test('Web Audio clicks use output-clock mapping, and mute/visibility/cancel own the scheduled source',async t=>{
 const { SoundManager }=await import('../src/game/audio.ts');
 const started=[],stops=[];let resumed=0;
 const node=()=>({connect(){},disconnect(){},frequency:{value:0},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}});
 const ctx={state:'running',currentTime:10,destination:{},getOutputTimestamp:()=>({contextTime:9.95,performanceTime:1000}),
  createOscillator:()=>({...node(),start:at=>started.push(at),stop:at=>stops.push(at)}),createGain:node,suspend:async()=>{resumed++;}};
 const oldDoc=globalThis.document;globalThis.document={hidden:false};
 t.mock.method(performance,'now',()=>1000);
 try{
  const sound=new SoundManager();sound.ctx=ctx;t.mock.method(sound,'initCtx',()=>{});
  const cancel=sound.rhythmClick(1100);assert.ok(Math.abs(started[0]-10.05)<1e-10);cancel();assert.equal(stops.at(-1),undefined);
  sound.setMuted(true);assert.equal(sound.getActiveSourceCount(),0);assert.equal(resumed,1);
  sound.rhythmClick(1200);assert.equal(started.length,1);
  sound.setMuted(false);globalThis.document.hidden=true;sound.rhythmClick(1300);assert.equal(started.length,1);
 }finally{globalThis.document=oldDoc;}
});


test('free taps cancel falling speed; story taps retain the original falling-speed sum',()=>{
 const s=free(1),story={...F.cast(()=>.5,{firstCatch:true}),phase:'reel'};
 for(const v of [-1.1,-.55,0,.4,1.1]){
  const tapped=F.press({...s,netV:v,netY:.3});
  assert.equal(tapped.netV,Math.min(1.1,Math.max(v,0)+.55));
  assert.ok(F.step(tapped,1/20,()=>.5).netY>.3);
  assert.equal(F.press({...s,netV:v},.65).netV,Math.min(1.1,Math.max(v,0)+.65));
  assert.equal(F.press({...story,netV:v},.65).netV,Math.min(1.1,v+.55));
 }
});
test('Perfect requires the pre-tap yellow zone, and a single Perfect has no fill bonus',()=>{
 let s=R.newRhythm(1);const i=s.interval;
 s=R.rhythmPress(s,i,0,true).state;assert.equal(s.streak,1);assert.equal(R.rhythmFill(s,i),1);
 const out=R.rhythmPress(s,2*i,0,false);assert.equal(out.perfect,false);assert.equal(out.state.streak,0);assert.equal(out.state.perfects,1);assert.equal(R.rhythmFill(out.state,2*i),1);
 s=R.rhythmPress(s,2*i,0,true).state;assert.equal(s.streak,2);assert.equal(R.rhythmFill(s,2*i),1.1);
});
test('late input uses historical fish/net overlap instead of its later frame position',()=>{
 const samples=[{at:100,fishY:.3,netY:.2},{at:200,fishY:.7,netY:.2}];
 assert.equal(R.inNetAt(samples,100,.3),true);assert.equal(R.inNetAt(samples,200,.3),false);
 assert.equal(R.inNetAt(samples,125,.3),true);assert.equal(R.inNetAt(samples,175,.3),false);
 assert.equal(R.inNetAt(samples,99,.3),false);assert.equal(R.inNetAt(samples,201,.3),false);
 assert.equal(R.rhythmPress(R.newRhythm(1),60000/72,0,R.inNetAt(samples,200,.3)).perfect,false);
});
test('first three free reels show teaching hint, persisted per device with safe blocked-storage fallback',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 for(const show of [true,true,true,false])assert.equal(R.nextReelHint(storage,0).show,show);
 const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};let count=0;
 for(const show of [true,true,true,false]){const h=R.nextReelHint(broken,count);count=h.count;assert.equal(h.show,show);}
});
test('audio latency diagnostic reports milliseconds and unsupported values without inventing measurements',async()=>{
 const {SoundManager}=await import('../src/game/audio.ts');const s=new SoundManager();
 assert.deepEqual(s.latencyInfo(),{state:'uninitialized',baseLatencyMs:null,outputLatencyMs:null});
 s.ctx={state:'running',baseLatency:.012,outputLatency:.034};assert.deepEqual(s.latencyInfo(),{state:'running',baseLatencyMs:12,outputLatencyMs:34});
});


test('free cast gesture primes audio synchronously; muted/failed audio never blocks casting',async t=>{
 const {SoundManager}=await import('../src/game/audio.ts');const old=globalThis.document;globalThis.document={hidden:false};
 t.mock.method(globalThis,'setTimeout',()=>1);
 try{
  const sound=new SoundManager();let calls=0;t.mock.method(sound,'initCtx',()=>{calls++;});
  sound.prepareFishingAudio();assert.equal(calls,1);
  sound.muted=true;sound.prepareFishingAudio();assert.equal(calls,1);
  const unavailable=new SoundManager();t.mock.method(unavailable,'initCtx',()=>{throw Error('audio unavailable');});
  assert.doesNotThrow(()=>unavailable.prepareFishingAudio());
 }finally{globalThis.document=old;}
});
