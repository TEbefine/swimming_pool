import type { RoomDefinition, RoomSchedule } from '../types';
import { poolsideRoom } from './poolside';
import { cafeRoom } from './cafe';
import { homeRoom } from './home';

export const rooms: Record<string, RoomDefinition> = {
  poolside: poolsideRoom,
  cafe: cafeRoom,
  home: homeRoom,
};

/** All room IDs in display order for the scene selector. */
export const roomIds: string[] = Object.keys(rooms);

/** Check whether a room is open right now (Asia/Bangkok time). */
export function isRoomOpen(room: RoomDefinition, now: Date = new Date()): boolean {
  return isScheduleOpen(room.schedule, now);
}

function isScheduleOpen(schedule: RoomSchedule, now: Date): boolean {
  if (schedule === 'always') return true;
  const dayName = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(now);
  const isWeekend = dayName === 'Sat' || dayName === 'Sun';
  if (schedule === 'weekends') return isWeekend;
  if (schedule === 'weekdays') return !isWeekend;
  return true;
}

/** Human-readable text about when a room opens. */
export function scheduleLabel(room: RoomDefinition): string {
  if (room.schedule === 'always') return 'Always open';
  if (room.schedule === 'weekdays') return 'Mon – Fri';
  return 'Sat – Sun';
}

/** Short label shown when a room is closed. */
export function closedLabel(room: RoomDefinition): string {
  if (room.schedule === 'weekdays') return 'Opens Mon';
  if (room.schedule === 'weekends') return 'Opens Sat';
  return '';
}

/**
 * Returns the default room for the current day based on Asia/Bangkok time.
 * ?room= URL param overrides schedule checks (dev testing).
 * Sat/Sun → poolside, Mon–Fri → café.
 */
export function getRoomForToday(now: Date = new Date()): RoomDefinition {
  // URL override (skip schedule check)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('room');
    if (override && rooms[override]) {
      return rooms[override];
    }
  }

  // Pick first open room by preference order
  const preferenceOrder = ['cafe', 'poolside'];
  for (const id of preferenceOrder) {
    const room = rooms[id];
    if (room && isRoomOpen(room, now)) {
      return room;
    }
  }

  // Fallback
  return rooms.poolside;
}
