/** A destination's short story is independent of the room's actual asset loading. */
export interface TransitionStory {
  id: string;
  roomId: string;
  background: string;
  character: string;
  line: string;
  effect: 'train';
}

// Add a new, reviewed scene here. Keep images small, local and independent of room readiness.
export const TRANSITION_STORIES: readonly TransitionStory[] = [
  {
    id: 'cafe-sun-train', roomId: 'cafe',
    background: '/maps/thumbs/cafe.webp',
    character: '/ui/stories/sun-window.webp',
    line: 'Sun watches the train pass.', effect: 'train',
  },
];

/** Select fairly, avoiding the last story when there is a choice. Injectable for tests. */
export function pickStory(stories: readonly TransitionStory[], roomId: string, lastId?: string, random = Math.random): TransitionStory | null {
  const available = stories.filter((story) => story.roomId === roomId);
  const alternatives = available.filter((story) => story.id !== lastId);
  const options = alternatives.length ? alternatives : available;
  if (!options.length) return null;
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}
