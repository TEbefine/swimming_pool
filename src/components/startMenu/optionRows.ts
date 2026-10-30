// The rows of the Options screen. Each one reads and changes a REAL setting that already exists
// elsewhere in the game (the header buttons use the same stores), so nothing here is a copy.

import { sound } from '../../game/audio';
import { music, MUSIC_LABELS, type MusicLevel } from '../../game/audio/music';
import { quality, TIER_LABEL, type QualityMode } from '../../game/quality';
import { isVibrationEnabled, setVibrationEnabled, triggerHaptic } from '../../game/haptics';
import type { FloatColor } from '../../game/types';

export interface OptionRow {
  id: string;
  label: string;
  /** Shown in the description box while the cursor is on this row. */
  description: string;
  value(): string;
  /** dir: -1 = left, +1 = right / confirm. */
  change(dir: 1 | -1): void;
}

const step = <T,>(list: readonly T[], current: T, dir: 1 | -1): T =>
  list[(list.indexOf(current) + dir + list.length) % list.length];

const MUSIC_ORDER: readonly MusicLevel[] = ['off', 'low', 'normal'];
const QUALITY_ORDER: readonly QualityMode[] = ['auto', 'beautiful', 'balanced', 'battery'];

const FLOAT_ORDER: readonly FloatColor[] = ['red', 'blue', 'pink', 'yellow', 'black', 'green', 'purple', 'gray'];
const FLOAT_LABEL: Record<FloatColor, string> = {
  red: 'Red', blue: 'Blue', pink: 'Pink', yellow: 'Yellow', black: 'Black', green: 'Green', purple: 'Purple', gray: 'Gray',
};
const readFloat = (): FloatColor => {
  try {
    const saved = localStorage.getItem('pixel_pool_float_color') as FloatColor | null;
    return saved && FLOAT_ORDER.includes(saved) ? saved : 'red';
  } catch {
    return 'red';
  }
};

export const OPTION_ROWS: readonly OptionRow[] = [
  {
    id: 'sound',
    label: 'Sound',
    description: 'Turn all game sound on or off.',
    value: () => (sound.isMuted() ? 'Off' : 'On'),
    change: () => { sound.setMuted(!sound.isMuted()); },
  },
  {
    id: 'music',
    label: 'Music',
    description: 'How loud the background music plays.',
    value: () => MUSIC_LABELS[music.getLevel()],
    change: (dir) => { music.setLevel(step(MUSIC_ORDER, music.getLevel(), dir)); },
  },
  {
    id: 'vibration',
    label: 'Vibration',
    description: 'A small buzz when you press buttons (phones only).',
    value: () => (isVibrationEnabled() ? 'On' : 'Off'),
    change: () => {
      const next = !isVibrationEnabled();
      setVibrationEnabled(next);
      if (next) triggerHaptic(20);
    },
  },
  {
    // Moved here from the shell's top ridge (2026-10-30). App owns the colour (engine + network),
    // so this row reads the saved value and asks App to change it with a 'float:set' event.
    id: 'float',
    label: 'Float ring',
    description: 'The colour of your swim ring in the pool.',
    value: () => FLOAT_LABEL[readFloat()],
    change: (dir) => {
      window.dispatchEvent(new CustomEvent<FloatColor>('float:set', { detail: step(FLOAT_ORDER, readFloat(), dir) }));
    },
  },
  {
    id: 'quality',
    label: 'Quality',
    description: 'Smooth motion or a cooler phone. Auto steps down by itself if it overheats.',
    value: () => {
      const q = quality.getSnapshot();
      return q.mode === 'auto' ? `Auto · ${TIER_LABEL[q.tier]}` : TIER_LABEL[q.mode];
    },
    change: (dir) => { quality.setMode(step(QUALITY_ORDER, quality.getSnapshot().mode, dir)); },
  },
];
