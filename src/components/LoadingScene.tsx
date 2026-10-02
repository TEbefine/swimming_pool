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
  isMobile?: boolean;
  onEarlyTouch?: () => void;
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

// ---- wind particles (pixel sprites in /ui/loading/p_*.webp) ----
type Kind = 'seed' | 'petal' | 'leaf';
const SPRITE: Record<Kind, { src: string; n: number; ar: number; fdur: string; spin: string; spinDur: string }> = {
  seed: { src: '/ui/loading/p_seed.webp', n: 4, ar: 41 / 46, fdur: '6s', spin: 'ls-rock', spinDur: '7s' },
  petal: { src: '/ui/loading/p_petal.webp', n: 4, ar: 38 / 36, fdur: '3.2s', spin: 'ls-rock', spinDur: '6s' },
  leaf: { src: '/ui/loading/p_leaf.webp', n: 2, ar: 38 / 42, fdur: '4s', spin: 'ls-rock', spinDur: '8s' },
};
interface P { kind: Kind; left: string; top: string; size: number; dur: string; delay: string; path: string; depth?: 'near' | 'far' }

// Few pieces, each with its own path, speed and depth (near = big + soft, far = small).
const AMBIENT: P[] = [
  { kind: 'seed', left: '6%', top: '56%', size: 4.4, dur: '46s', delay: '-8s', path: 'ls-path-a' },
  { kind: 'petal', left: '-2%', top: '64%', size: 2.8, dur: '38s', delay: '-20s', path: 'ls-path-c' },
  { kind: 'petal', left: '14%', top: '80%', size: 2.2, dur: '52s', delay: '-34s', path: 'ls-path-a', depth: 'far' },
  { kind: 'leaf', left: '-8%', top: '76%', size: 6, dur: '34s', delay: '-4s', path: 'ls-path-b', depth: 'near' },
];
// One gust = a quick burst, mostly petals (they come from the meadow flowers).
const GUST: P[] = [
  { kind: 'petal', left: '-6%', top: '70%', size: 3, dur: '9s', delay: '0s', path: 'ls-path-gust' },
  { kind: 'seed', left: '-8%', top: '56%', size: 3.6, dur: '11s', delay: '0.8s', path: 'ls-path-gust' },
  { kind: 'petal', left: '-10%', top: '80%', size: 2.2, dur: '10s', delay: '1.6s', path: 'ls-path-gust', depth: 'far' },
];
const SPARKS = [
  { left: '18%', top: '86%', delay: '-1s' },
  { left: '52%', top: '90%', delay: '-5s' },
];

const Particle: React.FC<{ p: P }> = ({ p }) => {
  const sp = SPRITE[p.kind];
  return (
    <span
      className={`ls-p ${p.depth === 'near' ? 'ls-near' : ''} ${p.depth === 'far' ? 'ls-far' : ''}`}
      style={{
        left: p.left,
        top: p.top,
        height: `${p.size}cqh`,
        width: `${p.size * sp.ar}cqh`,
        animationName: p.path,
        animationDuration: p.dur,
        animationDelay: p.delay,
      }}
    >
      <span
        className="ls-spr"
        style={{
          backgroundImage: `url(${sp.src})`,
          ['--n' as string]: sp.n,
          ['--fdur' as string]: sp.fdur,
          ['--spin-name' as string]: sp.spin,
          ['--spin-dur' as string]: sp.spinDur,
        } as React.CSSProperties}
      />
    </span>
  );
};

export const LoadingScene: React.FC<LoadingSceneProps> = ({ roomId, roomName, progress, ready, leaving, onEnter, isMobile, onEarlyTouch }) => {
  const phrases = useMemo(() => phrasesFor(roomId), [roomId]);
  const [phraseIdx, setPhraseIdx] = useState(0);

  // A soft breeze: first one after 6s, then every ~24s. Everything reacts together.
  const [gust, setGust] = useState(0);
  const [gusting, setGusting] = useState(false);
  useEffect(() => {
    let off: number | undefined;
    const blow = () => {
      setGust((g) => g + 1);
      setGusting(true);
      window.clearTimeout(off);
      off = window.setTimeout(() => setGusting(false), 7000);
    };
    const first = window.setTimeout(blow, 6000);
    const every = window.setInterval(blow, 24000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.clearTimeout(off);
    };
  }, []);

  useEffect(() => {
    if (ready) return;
    const t = window.setInterval(() => setPhraseIdx((i) => (i + 1) % phrases.length), 3400);
    return () => window.clearInterval(t);
  }, [ready, phrases.length]);

  const enterLabel = isMobile ? 'Press ◯' : 'Press SPACE';

  return (
    <div
      className={`ls-root ${ready ? 'ls-ready' : ''} ${leaving ? 'ls-leaving' : ''} ${gusting ? 'ls-gusting' : ''}`}
      onPointerDown={ready ? (e) => { e.preventDefault(); onEnter(); } : onEarlyTouch}
      role="status"
      aria-label={ready ? enterLabel : 'Loading'}
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
        {/* the butterfly that comes to rest on her cup */}
        <div className="ls-fly" aria-hidden="true">
          <span className="ls-spr ls-fly-flap" style={{ backgroundImage: 'url(/ui/loading/p_fly.webp)' }} />
          <span className="ls-spr ls-fly-rest" style={{ backgroundImage: 'url(/ui/loading/p_fly.webp)' }} />
        </div>
      </div>

      {/* 4. Foreground grass in front of her feet (same pan as the world, plus wind sway) */}
      <div className="ls-world ls-front">
        <div className="ls-grass-gust">
          <img className="ls-grass" src="/ui/loading/grass.webp" alt="" draggable={false} />
        </div>
      </div>

      {/* 5. Wind: ambient pieces, pollen glints, and a burst on every gust */}
      <div className="ls-particles" aria-hidden="true">
        {AMBIENT.map((p, i) => <Particle key={i} p={p} />)}
        {SPARKS.map((sp, i) => (
          <span key={`s${i}`} className="ls-spark" style={{ left: sp.left, top: sp.top, width: '3.2cqh', height: '3cqh', animationDelay: sp.delay }}>
            <span className="ls-spr" style={{ backgroundImage: 'url(/ui/loading/p_spark.webp)', ['--n' as string]: 2 } as React.CSSProperties} />
          </span>
        ))}
        {gust > 0 && (
          <div className="ls-gust" key={gust}>
            {GUST.map((p, i) => <Particle key={i} p={p} />)}
          </div>
        )}
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
          <span className="ls-enter">{enterLabel}</span>
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
