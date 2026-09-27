import type { RoomDefinition } from '../types';
import { clubElements, CLUB_ACTOR_SCALE, DJ_HOME, DJ_WANDER } from './clubLayout';
import { CITY_OFFSET_X } from '../world/cityView';
import { npcName } from '../content/npcNames';

export type ClubGenre = 'jazz' | 'classical' | 'rock' | 'star_night';

/**
 * Tonight's genre by Bangkok weekday:
 * Mon/Wed: jazz, Tue/Thu: classical, Fri/Sat: rock, Sun: star_night.
 * URL parameter `?genre=` overrides for testing.
 */
export function getTonightGenre(now: Date = new Date()): ClubGenre {
  if (typeof window !== 'undefined') {
    const forced = new URLSearchParams(window.location.search).get('genre');
    if (forced === 'jazz' || forced === 'classical' || forced === 'rock' || forced === 'star_night') {
      return forced;
    }
  }
  const dayName = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(now);

  switch (dayName) {
    case 'Mon':
    case 'Wed':
      return 'jazz';
    case 'Tue':
    case 'Thu':
      return 'classical';
    case 'Fri':
    case 'Sat':
      return 'rock';
    case 'Sun':
    default:
      return 'star_night';
  }
}

// Night Music Club — data-driven layout from clubLayout.ts.
export const clubRoom: RoomDefinition = {
  roomId: 'club',
  name: 'Night Music Club',
  backgroundImage: '/maps/club_room.webp',
  thumbnail: '/maps/thumbs/club.webp',
  icon: '🎵',
  // Open always while testing (plan: nights only)
  schedule: 'always',
  width: 1024,
  height: 576,
  outfit: 'cafe',
  view: { cityOffsetX: CITY_OFFSET_X.club, fixedHour: 21 },

  bounds: { minX: 30, maxX: 994, minY: 300, maxY: 566 },
  spawnPoint: { x: 985, y: 310 },

  walkableZones: [
    { x: 10, y: 300, width: 1004, height: 266 },
  ],

  obstacles: [],
  elements: clubElements,
  actorScale: CLUB_ACTOR_SCALE,

  npcs: [
    {
      id: 'dj', name: npcName('dj'), x: DJ_HOME.x, y: DJ_HOME.y, sprite: '/sprites/npc/dj', facing: DJ_HOME.facing,
      standAt: { dx: 90, dy: 20, facing: -1 },
      wander: { area: DJ_WANDER, speed: 55, pauseMs: [1800, 4200], idlePoses: ['dance1', 'dance2', 'mic', 'wave', 'happy', 'point'] },
    },
  ],

  exits: [
    { triggerBox: [950, 280, 70, 24], targetRoom: 'poolside' },
  ],
};
