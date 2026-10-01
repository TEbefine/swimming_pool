import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { NetworkManager } from '../src/game/network.ts';
import { SoundManager } from '../src/game/audio.ts';

class FakeSocket {
  static OPEN = 1;
  static instances = [];
  readyState = 0;
  bufferedAmount = 0;
  sent = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  send(value) { this.sent.push(value); }
}
class FakeChannel {
  static instances = [];
  sent = [];
  closed = false;
  constructor() { FakeChannel.instances.push(this); }
  postMessage(value) { assert.equal(this.closed, false); this.sent.push(value); }
  close() { this.closed = true; }
}
class FakeNode {
  disconnected = false;
  stopCalls = 0;
  frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  connect() {}
  disconnect() { this.disconnected = true; }
  start() {}
  stop() { this.stopCalls++; }
  end() { this.onended?.(); }
}
class FakeAudioContext {
  static instances = [];
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  sources = [];
  nodes = [];
  buffers = 0;
  resumeCalls = 0;
  suspendCalls = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  createNode() { const node = new FakeNode(); this.nodes.push(node); return node; }
  createOscillator() { const node = this.createNode(); this.sources.push(node); return node; }
  createBufferSource() { return this.createOscillator(); }
  createGain() { return this.createNode(); }
  createBiquadFilter() { return this.createNode(); }
  createBuffer(_, size) { this.buffers++; return { getChannelData: () => new Float32Array(size) }; }
  async resume() { this.resumeCalls++; this.state = 'running'; }
  async suspend() { this.suspendCalls++; this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
const originalGlobals = new Map();
const managers = [];
beforeEach(() => {
  FakeSocket.instances = [];
  FakeChannel.instances = [];
  FakeAudioContext.instances = [];
  const globals = {
    window: Object.assign(new EventTarget(), {
      location: { protocol: 'https:', hostname: 'example.com' },
      BroadcastChannel: FakeChannel,
      AudioContext: FakeAudioContext,
    }),
    document: Object.assign(new EventTarget(), { hidden: false }),
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {} },
    WebSocket: FakeSocket,
    BroadcastChannel: FakeChannel,
  };
  for (const [key, value] of Object.entries(globals)) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
});
afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
function network(url = 'wss://relay.example.com') {
  const manager = new NetworkManager('local', url);
  managers.push(manager);
  return manager;
}
function audio() {
  const manager = new SoundManager();
  managers.push(manager);
  return manager;
}
function visibility(hidden) {
  document.hidden = hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}

test('production does not probe an unconfigured relay', () => {
  const manager = new NetworkManager('local');
  managers.push(manager);
  assert.equal(FakeSocket.instances.length, 0);
  manager.broadcastPlayerState({ id: 'local' });
  assert.equal(FakeChannel.instances[0].sent.length, 1);
});

test('destroy cancels pending reconnects and leaves no event-triggered reconnection', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const manager = network();
  const socket = FakeSocket.instances[0];
  socket.open();
  socket.close();
  manager.destroy();
  t.mock.timers.tick(60_000);
  visibility(true);
  visibility(false);
  window.dispatchEvent(new Event('online'));
  assert.equal(FakeSocket.instances.length, 1);
  assert.equal(manager.getIsConnected(), false);
  assert.equal(FakeChannel.instances[0].closed, true);
});

test('reconnect backs off and sleeps while hidden or offline', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  network();
  FakeSocket.instances[0].close();
  t.mock.timers.tick(999);
  assert.equal(FakeSocket.instances.length, 1);
  t.mock.timers.tick(1);
  FakeSocket.instances[1].close();
  t.mock.timers.tick(1999);
  assert.equal(FakeSocket.instances.length, 2);
  t.mock.timers.tick(1);
  assert.equal(FakeSocket.instances.length, 3);
  FakeSocket.instances[2].close();
  visibility(true);
  t.mock.timers.tick(60_000);
  assert.equal(FakeSocket.instances.length, 3);
  visibility(false);
  assert.equal(FakeSocket.instances.length, 4);
  navigator.onLine = false;
  window.dispatchEvent(new Event('offline'));
  t.mock.timers.tick(60_000);
  assert.equal(FakeSocket.instances.length, 4);
  navigator.onLine = true;
  window.dispatchEvent(new Event('online'));
  assert.equal(FakeSocket.instances.length, 5);
});

test('slow sockets drop replaceable movement without queuing it or dropping chat', () => {
  const manager = network();
  const socket = FakeSocket.instances[0];
  socket.open();
  socket.sent.length = 0; // the relay greeting
  socket.bufferedAmount = 100_000;
  manager.broadcastPlayerState({ id: 'local', x: 1, y: 2, roomId: 'cafe' });
  manager.sendChatMessage({ text: 'hello' });
  const types = socket.sent.map((m) => JSON.parse(m).type);
  assert.equal(types.includes('s'), false, 'movement is dropped while the socket is backed up');
  assert.equal(types.includes('chat_message'), true, 'chat still goes out');
  navigator.onLine = false;
  manager.broadcastPlayerState({ id: 'local' });
  assert.equal(FakeChannel.instances[0].sent.length, 3);
});

test('relay v2: batched snapshots become engine events, keyframes drop players who left', () => {
  const manager = network();
  const socket = FakeSocket.instances[0];
  const events = [];
  for (const type of ['player_state', 'player_leave', 'room_counts']) manager.on(type, (t, d) => events.push([t, d]));
  socket.open();
  assert.equal(JSON.parse(socket.sent[0]).type, 'hello');
  const deliver = (msg) => socket.onmessage({ data: JSON.stringify(msg) });
  deliver({ type: 'prof', p: [['a', 'Ann', 'blue', '', 0], ['b', 'Bo', 'red', 'hi', 5]] });
  deliver({ type: 'snap', r: 'cafe', k: 0, p: [['a', 10, 20, 1, 'walk1', 'land'], ['b', 30, 40, -1, 'idle', 'land']] });
  const states = events.filter(([t]) => t === 'player_state').map(([, d]) => d);
  assert.equal(states.length, 2);
  assert.deepEqual([states[0].name, states[0].x, states[0].roomId, states[0].floatColor], ['Ann', 10, 'cafe', 'blue']);
  assert.equal(states[1].lastMessage, 'hi');
  deliver({ type: 'snap', r: 'cafe', k: 1, p: [['a', 11, 20, 1, 'idle', 'land']] });
  assert.deepEqual(events.filter(([t]) => t === 'player_leave').map(([, d]) => d.id), ['b']);
  deliver({ type: 'rooms', c: { cafe: 2 } });
  assert.deepEqual(events.at(-1), ['room_counts', { cafe: 2 }]);
});

test('relay v2: position updates are rate-limited but the final position always arrives', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const manager = network();
  const socket = FakeSocket.instances[0];
  socket.open();
  socket.sent.length = 0;
  for (let i = 0; i < 20; i++) {
    manager.broadcastPlayerState({ id: 'local', name: 'Me', floatColor: 'red', x: i * 3, y: 5, facing: 1, currentAction: 'walk1', state: 'land', roomId: 'cafe' });
    t.mock.timers.tick(16);
  }
  t.mock.timers.tick(200);
  const moves = socket.sent.map((m) => JSON.parse(m)).filter((m) => m.type === 's');
  assert.ok(moves.length <= 5, `sent ${moves.length} position updates for 20 frames`);
  assert.equal(moves.at(-1).d[0], 57);
  assert.equal(socket.sent.map((m) => JSON.parse(m)).filter((m) => m.type === 'p').length, 1, 'profile sent once');
});

test('audio stays lazy in a hidden tab and reuses noise samples', () => {
  const manager = audio();
  visibility(true);
  manager.playSplash();
  assert.equal(FakeAudioContext.instances.length, 0);
  visibility(false);
  manager.playSplash();
  manager.playSplash();
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(FakeAudioContext.instances[0].buffers, 1);
});

test('finished audio disconnects every node and suspends the idle device', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const manager = audio();
  manager.playSplash();
  const ctx = FakeAudioContext.instances[0];
  ctx.sources.forEach((source) => source.end());
  assert.ok(ctx.nodes.every((node) => node.disconnected));
  t.mock.timers.tick(1000);
  assert.equal(ctx.state, 'suspended');
  manager.playFootstep();
  await Promise.resolve();
  assert.equal(ctx.state, 'running');
  assert.equal(ctx.resumeCalls, 1);
});

test('muting and hiding stop queued sounds; visibility alone does not wake audio', () => {
  const manager = audio();
  manager.playEmoteSound('happy');
  const ctx = FakeAudioContext.instances[0];
  manager.setMuted(true);
  assert.equal(ctx.state, 'suspended');
  assert.ok(ctx.nodes.every((node) => node.disconnected));
  assert.ok(ctx.sources.every((source) => source.stopCalls === 2));
  manager.setMuted(false);
  visibility(true);
  visibility(false);
  assert.equal(ctx.resumeCalls, 0);
  manager.destroy();
  assert.equal(ctx.state, 'closed');
  const suspensions = ctx.suspendCalls;
  visibility(true);
  assert.equal(ctx.suspendCalls, suspensions);
});

test('audio work remains bounded during a burst of repeated sounds', () => {
  const manager = audio();
  for (let i = 0; i < 100; i++) manager.playEmoteSound('happy');
  assert.equal(FakeAudioContext.instances[0].sources.length, 24);
});
