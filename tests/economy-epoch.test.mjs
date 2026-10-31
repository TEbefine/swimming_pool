import './register-api-ts.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {saleHarness,operationId} from './sale-harness.mjs';
import {fixtureCatch} from './fishing-fixtures.mjs';
const {controlCache}=await import('../server/saves/control.ts');
const {epochPlayer,epochClosing}=await import('../server/saves/epoch.ts');
const {emptyPlayer}=await import('../server/saves/rules.ts');
test('60-second runtime cache coalesces cold requests, refreshes at expiry and fails closed without stale-open fallback',async()=>{
 let now=0,reads=0,open=true,fail=false;const read=controlCache(async()=>{reads++;if(fail)throw Error('offline');return{open};},()=>now);
 assert.deepEqual(await Promise.all(Array.from({length:100},()=>read())),Array(100).fill(true));assert.equal(reads,1);
 open=false;now=59999;assert.equal(await read(),true);assert.equal(reads,1);
 now=60000;assert.equal(await read(),false);assert.equal(reads,2);
 now=120000;fail=true;assert.equal(await read(),false);assert.equal(reads,3);
});
test('epoch resets only economic fields and old-format Book; strict verified Book and story/identity/unknown fields survive',()=>{
 const raw={...emptyPlayer(0),econEpoch:0,coins:300,rodLevel:3,coolerLevel:2,goods:[{id:'ice_block'}],paidDecks:[{}],iceUsedAt:[1],fishBook:{kinds:['sardine']},relationships:{kai:5},cards:['one'],identity:'unchanged'};
 const v=epochPlayer(raw,0);assert.equal(v.coins,0);assert.equal(v.rodLevel,0);assert.equal(v.coolerLevel,0);assert.deepEqual(v.goods,[]);assert.deepEqual(v.paidDecks,[]);assert.deepEqual(v.fishBook,{});assert.deepEqual(v.relationships,raw.relationships);assert.deepEqual(v.cards,raw.cards);assert.equal(v.identity,'unchanged');assert.equal(raw.coins,300);assert.equal(epochClosing(v).balanceBefore,300);
 const valid=epochPlayer({...raw,fishBook:{sardine:{best:15,sold:1}}},0);assert.deepEqual(valid.fishBook,{sardine:{best:15,sold:1}});assert.equal(epochClosing(epochPlayer(v,0)),undefined);
});
test('old Book reset permits a verified sale, load writes nothing, closing entry occurs once and runtime closure ignores warm cached status',async()=>{
 const h=saleHarness();h.players.set(h.address,{...emptyPlayer(h.clock),econEpoch:0,coins:300,fishBook:{kinds:['sardine']}});
 const before=h.snapshot();for(let i=0;i<2;i++){const r=await h.call({op:'load'});assert.equal(r.body.coins,0);assert.equal(r.body.econEpoch,1);}assert.deepEqual(h.snapshot(),before);
 const c=fixtureCatch(h.address,h.clock),id=operationId();assert.equal((await h.sell([c],id)).statusCode,200);assert.equal(h.players.get(h.address).econEpoch,1);assert.equal(h.logs.get(`${h.address}/${id}`).changes.epoch.reason,'epoch');
 h.control.open=false;const snap=h.snapshot();assert.equal((await h.sell([c],id)).statusCode,200);assert.deepEqual(h.snapshot(),snap);assert.equal((await h.call({op:'shop.buy',operationId:operationId(),vendor:'gen',cart:[{id:'ice_block',qty:1}]})).statusCode,403);assert.deepEqual(h.snapshot(),snap);
});
test('historical no-epoch receipt replays while closed with fresh zero balance; old uncommitted request cannot spend',async()=>{
 const h=saleHarness(),id=operationId(),cart=[{id:'ice_block',qty:1}],hash=createHash('sha256').update(JSON.stringify(['shop.buy','gen',cart,15])).digest('hex');
 h.players.set(h.address,{...emptyPlayer(h.clock),econEpoch:0,coins:100});h.logs.set(`${h.address}/${id}`,{requestHash:hash,changes:{spent:15}});h.control.open=false;
 const body={op:'shop.buy',operationId:id,vendor:'gen',cart,expectedTotal:15,econEpoch:undefined};const before=h.snapshot();const r=await h.call(body);assert.equal(r.statusCode,200);assert.equal(r.body.coins,0);assert.equal(r.body.result.spent,15);assert.deepEqual(h.snapshot(),before);
 h.control.open=true;const rejected=await h.call({...body,operationId:operationId()});assert.equal(rejected.statusCode,409);assert.equal(rejected.body.epochChanged,true);assert.deepEqual(h.snapshot(),before);
});

test('Admin service caches only advisory reads; each money transaction independently reads config alongside player/log',async()=>{
 const {makeSaveServices}=await import('../server/saves/admin.ts');let reads=0,open=true;const batches=[];
 const ref=path=>({path,get:async()=>{reads++;return{data:()=>({open})};},collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
 const db={doc:ref,collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:async run=>run({getAll:async(...refs)=>{batches.push(refs.map(r=>r.path));return refs.map(r=>({exists:true,data:()=>r.path==='config/economy'?{open}:{}}));}})};
 const s=makeSaveServices(()=>db,()=>({}));assert.equal(await s.readControl(),true);open=false;assert.equal(await s.readControl(),true);assert.equal(reads,1);
 const answer=await s.transact('alice','op',(_p,_l,c)=>({write:null,response:c.open}),true);assert.equal(answer,false);assert.deepEqual(batches[0],['players/alice','players/alice/log/op','config/economy']);
});
