import { useEffect, useState, type RefObject } from 'react';
import { pickStory, TRANSITION_STORIES } from './stories';
import { prepareStory, type PreparedStory } from './prepareStory';
export type { PreparedStory } from './prepareStory';

/** Warm at most one story while idle, never wait for it during travel. */
export function usePreparedStory(busy: boolean, lastByRoom: RefObject<Record<string, string>>): PreparedStory | null {
  const [prepared, setPrepared] = useState<PreparedStory | null>(null);
  useEffect(() => {
    if (busy || !TRANSITION_STORIES.length) return;
    const abort = new AbortController();
    let idleId: number | undefined;
    // Keep the warm set bounded as the catalogue grows. Other destinations use the fallback.
    const rooms = [...new Set(TRANSITION_STORIES.map((story) => story.roomId))];
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    const next = pickStory(TRANSITION_STORIES, room, lastByRoom.current[room]);
    if (!next) return;
    const warm = () => {
      if (abort.signal.aborted || document.hidden) return;
      void prepareStory(next, abort.signal).then((result) => {
        if (abort.signal.aborted) return;
        setPrepared(result);
      });
    };
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(warm, { timeout: 3000 });
      else warm();
    }, 1200);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
    };
  }, [busy, lastByRoom]);
  return prepared;
}
