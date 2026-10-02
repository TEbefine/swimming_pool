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
  connect() {}
  disconnect() {}
}

class FakeSource {
  buffer = null;
  loop = false;
  startedAt = null;
  stoppedAt = null;
  onended = null;
  connect() {}
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

test('ROOM_MUSIC maps town to lumen bay morning track and other rooms to null', () => {
  assert.equal(ROOM_MUSIC.town, '/audio/lumen_bay_morning.m4a');
  assert.equal(ROOM_MUSIC.cafe ?? null, null);
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

test('room change to cafe fades out old track over 0.8s and stops', async () => {
  const ctx = sound.getContext();
  const activeSource = ctx.sources.at(-1);
  const activeGain = ctx.gains.at(-1);

  music.playForRoom('cafe');
  await new Promise((r) => setTimeout(r, 10));

  // Old source should have scheduled stop at now + 0.8
  assert.equal(activeSource.stoppedAt, ctx.currentTime + 0.8);
  assert.ok(activeGain.gain.ramps.some((r) => r.val === 0 && r.time === ctx.currentTime + 0.8));

  // When stop ends, onended disconnects and cleans up
  activeSource.end();
  assert.equal(music.isPlaying(), false);
});

test('returning to town fades track in again', async () => {
  const ctx = sound.getContext();
  music.playForRoom('town');
  win.dispatchEvent(new Event('pointerdown'));
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(music.isPlaying(), true);
  const newSource = ctx.sources.at(-1);
  assert.equal(newSource.loop, true);
});

test('switching tabs suspends audio; returning resumes audio', async () => {
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
