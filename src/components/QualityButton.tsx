import React, { useSyncExternalStore } from 'react';
import { Gauge } from 'lucide-react';
import { quality, TIER_LABEL } from '../game/quality';

const HINT: Record<string, string> = {
  auto: 'Picks the best look your device can keep cool',
  beautiful: 'Smoothest motion, every sparkle',
  balanced: 'Smooth and cool for long sessions',
  battery: 'Coolest, longest battery — same art',
};

/** One tap cycles Auto → Beautiful → Balanced → Battery. */
export const QualityButton: React.FC<{ variant?: 'menu' | 'header' }> = ({ variant = 'header' }) => {
  const q = useSyncExternalStore(quality.subscribe, quality.getSnapshot, quality.getSnapshot);
  const label = q.mode === 'auto' ? `Auto · ${TIER_LABEL[q.tier]}` : TIER_LABEL[q.mode];

  if (variant === 'menu') {
    return (
      <button
        onClick={() => quality.cycleMode()}
        className="w-full pixel-btn py-2 text-[16px] justify-between flex items-center gap-2 mt-2"
        title={HINT[q.mode]}
      >
        <span className="flex items-center gap-2"><Gauge size={14} className="text-emerald-300" /> Quality</span>
        <span className="font-bold text-emerald-200">{label}</span>
      </button>
    );
  }
  return (
    <button onClick={() => quality.cycleMode()} className="pixel-btn flex items-center gap-2" title={`Quality: ${HINT[q.mode]}`}>
      <Gauge size={14} className="text-emerald-300" />
      <span className="hidden md:inline text-[16px]">{label}</span>
    </button>
  );
};
