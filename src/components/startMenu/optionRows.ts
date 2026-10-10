// The rows of the Options screen. Each one reads and changes a REAL setting that already exists
// elsewhere in the game (the header buttons use the same stores), so nothing here is a copy.

import { sound } from '../../game/audio';
import { music, MUSIC_LABELS, type MusicLevel } from '../../game/audio/music';
import { quality, TIER_LABEL, type QualityMode } from '../../game/quality';
import { isVibrationEnabled, setVibrationEnabled, triggerHaptic } from '../../game/haptics';

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
