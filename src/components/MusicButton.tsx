import React, { useSyncExternalStore } from 'react';
import { Music } from 'lucide-react';
import { music, MUSIC_LABELS } from '../game/audio/music';

const HINT: Record<string, string> = {
  off: 'Music muted',
  low: 'Gentle background music',
  normal: 'Full background music',
};

export const MusicButton: React.FC<{ variant?: 'menu' | 'header' }> = ({ variant = 'header' }) => {
  const level = useSyncExternalStore(music.subscribe, music.getSnapshot, music.getSnapshot);
  const label = MUSIC_LABELS[level];

  if (variant === 'menu') {
    return (
      <button
        onClick={() => music.cycleLevel()}
        className="w-full pixel-btn py-2 text-[16px] justify-between flex items-center gap-2 mt-2"
        title={HINT[level]}
      >
        <span className="flex items-center gap-2">
          <Music size={14} className={level === 'off' ? 'text-slate-400' : 'text-sky-300'} /> Music
        </span>
        <span className={`font-bold ${level === 'off' ? 'text-slate-400' : 'text-sky-200'}`}>{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => music.cycleLevel()}
      className="pixel-btn flex items-center gap-2"
      title={`Music: ${HINT[level]}`}
    >
      <Music size={14} className={level === 'off' ? 'text-slate-400' : 'text-sky-300'} />
      <span className="hidden md:inline text-[16px]">{label}</span>
    </button>
  );
};
