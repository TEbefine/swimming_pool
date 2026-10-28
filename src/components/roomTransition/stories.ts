/** A destination's short story is independent of the room's actual asset loading. */
export interface TransitionStory {
  id: string;
  roomId: string;
  background: string;
  character: string;
  line: string;
  effect: 'train' | 'reading' | 'bay';
  fish?: string;
  minimumMs?: number;
  garden?: string;
  foliage?: string;
  steam?: string;
  bird?: string;
  leaf?: string;
  spark?: string;
}

// Add a new, reviewed scene here. Keep images small, local and independent of room readiness.
export const TRANSITION_STORIES: readonly TransitionStory[] = [
  {
    id: 'cafe-sun-reading-v1', roomId: 'cafe',
    background: '/ui/loading/cafe-reading/cafe-v1.webp',
    character: '/ui/loading/cafe-reading/sun-v1.webp',
    garden: '/ui/loading/cafe-reading/garden-v1.webp',
    foliage: '/ui/loading/cafe-reading/leaves-v1.webp',
    steam: '/ui/loading/cafe-reading/steam-v1.webp',
    bird: '/ui/loading/cafe-reading/bird-v1.webp',
    leaf: '/ui/loading/cafe-reading/leaf-v1.webp',
    spark: '/ui/loading/cafe-reading/spark-v1.webp',
    line: 'Just one chapter today. Small is enough.', effect: 'reading', minimumMs: 5000,
  },
  {
    id: 'bay-kai-trophy-v1', roomId: 'lake_pier',
    background: '/ui/loading/bay-fishing/bay-v1.webp',
    character: '/ui/loading/bay-fishing/kai-v1.webp',
    fish: '/ui/loading/bay-fishing/yellowtail-v1.webp',
    spark: '/ui/loading/cafe-reading/spark-v1.webp',
    line: 'A catch worth waiting for.', effect: 'bay', minimumMs: 5000,
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
