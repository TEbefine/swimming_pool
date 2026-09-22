class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    const saved = localStorage.getItem('pixel_pool_muted');
    if (saved !== null) {
      this.muted = saved === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    localStorage.setItem('pixel_pool_muted', String(muted));
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Water splash sound (noise filtered + bubble drop)
  public playSplash() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // 1. White noise burst
      const bufferSize = this.ctx.sampleRate * 0.25;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.exponentialRampToValueAtTime(150, t + 0.25);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);

      // 2. Bubbly tone
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      oscGain.gain.setValueAtTime(0.2, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch {
      // Audio error catch
    }
  }

  // Soft footstep tap on poolside tiles
  public playFootstep() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.05);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch {
      // Audio error catch
    }
  }

  // Retro message chime
  public playChatChime() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      const notes = [587.33, 880]; // D5, A5
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);

        gain.gain.setValueAtTime(0.12, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.14);
      });
    } catch {
      // Audio error catch
    }
  }

  // Emote jingle based on action
  public playEmoteSound(action: string) {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      let notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      let type: OscillatorType = 'triangle';

      if (action === 'happy') {
        notes = [523.25, 659.25, 783.99, 1046.5]; // C, E, G, C
        type = 'square';
      } else if (action === 'surprise') {
        notes = [440, 880];
        type = 'sawtooth';
      } else if (action === 'relax') {
        notes = [440, 554.37, 659.25];
        type = 'sine';
      } else if (action === 'jump') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
        return;
      }

      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t + idx * 0.07);

        gain.gain.setValueAtTime(0.1, t + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(t + idx * 0.07);
        osc.stop(t + idx * 0.07 + 0.16);
      });
    } catch {
      // Audio error catch
    }
  }
}

export const sound = new SoundManager();
