import { useLayoutEffect, useRef } from 'react';
import type { PreparedStory } from './usePreparedStory';
import './roomTransition.css';

interface Props { roomName: string; story: PreparedStory | null }

/** Reuse already decoded image nodes; artwork never gates destination readiness. */
export function RoomTransition({ roomName, story }: Props) {
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
  return (
    <div className="rt-root" role="status" aria-label={`Going to ${roomName}`}>
      {story && <>
        <div ref={backgroundHost} />
        {story.story.effect === 'train' && <div className="rt-window" aria-hidden="true"><div className="rt-train" /></div>}
        <div ref={characterHost} />
      </>}
      <div className="rt-caption">
        <span className="rt-destination">{roomName}</span>
        <span className="rt-line">{story ? story.story.line : 'A little moment...'}</span>
      </div>
    </div>
  );
}
