import { useLayoutEffect, useRef } from 'react';
import type { PreparedStory } from './usePreparedStory';
import type { TransitionStory } from './stories';
import './roomTransition.css';

interface Props { roomName: string; story: PreparedStory | null; fallbackStory?: TransitionStory | null }

/** Reuse already decoded image nodes; artwork never gates destination readiness. */
export function RoomTransition({ roomName, story, fallbackStory = null }: Props) {
  const backgroundHost = useRef<HTMLDivElement>(null);
  const characterHost = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!story) return;
    story.background.className = 'rt-background';
    story.character.className = 'rt-character';
    backgroundHost.current?.appendChild(story.background);
    characterHost.current?.appendChild(story.character);
    return () => { story.background.remove(); story.character.remove(); };
  }, [story]);
  const scene = story?.story ?? fallbackStory;
  return (
    <div className="rt-root" role="status" aria-label={`Going to ${roomName}`}>
      {scene && <>
        {story ? <div ref={backgroundHost} /> : <img className="rt-background" src={scene.background} alt="" draggable={false} />}
        {scene.effect === 'train' && <div className="rt-window" aria-hidden="true"><div className="rt-train" /></div>}
        {story ? <div ref={characterHost} /> : <img className="rt-character" src={scene.character} alt="" draggable={false} />}
      </>}
      <div className="rt-caption">
        <span className="rt-destination">{roomName}</span>
        <span className="rt-line">{scene ? scene.line : 'A little moment...'}</span>
      </div>
    </div>
  );
}
