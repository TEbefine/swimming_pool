import React, { useEffect, useMemo, useState } from 'react';
import './LoadingScene.css';

/**
 * Loading scene shown INSIDE the game screen (Game Boy window on mobile, arcade screen on desktop).
 * Pixel world that moves (pan, clouds, grass, seeds, cloud shadow) + a real-photo NPC "standee"
 * who only breathes. Art lives in /public/ui/loading/ (the service worker caches /ui/).
 */

interface LoadingSceneProps {
  roomId: string;
  roomName: string;
  progress: number; // 0..100
  ready: boolean; // assets loaded, waiting for the player
  leaving: boolean; // fading out
  onEnter: () => void;
}

const PHRASES: Record<string, string[]> = {
  cafe: ['Brewing coffee', 'Warming the cups', 'Wiping the tables', 'Picking today’s song'],
  poolside: ['Filling the pool', 'Checking the water', 'Setting out the floats'],
  club: ['Tuning the decks', 'Dimming the lights', 'Picking tonight’s genre'],
  default: ['Waking up the town', 'Opening the windows', 'Saying good morning'],
};

const phrasesFor = (roomId: string) => {
  const key = Object.keys(PHRASES).find((k) => roomId.toLowerCase().includes(k));
  return PHRASES[key ?? 'default'];
};

// Pre-baked seed positions so every render is stable (no Math.random in render).
const SEEDS = Array.from({ length: 14 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${4 + r(1) * 70}%`,
    top: `${52 + r(2) * 40}%`,
    size: r(3) > 0.6 ? 3 : 2,
    dur: `${9 + r(4) * 8}s`,
    delay: `${-r(5) * 16}s`,
  };
});

export const LoadingScene: React.FC<LoadingSceneProps> = ({ roomId, roomName, progress, ready, leaving, onEnter }) => {
  const phrases = useMemo(() => phrasesFor(roomId), [roomId]);
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    if (ready) return;
    const t = window.setInterval(() => setPhraseIdx((i) => (i + 1) % phrases.length), 2200);
    return () => window.clearInterval(t);
  }, [ready, phrases.length]);

  return (
    <div
      className={`ls-root ${ready ? 'ls-ready' : ''} ${leaving ? 'ls-leaving' : ''}`}
      onPointerDown={ready ? (e) => { e.preventDefault(); onEnter(); } : undefined}
      role="status"
      aria-label={ready ? 'Tap to enter' : 'Loading'}
    >
      {/* 1. Pixel world (pans slowly) */}
      <div className="ls-world">
        <img className="ls-bg" src="/ui/loading/meadow.webp" alt="" draggable={false} />
        <img className="ls-cloud ls-cloud-a" src="/ui/loading/cloud.webp" alt="" draggable={false} />
        <img className="ls-cloud ls-cloud-b" src="/ui/loading/cloud.webp" alt="" draggable={false} />
        <div className="ls-shade" />
      </div>

      {/* 2. Sunlight */}
      <div className="ls-sun" />

      {/* 3. The NPC standee (real photo, only breathes) */}
      <div className="ls-npc">
        <div className="ls-npc-shadow" />
        <img className="ls-npc-img" src="/ui/loading/barista_stand.webp" alt="The café barista" draggable={false} />
      </div>

      {/* 4. Foreground grass in front of her feet (same pan as the world, plus wind sway) */}
      <div className="ls-world ls-front">
        <img className="ls-grass" src="/ui/loading/grass.webp" alt="" draggable={false} />
      </div>

      {/* 5. Seeds drifting on the wind */}
      <div className="ls-seeds" aria-hidden="true">
        {SEEDS.map((s, i) => (
          <span
            key={i}
            className="ls-seed"
            style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDuration: s.dur, animationDelay: s.delay }}
          />
        ))}
      </div>

      {/* 6. Text */}
      <div className="ls-title">
        <span className="ls-room">{roomName}</span>
      </div>

      <div className="ls-card">
        <span className="ls-card-name">BARISTA</span>
        <span className="ls-card-line">Take it easy today.</span>
      </div>

      <div className="ls-bottom">
        {ready ? (
          <span className="ls-enter">TAP TO ENTER</span>
        ) : (
          <>
            <span className="ls-phrase" key={phraseIdx}>
              {phrases[phraseIdx]}
              <span className="ls-dots" />
            </span>
            <span className="ls-bar">
              <span className="ls-bar-fill" style={{ width: `${Math.round(progress)}%` }} />
            </span>
          </>
        )}
      </div>
    </div>
  );
};
