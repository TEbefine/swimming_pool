import './register-api-ts.mjs';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(s,c,n){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return n(u.href,c);}return n(s,c);}});
import test from 'node:test';import assert from 'node:assert/strict';
const {saleHarness,operationId}=await import('./sale-harness.mjs');
const {emptyPlayer}=await import('../server/saves/rules.ts');
const {freshWallet,buy}=await import('../src/game/economy/wallet.ts');
const {RODS}=await import('../src/game/economy/rodConfig.ts');
test('Gen rods: ordered server-owned purchases, exact Retry, rejected skips and quantities',async()=>{
 const h=saleHarness();h.players.set(h.address,{...emptyPlayer(h.clock),coins:10000});
 const request=(id,qty=1)=>({op:'shop.buy',operationId:operationId(),vendor:'gen',cart:[{id,qty}]});
 assert.equal((await h.call(request('rod_master'))).statusCode,422);
 assert.equal((await h.call(request('rod_fiberglass',2))).statusCode,422);
 for(let level=1;level<=3;level++){
  const req=request(RODS[level].id),before=h.players.get(h.address).coins;
  assert.equal((await h.call(req)).statusCode,200);assert.equal(h.players.get(h.address).rodLevel,level);
  assert.equal(h.players.get(h.address).coins,before-RODS[level].price);assert.equal(h.players.get(h.address).goods.length,0);
  const snapshot=h.snapshot();assert.equal((await h.call(req)).statusCode,200);assert.deepEqual(h.snapshot(),snapshot);
  assert.equal((await h.call(request(RODS[level].id))).statusCode,422);
 }
 const forged=request('rod_master');forged.rodLevel=3;assert.equal((await h.call(forged)).statusCode,400);
});
test('rod upgrades need funds, fit full goods bag, reject mixed rod tiers, and keep balance atomic',()=>{
 const w={...freshWallet(0),coins:599};const ctx={now:0};
 assert.equal(buy(w,[{id:'rod_fiberglass',qty:1}],'gen',ctx).ok,false);
 const full={...w,coins:1000,goods:Array.from({length:20},(_,i)=>({uid:String(i),id:'nori',qty:20,at:0}))};
 assert.equal(buy(full,[{id:'rod_fiberglass',qty:1}],'gen',ctx).ok,true);
 assert.equal(buy({...w,coins:10000},[{id:'rod_fiberglass',qty:1},{id:'rod_carbon',qty:1}],'gen',ctx).ok,false);
});

test('rod level survives other purchases and load; wrong vendor cannot grant a rod',async()=>{
 const h=saleHarness();h.players.set(h.address,{...emptyPlayer(h.clock),rodLevel:2,coins:10000});
 const req={op:'shop.buy',operationId:operationId(),vendor:'minato',cart:[{id:'rod_master',qty:1}]};assert.equal((await h.call(req)).statusCode,422);
 assert.equal((await h.call({...req,operationId:operationId(),vendor:'gen',cart:[{id:'ice_block',qty:1}]})).statusCode,200);
 assert.equal((await h.call({op:'load'})).body.rodLevel,2);
});
