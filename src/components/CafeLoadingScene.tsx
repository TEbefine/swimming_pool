import type { LoadingSceneProps } from './LoadingScene';
import './CafeLoadingScene.css';

/** Startup café story: photographic Sun, pixel café and one moving pixel train. */
export function CafeLoadingScene({ roomName, progress, ready, leaving, onEnter, isMobile, onEarlyTouch }: LoadingSceneProps) {
  const enterLabel = isMobile ? 'Press ◯' : 'Press SPACE';
  return (
    <div className={`cfl-root ${leaving ? 'cfl-leaving' : ''}`}>
      <div className="cfl-stage">
        <img className="cfl-background" src="/ui/loading/cafe-window-v2.webp" alt="" draggable={false} />
        <div className="cfl-window" aria-hidden="true">
          <img className="cfl-train" src="/sprites/world/train_day.webp" alt="" draggable={false} />
        </div>
        <img className="cfl-sun" src="/ui/loading/sun-cup-v2.webp" alt="Sun, the café server, holding a cup and watching the train" draggable={false} />
      </div>
      <div className="cfl-heading">{roomName}</div>
      <div className="cfl-bottom" role="status" aria-live="polite">
        {ready ? <button type="button" className="cfl-enter" onClick={onEnter}>{enterLabel}</button> : <>
          <span className="cfl-line">A train passes by.</span>
          <span className="cfl-progress" aria-label="Loading café"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span>
        </>}
      </div>
      {/* Keep the existing screen-wide tap-to-enter and early audio-unlock behavior. */}
      <button type="button" className="cfl-surface" aria-label={ready ? `Enter ${roomName}` : `Loading ${roomName}`} disabled={!ready && !onEarlyTouch}
        onClick={ready ? onEnter : onEarlyTouch} />
    </div>
  );
}
