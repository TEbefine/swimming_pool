import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of ['.ts', '/index.ts']) {
        const url = new URL(base.href + suffix);
        if (existsSync(url)) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

class FakeGain {
  destination = null;
  gain = {
    value: 1,
    values: [],
    ramps: [],
    setValueAtTime(val, time) {
      this.value = val;
      this.values.push({ val, time });
    },
    linearRampToValueAtTime(val, time) {
      this.value = val;
      this.ramps.push({ val, time });
    },
    cancelScheduledValues() {},
  };
  connect(dest) {
    this.destination = dest;
  }
  disconnect() {}
}

class FakeSource {
  buffer = null;
  loop = false;
  startedAt = null;
  stoppedAt = null;
  onended = null;
  destination = null;
  connect(dest) {
    this.destination = dest;
  }
  disconnect() {}
  start(time = 0) {
    this.startedAt = time;
  }
  stop(time = 0) {
    this.stoppedAt = time;
  }
  end() {
    this.onended?.();
  }
}

class FakeAudioContext {
  static instances = [];
  state = 'suspended';
  currentTime = 10;
  destination = {};
  sources = [];
  gains = [];
  resumeCalls = 0;
  suspendCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }

  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }

  async decodeAudioData(buffer) {
    return { duration: 81, sampleRate: 44100, length: 81 * 44100 };
  }

  async resume() {
    this.resumeCalls++;
    this.state = 'running';
  }

  async suspend() {
    this.suspendCalls++;
    this.state = 'suspended';
  }

  async close() {
    this.state = 'closed';
  }
}

let storage = {};
const win = Object.assign(new EventTarget(), {
  AudioContext: FakeAudioContext,
  location: { search: '' },
});
const doc = Object.assign(new EventTarget(), {
  hidden: false,
});

globalThis.window = win;
globalThis.document = doc;
globalThis.AudioContext = FakeAudioContext;
globalThis.localStorage = {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { storage = {}; },
};
globalThis.fetch = async (url) => {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(1024),
  };
};

const { music, ROOM_MUSIC, MUSIC_VOLUMES } = await import('../src/game/audio/music.ts');
const { sound } = await import('../src/game/audio.ts');

test('ROOM_MUSIC maps town and cafe tracks, other rooms to null', () => {
  assert.equal(ROOM_MUSIC.town, '/audio/lumen_bay_morning.m4a');
  assert.equal(ROOM_MUSIC.cafe, '/audio/cafe_hours.m4a');
  assert.equal(ROOM_MUSIC.poolside ?? null, null);
});

test('music volume defaults to normal (0.5), cycles through low (0.3) and off (0), and persists in storage', () => {
  music.setLevel('normal');
  assert.equal(music.getLevel(), 'normal');
  assert.equal(MUSIC_VOLUMES.normal, 0.5);
  assert.equal(storage.pixel_pool_music, 'normal');

  music.cycleLevel();
  assert.equal(music.getLevel(), 'low');
  assert.equal(MUSIC_VOLUMES.low, 0.3);
  assert.equal(storage.pixel_pool_music, 'low');

  music.cycleLevel();
  assert.equal(music.getLevel(), 'off');
  assert.equal(MUSIC_VOLUMES.off, 0);
  assert.equal(storage.pixel_pool_music, 'off');

  music.cycleLevel();
  assert.equal(music.getLevel(), 'normal');

  // Test private mode / storage throw resilience
  const origSet = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  assert.doesNotThrow(() => music.setLevel('low'));
  localStorage.setItem = origSet;
});

test('autoplay rule: AudioContext starts suspended and town room fades in after first gesture', async () => {
  music.destroy();
  FakeAudioContext.instances = [];

  const ctx = sound.getContext();
  ctx.state = 'suspended';
  music.setLevel('normal');

  // Enter town room
  music.playForRoom('town');
  // Wait for fetch + decode promise microtasks
  await new Promise((r) => setTimeout(r, 10));

  // Audio should not have started playing while context is suspended
  assert.equal(ctx.resumeCalls, 0);

  // First user gesture (tap/pointerdown on window)
  win.dispatchEvent(new Event('pointerdown'));
  await new Promise((r) => setTimeout(r, 10));

  // Audio context should have resumed
  assert.equal(ctx.state, 'running');
  assert.ok(ctx.resumeCalls >= 1);

  // A source should now be active, looping, and fading in over 1.5s
  assert.ok(ctx.sources.length >= 1);
  const active = ctx.sources.at(-1);
  assert.equal(active.loop, true);
  assert.equal(active.startedAt, ctx.currentTime);

  const gain = ctx.gains.at(-1);
  assert.ok(gain.gain.ramps.some((r) => r.val === 1 && r.time === ctx.currentTime + 1.5));
});

test('playForRoom with same track keeps playing and does not restart', async () => {
  const ctx = sound.getContext();
  const sourceCountBefore = ctx.sources.length;

  music.playForRoom('town');
  await new Promise((r) => setTimeout(r, 10));

  // No new source should have been created
  assert.equal(ctx.sources.length, sourceCountBefore);
});

test('room change town → café crossfades from town song to café song (0.8s out, 1.5s in)', async () => {
  const ctx = sound.getContext();
  const townSource = ctx.sources.at(-1);
  const townGain = ctx.gains.at(-1);

  music.playForRoom('cafe');
  await new Promise((r) => setTimeout(r, 10));

  // Old town source fades out over 0.8s and stops at now + 0.8
  assert.equal(townSource.stoppedAt, ctx.currentTime + 0.8);
  assert.ok(townGain.gain.ramps.some((r) => r.val === 0 && r.time === ctx.currentTime + 0.8));

  // New cafe source started immediately and ramps to 1 at now + 1.5
  const cafeSource = ctx.sources.at(-1);
  assert.notEqual(cafeSource, townSource);
  assert.equal(cafeSource.loop, true);
  assert.equal(cafeSource.startedAt, ctx.currentTime);
  const cafeGain = ctx.gains.at(-1);
  assert.ok(cafeGain.gain.ramps.some((r) => r.val === 1 && r.time === ctx.currentTime + 1.5));
});

test('room change café → town crossfades back (0.8s out, 1.5s in)', async () => {
  const ctx = sound.getContext();
  const cafeSource = ctx.sources.at(-1);
  const cafeGain = ctx.gains.at(-1);

  music.playForRoom('town');
  await new Promise((r) => setTimeout(r, 10));

  // Old cafe source fades out over 0.8s
  assert.equal(cafeSource.stoppedAt, ctx.currentTime + 0.8);
  assert.ok(cafeGain.gain.ramps.some((r) => r.val === 0 && r.time === ctx.currentTime + 0.8));

  // New town source started immediately and ramps to 1 over 1.5s
  const townSource = ctx.sources.at(-1);
  assert.notEqual(townSource, cafeSource);
  assert.equal(townSource.loop, true);
  assert.equal(townSource.startedAt, ctx.currentTime);
  const townGain = ctx.gains.at(-1);
  assert.ok(townGain.gain.ramps.some((r) => r.val === 1 && r.time === ctx.currentTime + 1.5));
});

test('room change to unmapped room (poolside) fades out over 0.8s and stops', async () => {
  const ctx = sound.getContext();
  const activeSource = ctx.sources.at(-1);
  const activeGain = ctx.gains.at(-1);

  music.playForRoom('poolside');
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(activeSource.stoppedAt, ctx.currentTime + 0.8);
  assert.ok(activeGain.gain.ramps.some((r) => r.val === 0 && r.time === ctx.currentTime + 0.8));

  activeSource.end();
  assert.equal(music.isPlaying(), false);
});

test('switching tabs suspends audio; returning resumes audio', async () => {
  music.playForRoom('town');
  win.dispatchEvent(new Event('pointerdown'));
  await new Promise((r) => setTimeout(r, 10));

  const ctx = sound.getContext();
  const suspendsBefore = ctx.suspendCalls;
  const resumesBefore = ctx.resumeCalls;

  // Tab hidden
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(ctx.suspendCalls > suspendsBefore);

  // Tab visible again
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(ctx.resumeCalls > resumesBefore);
});

test('playStartChime resumes AudioContext, plays chime once through master gain, and starts queued room music fade-in', async () => {
  music.destroy();
  const ctx = sound.getContext();
  ctx.state = 'suspended';
  music.setLevel('normal');

  // Queue town room
  music.playForRoom('town');
  await new Promise((r) => setTimeout(r, 10));

  // Not playing yet while suspended
  assert.equal(ctx.state, 'suspended');

  // Player triggers start chime (tap anywhere / START button / Enter key)
  await music.playStartChime();
  await new Promise((r) => setTimeout(r, 10));

  // 1) Context is resumed
  assert.equal(ctx.state, 'running');

  // 2) Chime played once (loop = false) and connects to masterGain
  const chimeSource = ctx.sources.find((s) => s.loop === false && s.startedAt !== null);
  assert.ok(chimeSource, 'chime source must be created and started');
  assert.equal(chimeSource.loop, false);
  assert.ok(chimeSource.destination, 'chime must be connected');
  // masterGain connects to destination
  assert.equal(chimeSource.destination.destination, ctx.destination);

  // 3) Room music fades in as usual (loop = true, ramp to 1 over 1.5s)
  const roomSource = ctx.sources.find((s) => s.loop === true && s.startedAt !== null);
  assert.ok(roomSource, 'room music must be started');
  assert.equal(roomSource.loop, true);
  assert.ok(ctx.gains.some((g) => g.gain.ramps.some((r) => r.val === 1 && r.time === ctx.currentTime + 1.5)));
});

test('playStartChime respects Music Off/Low/Normal setting via master gain', async () => {
  const ctx = sound.getContext();

  music.setLevel('off');
  await music.playStartChime();
  const master = ctx.gains.findLast((g) => g.destination === ctx.destination);
  assert.ok(master);
  assert.equal(master.gain.value, 0);

  music.setLevel('low');
  assert.equal(master.gain.value, 0.3);

  music.setLevel('normal');
  assert.equal(master.gain.value, 0.5);
});

test('tryAutoPlay attempts to resume suspended context and begins playback if allowed', async () => {
  music.destroy();
  const ctx = sound.getContext();
  ctx.state = 'suspended';
  music.setLevel('normal');

  music.playForRoom('town');
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(ctx.state, 'suspended');

  await music.tryAutoPlay();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(ctx.state, 'running');
  assert.equal(music.isPlaying(), true);
});

