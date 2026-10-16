/* ============================================================
   BOOT SOUND + SHOW ONCE — ported from the approved ui/boot-intro-final.html.
   The sound design (sample offsets, gains, timing, syncMs) is Teera's final version: only TypeScript
   types were added. The one difference from the HTML: the two sounds are no longer base64 inside the
   code — they are public/audio/boot_note.wav and boot_glow.wav (the exact same bytes), fetched and
   decoded here, so the JS bundle stays small. sw.js caches them after the first load.
   Needs an AudioContext that a tap has already unlocked (the "Press START" tap).
   Times come from the animation itself (onCues), so the sound stays in sync if the animation changes.
   ============================================================ */
import { mountBootIntro, type BootCues, type BootOptions } from './bootIntro';

export const BOOT_SOUND = {
  volume: 0.8,       // master level of the whole boot sound (the app's own Sound setting should still be able to mute it)
  // the letters: SWIMMING climbs G4 A4 B4 D5 E5 G5 A5 B5, POOL climbs D5 G5 B5 D6 (G major pentatonic, as playback-rate steps of one music-box G5)
  scale: [0.5, 0.561, 0.63, 0.749, 0.841, 1, 1.122, 1.26, 0.749, 1, 1.26, 1.498],
  blip: 0.3,         // letter pop loudness (x2 inside)
  soft: 2400,        // pops are softened: highs above this many Hz are rolled off (nothing sharp)
  attack: 0.006,     // seconds: how fast a pop speaks (the sample's own 12 ms fade-in is skipped, so it is instant)
  reverb: 0.12,      // a little soft room echo so the pops flow into each other (0 = dry)
  duck: 0.3,         // before the last blink the pops drop to this share of their volume (1 = no drop)
  duckAt: 1500, duckMs: 350,
  endGain: 0.55,     // the ONE ending sound: a clear, low bell (G4) that blooms and fades
  endAt: 40,         // ms after the badge's light band starts
  syncMs: -70,       // nudge ALL sound earlier (-) or later (+) in ms. Phone speakers are a little late, so the sound leads a bit.
                     // If it still feels late, try -110. If it feels early, try -40.
};

export type BootSoundSettings = typeof BOOT_SOUND;

/** The two sounds (were BOOT_SOUND_ASSETS base64 in the HTML; same bytes, now files). */
export const BOOT_SOUND_URLS = { note: "/audio/boot_note.wav", glow: "/audio/boot_glow.wav" } as const;
type BootSoundName = keyof typeof BOOT_SOUND_URLS;

// The raw file bytes, fetched once (during the loading screen when possible, see preloadBootIntro).
let bootBytes: Promise<Record<BootSoundName, ArrayBuffer>> | null = null;
const fetchBytes = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Boot sound ${url}: ${res.status}`);
  return res.arrayBuffer();
};
function loadBootBytes(): Promise<Record<BootSoundName, ArrayBuffer>> {
  if (!bootBytes) {
    bootBytes = Promise.all([fetchBytes(BOOT_SOUND_URLS.note), fetchBytes(BOOT_SOUND_URLS.glow)])
      .then(([note, glow]) => ({ note, glow }));
    bootBytes.catch(() => { bootBytes = null; });   // a failed download may be retried next time
  }
  return bootBytes;
}

export interface BootSound {
  /** pass this to mountBootIntro as options.onCues */
  onCues(c: BootCues): void;
  /** quick fade-out (used when the player skips) */
  stop(): void;
}

export async function createBootSound(ctx: AudioContext, dest: AudioNode | null, overrides: Partial<BootSoundSettings> = {}): Promise<BootSound> {
  const S = { ...BOOT_SOUND, ...overrides };
  const decode = (ab: ArrayBuffer) => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej));   // callback form works on old Safari too
  const bytes = await loadBootBytes();
  // decodeAudioData takes the buffer away, so decode a copy (the cached bytes stay usable for ?boot=1 replays)
  const buf: Record<BootSoundName, AudioBuffer> = { note: await decode(bytes.note.slice(0)), glow: await decode(bytes.glow.slice(0)) };
  const master = ctx.createGain(); master.gain.value = S.volume; master.connect(dest || ctx.destination);
  const sources: AudioBufferSourceNode[] = [];
  let base = 0, revIn: ConvolverNode | null = null, preBus: GainNode | null = null;

  const makeReverb = () => {
    const len = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
    const wet = ctx.createGain(); wet.gain.value = S.reverb;
    conv.connect(lp); lp.connect(wet); wet.connect(master); return conv;
  };
  const hit = (name: BootSoundName, atMs: number, rate: number, gain: number, bus?: AudioNode | null, soft?: boolean) => {
    const t = Math.max(ctx.currentTime, base + (atMs + S.syncMs) / 1000);
    const src = ctx.createBufferSource(); src.buffer = buf[name]; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (soft ? S.attack : 0.004));
    let node: AudioNode = src;
    if (soft && S.soft) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = S.soft; src.connect(lp); node = lp; }
    node.connect(g); g.connect(bus || master);
    if (revIn && S.reverb) g.connect(revIn);
    src.start(t, name === "note" ? 0.012 : 0);          // skip the music-box sample's own 12 ms fade-in so each pop speaks at once
    sources.push(src);
  };

  return {
    onCues(c) {
      base = ctx.currentTime + 0.01;
      revIn = makeReverb();
      preBus = ctx.createGain(); preBus.connect(master);
      const dAt = base + (S.duckAt + S.syncMs) / 1000;                       // pops fade down before the last blink, so the bell stands alone
      preBus.gain.setValueAtTime(1, dAt); preBus.gain.linearRampToValueAtTime(S.duck, dAt + S.duckMs / 1000);
      c.letters.forEach((_, i) => hit("note", c.appear[i], S.scale[i] || 1, S.blip * 2, preBus, true));
      hit("glow", c.sapAt + S.endAt, 1, S.endGain * 1.1);                    // the one ending sound, on the last blink
    },
    stop() {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.12);
      setTimeout(() => { sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }); try { master.disconnect(); } catch { /* gone */ } }, 200);
    },
  };
}

/* ============================================================
   SHOW ONCE — the first open only, like switching on a Game Boy.
   Later opens skip it completely (the app's normal start-up chime plays instead).
   showBootOnce(screenEl, { ctx, dest, sound, force, options }) -> Promise<{ shown, skipped }>
     screenEl  the game screen (position: relative / absolute, with a size)
     ctx       the app's AudioContext, already unlocked by the "Press START" tap (or null = silent)
     dest      the node the sound should go into (the app's sound-effects volume node), or null = speakers
     sound     false when the player has Sound switched off in Options
     force     true to show it again anyway (use for ?boot=1)
   A tap/click on the screen, any key, or window.dispatchEvent(new Event("boot:skip")) skips it (not in the first 0.6 s).
   ============================================================ */
export const BOOT_SEEN_KEY = "swimming_pool.boot.seen.v1";
let bootShownThisPage = false;
function bootAlreadySeen() { try { return localStorage.getItem(BOOT_SEEN_KEY) === "1"; } catch { return false; } }

/** Would showBootOnce() show the intro right now? (Same rule it uses itself; lets the app prepare.) */
export function bootWillShow(force = false): boolean {
  return force || !(bootShownThisPage || bootAlreadySeen());
}

/**
 * Optional warm-up while the loading screen is up: starts downloading the two fonts and the two sounds
 * so the intro starts the instant START is pressed. Does nothing when the intro will not show.
 */
export function preloadBootIntro(force = false): void {
  if (!bootWillShow(force)) return;
  void loadBootBytes().catch(() => { /* the intro then plays silent */ });
  try {
    void document.fonts.load('italic 800 16px "Rubik"').catch(() => {});
    void document.fonts.load('16px "VT323"').catch(() => {});
  } catch { /* no FontFaceSet: mountBootIntro falls back to system fonts */ }
}

export interface ShowBootOnceOptions {
  ctx?: AudioContext | null;
  dest?: AudioNode | null;
  sound?: boolean;
  force?: boolean;
  options?: Partial<BootOptions>;
  minSkipMs?: number;
}

export async function showBootOnce(parent: HTMLElement, opts: ShowBootOnceOptions = {}): Promise<{ shown: boolean; skipped: boolean }> {
  const { ctx = null, dest = null, sound = true, force = false, options = {}, minSkipMs = 600 } = opts;
  if (!force && (bootShownThisPage || bootAlreadySeen())) return { shown: false, skipped: false };
  bootShownThisPage = true;
  try { localStorage.setItem(BOOT_SEEN_KEY, "1"); } catch { /* private window: it just shows once per page load */ }

  let snd: BootSound | null = null;
  if (ctx && sound) {
    try {
      if (ctx.state === "suspended") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 150))]);
      if (ctx.state === "running") snd = await createBootSound(ctx, dest);
    } catch { snd = null; }                                              // no sound? the picture still plays
  }
  const ac = new AbortController();
  const t0 = performance.now();
  let skipped = false;
  const skip = () => { if (skipped || performance.now() - t0 < minSkipMs) return; skipped = true; ac.abort(); if (snd) snd.stop(); };
  parent.addEventListener("pointerdown", skip);
  window.addEventListener("keydown", skip);
  window.addEventListener("boot:skip", skip);
  try {
    await mountBootIntro(parent, { ...options, signal: ac.signal, onCues: snd ? snd.onCues : undefined });
  } finally {
    parent.removeEventListener("pointerdown", skip);
    window.removeEventListener("keydown", skip);
    window.removeEventListener("boot:skip", skip);
  }
  return { shown: true, skipped };
}
