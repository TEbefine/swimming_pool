import type { RoomDefinition } from '../types';
import { poolsideRoom } from './poolside';
import { cafeRoom } from './cafe';

export const rooms: Record<string, RoomDefinition> = {
  poolside: poolsideRoom,
  cafe: cafeRoom,
};

/**
 * Returns the room for the current day based on Asia/Bangkok time.
 * Sat/Sun → poolside, Mon–Fri → café (falls back to poolside until café exists).
 */
export function getRoomForToday(now: Date = new Date()): RoomDefinition {
  const dayName = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(now);

  const isWeekend = dayName === 'Sat' || dayName === 'Sun';
  if (isWeekend) {
    return rooms.poolside;
  }

  // Weekday → café (when it exists), otherwise fall back to poolside
  return rooms.cafe ?? rooms.poolside;
}
