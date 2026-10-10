import React, { useEffect, useRef } from 'react';
import { drawReelBar, REEL_BAR_H, REEL_BAR_W, useFishingView } from '../game/story/fishingSession';
import type { FishingView } from '../game/story/fishingSession';
import { startVisibleAnimation } from '../ui/visibleAnimation';

// Fishing HUD: ONE short line at the bottom of the screen + a small catch card. In front-facing rooms
// (Quiet Bay: you face the camera, the float is in the water at the bottom) both go to the TOP instead.
// Everything else (rod, float, splash, reel bar, the fish held up) is drawn in the world
// by game/story/fishingSession.ts. Buttons are the real controller: ◯ / E and ✕ / Esc.

/** The big reel bar on the right side of the screen (Stardew-style). */
const ReelBar: React.FC<{ compact: boolean; phase: FishingView['phase']; aiming: boolean }> = ({ compact, phase, aiming }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stop = () => {};
    const start = () => {
      stop();
      stop = startVisibleAnimation(
        (now) => drawReelBar(ctx, now, motion.matches),
        compact || motion.matches ? 30 : 60,
      );
    };
    start();
    motion.addEventListener('change', start);
    return () => {
      stop();
      motion.removeEventListener('change', start);
    };
  }, [compact, phase, aiming]);
  const scale = compact ? 1.5 : 2;
  return (
    <canvas
      ref={ref}
      width={REEL_BAR_W}
      height={REEL_BAR_H}
      className={`absolute ${compact ? 'right-1' : 'right-6'} top-[54%] -translate-y-1/2 drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]`}
      style={{ height: `min(${REEL_BAR_H * scale}px, 78%)`, aspectRatio: `${REEL_BAR_W} / ${REEL_BAR_H}`, imageRendering: 'pixelated' }}
    />
  );
};

const PANEL = 'bg-[#FFF6E5] border-2 border-[#4A2E1A] text-[#4A2E1A] shadow-[0_2px_0_#4A2E1A]';

export const FishingHud: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const v = useFishingView();
  if (!v.active) return null;

  const key = compact ? '◯' : 'E';
  const stop = compact ? '✕' : 'Esc';
  const again = `Hold ${key} to cast again · ${stop} Stop`;
  const over = v.phase === 'caught' || v.phase === 'escaped' || v.phase === 'scared' || v.phase === 'stolen';

  const holdKey = `Hold ${key}`;
  let line = '';
  if (v.tired) line = `Too tired to cast again. Time to go home and rest. · ${stop} Stop`;
  else if (v.aiming) line = 'Let go to cast! Gold = Nice';
  else if (v.phase === 'ready') line = `${holdKey} to power up, let go to cast · ${stop} Stop`;
  else if (v.phase === 'waiting') line = v.landed ? 'Wait for it... (not on the nibbles)' : '';
  else if (v.phase === 'bite') line = `It turned! PULL! ${key}`;
  else if (v.phase === 'reel') line = compact ? `Tap ${key} to keep the fish in the net` : `Tap or hold ${key} to keep the fish in the net`;
  else if (v.phase === 'scared') line = `Too early. Don't pull when it bites... · ${again}`;
  else if (v.phase === 'stolen') line = `Too slow. It stole the bait. · ${again}`;
  else if (v.phase === 'escaped') line = `It slipped away. · ${again}`;
  else if (v.phase === 'caught') line = again;

  const info = v.info;
  const text = compact ? 'text-[11px]' : 'text-[15px]';
  const small = compact ? 'text-[9px]' : 'text-[12px]';

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" style={{ fontFamily: 'var(--font-pixel)' }}>
      {(v.aiming || v.phase === 'reel' || v.phase === 'caught' || v.phase === 'escaped') && <ReelBar compact={compact} phase={v.phase} aiming={v.aiming} />}

      {/* catch card */}
      {info && v.caught && over && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 ${compact ? `${v.front ? 'top-1' : 'bottom-7'} w-[88%] p-1 gap-1.5` : `${v.front ? 'top-[100px]' : 'bottom-[218px]'} w-[460px] p-2 gap-3`} ${PANEL} rounded-md flex items-center`}
          style={info.tier ? { boxShadow: `0 0 0 2px ${info.tierColor}, 0 2px 0 #4A2E1A` } : undefined}
        >
          <img
            src={info.icon}
            alt=""
            className={compact ? 'w-8 h-8' : 'w-12 h-12'}
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/sprites/items/mackerel.webp'; e.currentTarget.style.filter = 'grayscale(1) brightness(0.9)'; }}
          />
          <div className="flex flex-col min-w-0 gap-0.5">
            <span className={`${text} flex flex-wrap items-baseline gap-x-1.5`}>
              {info.tier && (
                <span className={`${small} px-1 rounded-sm text-white`} style={{ background: info.tierColor }}>{info.tier}</span>
              )}
              <span>{info.name}!</span>
              {v.sizeCm !== null && <span className="opacity-80">{v.sizeCm} cm</span>}
              {v.mode === 'story' && <span className="text-[#6E9E5A]">+1 Bag</span>}
              {info.isNew && <span className="text-[#6E9E5A]">NEW!</span>}
              {v.perfect && <span className="text-[#B8860B]">Perfect!</span>}
              {v.record && <span className="text-[#9C4A3E]">New record!</span>}
            </span>
            <span className="opacity-75 leading-snug truncate" style={{ fontFamily: 'var(--font-pixel)', fontSize: compact ? 11 : 15 }}>
              {info.note}
            </span>
          </div>
        </div>
      )}

      {/* one-line hint */}
      {line && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${compact ? `${v.front ? 'top-[46px]' : 'bottom-1'} max-w-[96%] px-2 py-0.5` : `${v.front ? 'top-[178px]' : 'bottom-[172px]'} max-w-[80%] px-4 py-1.5`} ${PANEL} rounded-md ${text} text-center whitespace-nowrap overflow-hidden text-ellipsis`}>
          {line}
        </div>
      )}
    </div>
  );
};
