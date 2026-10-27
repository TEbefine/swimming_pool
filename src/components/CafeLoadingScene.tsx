import { useEffect, useRef, useState } from 'react';
import type { LoadingSceneProps } from './LoadingScene';
import { TRANSITION_STORIES, type TransitionStory } from './roomTransition/stories';
import './CafeLoadingScene.css';

type Props = LoadingSceneProps & { story?: TransitionStory };

/** Supplied photo + pixel layers. Animation never redraws the photo or the café. */
export function CafeLoadingScene({ roomName, ready, leaving, onEnter, isMobile, onEarlyTouch, onPresented, automatic = false, story = TRANSITION_STORIES[0] }: Props) {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    let active = true;
    let firstFrame = 0;
    let secondFrame = 0;
    const images = [...scene.current!.querySelectorAll<HTMLImageElement>('[data-essential]')];
    const listeners: (() => void)[] = [];
    let finished = false;
    const finish = (error: boolean) => {
      if (!active || finished) return;
      finished = true;
      setFailed(error);
      setSettled(true);
      // Count from the scene's painted frame, not when its network request began.
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => { if (active) onPresented?.(); });
      });
    };
    const timer = window.setTimeout(() => finish(true), 3000);
    const wait = (img: HTMLImageElement) => new Promise<void>((resolve, reject) => {
      const done = () => img.naturalWidth ? resolve() : reject(new Error('Artwork unavailable'));
      if (img.complete) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      listeners.push(() => { img.removeEventListener('load', done); img.removeEventListener('error', done); });
    }).then(() => img.decode());
    void Promise.all(images.map(wait)).then(() => finish(false), () => finish(true));
    return () => {
      active = false;
      window.clearTimeout(timer);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      listeners.forEach((remove) => remove());
    };
  }, [story.id, onPresented]);
  const enterLabel = isMobile ? 'Press ◯' : 'Press SPACE';
  const sprite = (src: string | undefined, className: string) => src && <span className={`cfl-sprite ${className}`}><img src={src} alt="" draggable={false} /></span>;
  return (
    <div className={`cfl-root ${settled ? 'cfl-painted' : ''} ${failed ? 'cfl-fallback' : ''} ${hidden ? 'cfl-paused' : ''} ${leaving ? 'cfl-leaving' : ''}`} ref={scene} aria-busy={!ready}>
      <div className="cfl-art" aria-hidden="true">
        <div className="cfl-stage">
          <div className="cfl-window">
            <img data-essential className="cfl-garden" src={story.garden} alt="" draggable={false} />
            <img className="cfl-leaves" src={story.foliage} alt="" draggable={false} />
            <div className="cfl-bird-path">{sprite(story.bird, 'cfl-bird')}</div>
          </div>
          <img data-essential className="cfl-background" src={story.background} alt="" draggable={false} />
        </div>
        <div className="cfl-reader">
          <img data-essential className="cfl-sun" src={story.character} alt="" draggable={false} />
          {sprite(story.steam, 'cfl-steam')}
        </div>
        <div className="cfl-leaf-path">{sprite(story.leaf, 'cfl-leaf')}</div>
        {sprite(story.spark, 'cfl-spark')}
      </div>
      <div className="cfl-caption">
        <span className="cfl-heading">{roomName}</span>
        <span className="cfl-line">{story.line}</span>
      </div>
      <div className="cfl-bottom" role="status" aria-live="polite">
        {ready && !automatic ? <button type="button" className="cfl-enter" onClick={onEnter}>{enterLabel}</button>
          : <span className="cfl-status">{ready ? 'The café is ready.' : 'Opening the café…'}</span>}
      </div>
      {!automatic && <button type="button" className="cfl-surface" aria-label={ready ? `Enter ${roomName}` : `Loading ${roomName}`} disabled={!ready && !onEarlyTouch} onClick={ready ? onEnter : onEarlyTouch} />}
    </div>
  );
}
