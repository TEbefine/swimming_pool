import { sound } from '../audio';

export type MusicLevel = 'off' | 'low' | 'normal';

export const MUSIC_VOLUMES: Record<MusicLevel, number> = {
  off: 0,
  low: 0.3,
  normal: 0.5,
};

export const MUSIC_LABELS: Record<MusicLevel, string> = {
  off: 'Off',
  low: 'Low',
  normal: 'Normal',
};

/**
 * Room → track mapping.
 * Adding a song for a new room in the future is just one line.
 * Any room not in the map = silence.
 */
export const ROOM_MUSIC: Record<string, string | null> = {
  town: '/audio/lumen_bay_morning.m4a',
  cafe: '/audio/cafe_hours.m4a',
};

const STORAGE_KEY = 'pixel_pool_music';
const DEFAULT_LEVEL: MusicLevel = 'normal';

export class MusicManager {
  private level: MusicLevel = DEFAULT_LEVEL;
  private currentTrackUrl: string | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private fadingSource: AudioBufferSourceNode | null = null;
  private fadingGain: GainNode | null = null;

  // Keep at most the current decoded buffer in memory (plus old one only during its 0.8s fade)
  private currentBuffer: AudioBuffer | null = null;
  private currentBufferUrl: string | null = null;

  // Single-shot start chime buffer (/audio/start_chime.m4a)
  private chimeBuffer: AudioBuffer | null = null;
  private chimeLoading: Promise<AudioBuffer | null> | null = null;
  private chimeSource: AudioBufferSourceNode | null = null;

  private masterGain: GainNode | null = null;
  private masterGainCtx: AudioContext | null = null;

  private currentRequestId = 0;
  private listeners = new Set<() => void>();
  private gestureListenersAttached = false;

  private pendingStart: {
    buffer: AudioBuffer;
    trackUrl: string;
    requestId: number;
  } | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as MusicLevel | null;
        if (saved && (saved === 'off' || saved === 'low' || saved === 'normal')) {
          this.level = saved;
        }
      } catch {
        this.level = DEFAULT_LEVEL;
      }
      this.setupListeners();
    }

    // Connect with SoundManager so idle suspension is coordinated
    sound.isMusicPlaying = () => this.isPlaying();
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    return sound.getContext();
  }

  private getMasterGain(ctx: AudioContext): GainNode {
    if (!this.masterGain || this.masterGainCtx !== ctx) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(MUSIC_VOLUMES[this.level], ctx.currentTime);
      this.masterGain.connect(ctx.destination);
      this.masterGainCtx = ctx;
    }
    return this.masterGain;
  }

  private setupListeners() {
    if (this.gestureListenersAttached || typeof window === 'undefined') return;
    this.gestureListenersAttached = true;

    const onGesture = () => {
      this.handleUserGesture();
    };

    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
    window.addEventListener('keydown', onGesture, { capture: true, passive: true });

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  private handleUserGesture() {
    const ctx = this.getContext();
    if (!ctx) return;

    const state = ctx.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      void ctx.resume().then(() => {
        this.onContextResumed();
      }).catch(() => {});
    } else if (this.pendingStart) {
      this.onContextResumed();
    }
  }

  private onContextResumed() {
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return;

    if (this.pendingStart && this.pendingStart.requestId === this.currentRequestId) {
      const { buffer, trackUrl, requestId } = this.pendingStart;
      this.pendingStart = null;
      this.startTrack(buffer, trackUrl, ctx.currentTime, requestId);
    }
  }

  private handleVisibilityChange = () => {
    const ctx = this.getContext();
    if (!ctx) return;

    if (document.hidden) {
      if (ctx.state !== 'closed') {
        void ctx.suspend().catch(() => {});
      }
    } else {
      // Visible again: resume if music should be playing
      if (this.currentTrackUrl && this.level !== 'off') {
        const state = ctx.state as string;
        if (state === 'suspended' || state === 'interrupted') {
          void ctx.resume().catch(() => {});
        }
      }
    }
  };

  private handlePageHide = () => {
    const ctx = this.getContext();
    if (ctx && ctx.state !== 'closed') {
      void ctx.suspend().catch(() => {});
    }
  };

  /**
   * Play the background music assigned to a room.
   * Same track as now → keep playing, do not restart.
   * Different track → fade old out over 0.8 s, then fade new in over 1.5 s.
   * Null / unmapped room → fade out over 0.8 s and stop.
   * If the player changes room again while loading, only the latest request wins.
   */
  public playForRoom(roomId: string): void {
    const track = ROOM_MUSIC[roomId] ?? null;
    void this.playTrack(track);
  }

  private async playTrack(targetTrack: string | null): Promise<void> {
    // Same track as currently playing / requested: keep playing, do not restart
    if (targetTrack === this.currentTrackUrl) {
      return;
    }

    this.currentTrackUrl = targetTrack;
    const requestId = ++this.currentRequestId;
    this.pendingStart = null;

    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    let oldFadeEndTime = now;

    // Fade old track out over 0.8s
    if (this.activeSource && this.activeGain) {
      const oldSource = this.activeSource;
      const oldGain = this.activeGain;
      this.activeSource = null;
      this.activeGain = null;

      // Clean up previous fading source if one was still in progress
      if (this.fadingSource) {
        try { this.fadingSource.stop(); } catch {}
        this.fadingSource.disconnect();
        this.fadingGain?.disconnect();
        this.fadingSource = null;
        this.fadingGain = null;
      }

      this.fadingSource = oldSource;
      this.fadingGain = oldGain;
      oldFadeEndTime = now + 0.8;

      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, oldFadeEndTime);

      try {
        oldSource.stop(oldFadeEndTime);
      } catch {}

      oldSource.onended = () => {
        oldSource.onended = null;
        oldSource.disconnect();
        oldGain.disconnect();
        if (this.fadingSource === oldSource) {
          this.fadingSource = null;
          this.fadingGain = null;
        }
        // If switched to silence and nothing is active, release buffer for GC
        if (this.currentTrackUrl === null && !this.activeSource) {
          this.currentBuffer = null;
          this.currentBufferUrl = null;
          if (sound.getActiveSourceCount() === 0 && ctx.state === 'running') {
            void ctx.suspend().catch(() => {});
          }
        }
      };
    }

    if (targetTrack === null) {
      if (!this.fadingSource) {
        this.currentBuffer = null;
        this.currentBufferUrl = null;
      }
      return;
    }

    // Load track only when room is entered
    try {
      const buffer = await this.loadBuffer(targetTrack);
      if (requestId !== this.currentRequestId) {
        // Player changed room again while loading: latest request wins
        return;
      }

      const state = ctx.state as string;
      if (state !== 'running') {
        // Autoplay rule: context is suspended/interrupted until first user gesture
        this.pendingStart = { buffer, trackUrl: targetTrack, requestId };
      } else {
        const startAt = ctx.currentTime;
        this.startTrack(buffer, targetTrack, startAt, requestId);
      }
    } catch {
      // Audio load/decode error catch
    }
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    if (this.currentBufferUrl === url && this.currentBuffer) {
      return this.currentBuffer;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    const ctx = this.getContext();
    if (!ctx) throw new Error('No AudioContext');
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    this.currentBuffer = decoded;
    this.currentBufferUrl = url;
    return decoded;
  }

  private startTrack(buffer: AudioBuffer, _trackUrl: string, startAt: number, requestId: number) {
    if (requestId !== this.currentRequestId) return;
    const ctx = this.getContext();
    if (!ctx) return;

    if (this.activeSource) {
      try { this.activeSource.stop(); } catch {}
      this.activeSource.disconnect();
      this.activeGain?.disconnect();
      this.activeSource = null;
      this.activeGain = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const trackGain = ctx.createGain();
    // Fade in over 1.5s
    trackGain.gain.setValueAtTime(0, startAt);
    trackGain.gain.linearRampToValueAtTime(1, startAt + 1.5);

    source.connect(trackGain);
    trackGain.connect(this.getMasterGain(ctx));

    try {
      source.start(startAt);
      this.activeSource = source;
      this.activeGain = trackGain;
    } catch {
      // Catch start failures
    }
  }

  /**
   * Attempt to start playback immediately on page load if browser policy allows.
   * If blocked by autoplay policy, safely catches without error and waits for user gesture.
   */
  public async tryAutoPlay(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
      try {
        await ctx.resume();
        this.onContextResumed();
      } catch {
        // Autoplay blocked by browser policy until user gesture
      }
    } else {
      this.onContextResumed();
    }
  }

  /**
   * Preload start chime so it is already decoded and ready in memory
   * when the player taps / presses START.
   */
  public preloadStartChime(): void {
    void this.loadChimeBuffer();
  }

  private async loadChimeBuffer(): Promise<AudioBuffer | null> {
    if (this.chimeBuffer) return this.chimeBuffer;
    const ctx = this.getContext();
    if (!ctx) return null;

    if (!this.chimeLoading) {
      this.chimeLoading = (async () => {
        try {
          const res = await fetch('/audio/start_chime.m4a');
          if (!res.ok) return null;
          const ab = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(ab);
          this.chimeBuffer = decoded;
          return decoded;
        } catch {
          return null;
        } finally {
          this.chimeLoading = null;
        }
      })();
    }
    return this.chimeLoading;
  }

  /**
   * Resumes the shared AudioContext (first user gesture), plays /audio/start_chime.m4a
   * once through the music manager's master gain (respecting Off/Low/Normal setting),
   * and triggers the room background music fade-in.
   */
  public async playStartChime(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;

    // 1) Resume the shared AudioContext (this is the first user gesture)
    if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
      try {
        await ctx.resume();
      } catch {}
    }

    // Trigger queued room background music fade in (3: room music fades in as usual)
    this.onContextResumed();

    // 2) Play /audio/start_chime.m4a once through the music manager's master gain
    try {
      const buffer = await this.loadChimeBuffer();
      if (!buffer || ctx.state === 'closed') return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = false;

      const master = this.getMasterGain(ctx);
      source.connect(master);
      this.chimeSource = source;

      source.onended = () => {
        source.onended = null;
        try { source.disconnect(); } catch {}
        if (this.chimeSource === source) {
          this.chimeSource = null;
        }
      };

      source.start(ctx.currentTime);
    } catch {
      // Audio error catch
    }
  }

  public isPlaying(): boolean {
    return (this.activeSource !== null || this.fadingSource !== null || this.chimeSource !== null) && this.level !== 'off';
  }

  public getLevel(): MusicLevel {
    return this.level;
  }

  public setLevel(level: MusicLevel): void {
    this.level = level;
    try {
      localStorage.setItem(STORAGE_KEY, level);
    } catch {
      // Storage unavailable in private browsing
    }

    const ctx = this.getContext();
    if (ctx) {
      const master = this.getMasterGain(ctx);
      const vol = MUSIC_VOLUMES[level];
      master.gain.setValueAtTime(vol, ctx.currentTime);
    }

    if (level !== 'off' && this.currentTrackUrl) {
      this.handleUserGesture();
    }

    this.notify();
  }

  public cycleLevel(): void {
    const levels: MusicLevel[] = ['normal', 'low', 'off'];
    const nextIdx = (levels.indexOf(this.level) + 1) % levels.length;
    this.setLevel(levels[nextIdx]);
  }

  public getSnapshot = (): MusicLevel => this.level;

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  public destroy(): void {
    if (this.chimeSource) {
      try { this.chimeSource.stop(); } catch {}
      this.chimeSource.disconnect();
      this.chimeSource = null;
    }
    this.chimeBuffer = null;
    this.chimeLoading = null;

    if (this.activeSource) {
      try { this.activeSource.stop(); } catch {}
      this.activeSource.disconnect();
      this.activeGain?.disconnect();
      this.activeSource = null;
      this.activeGain = null;
    }
    if (this.fadingSource) {
      try { this.fadingSource.stop(); } catch {}
      this.fadingSource.disconnect();
      this.fadingGain?.disconnect();
      this.fadingSource = null;
      this.fadingGain = null;
    }
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
      this.masterGainCtx = null;
    }
    this.currentBuffer = null;
    this.currentBufferUrl = null;
    this.currentTrackUrl = null;
    this.pendingStart = null;
    this.currentRequestId++;
  }
}

export const music = new MusicManager();
