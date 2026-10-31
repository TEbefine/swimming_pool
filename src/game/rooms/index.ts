import type { RoomDefinition, RoomSchedule } from '../types';
import { poolsideRoom } from './poolside';
import { cafeRoom } from './cafe';
import { homeRoom } from './home';
import { clubRoom } from './club';
import { townRoom } from './town';
import { templeRoom } from './temple';
import { dalbitYardRoom } from './dalbitYard';
import { dalbitRiverRoom } from './dalbitRiver';
import { dalbitMarketRoom } from './dalbitMarket';
import { lakePierRoom } from './lakePier';
import { arrivalHallRoom } from './arrivalHall';
import { fishShopRoom } from './fishShop';

export const rooms: Record<string, RoomDefinition> = {
  town: townRoom,
  poolside: poolsideRoom,
  cafe: cafeRoom,
  home: homeRoom,
  club: clubRoom,
  temple: templeRoom,
  dalbit_yard: dalbitYardRoom,
  dalbit_river: dalbitRiverRoom,
  dalbit_market: dalbitMarketRoom,
  lake_pier: lakePierRoom,
  arrival_hall: arrivalHallRoom,
  fish_shop: fishShopRoom, // ECO-04: open to everyone (the server decides if Gen is trading today)
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

// ---- resume where you left off (Teera, 2026-10-30) ---------------------------------------------
// Coming back soon → the map you were on. Away for a long time → the day's default (café / pool),
// like arriving in town fresh. This device only; never a story room, a closed room or a room this
// build doesn't have.
export const RESUME_ROOM = { key: 'sp_last_room_v1', withinMs: 6 * 60 * 60_000 } as const;
interface KeyValue { getItem(key: string): string | null; setItem(key: string, value: string): void }
const deviceStorage = (): KeyValue | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
/** Dalbit story rooms run their own story state: never resume straight into one. */
const isStoryRoomId = (id: string) => id.startsWith('dalbit_');

/** Remember the room the player is in now (called on every room change). */
export function rememberRoom(roomId: string, now: number = Date.now(), storage: KeyValue | null = deviceStorage()): void {
  if (!storage || !rooms[roomId] || isStoryRoomId(roomId)) return;
  try { storage.setItem(RESUME_ROOM.key, JSON.stringify({ id: roomId, at: now })); } catch { /* private mode: just don't remember */ }
}

/** The room to resume, or null if there is none worth resuming. */
export function resumableRoom(now: Date = new Date(), storage: KeyValue | null = deviceStorage()): RoomDefinition | null {
  try {
    const raw = storage?.getItem(RESUME_ROOM.key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof saved.id !== 'string' || typeof saved.at !== 'number' || !Object.hasOwn(rooms, saved.id)) return null;
    const age = now.getTime() - saved.at;
    if (age < 0 || age > RESUME_ROOM.withinMs || isStoryRoomId(saved.id)) return null;
    const room = rooms[saved.id];
    return isRoomOpen(room, now) ? room : null;
  } catch { return null; }
}

/**
 * The room the game starts in:
 * 1. ?room= URL param (dev testing, skips schedule checks)
 * 2. the room this device was in, if it was less than 6 hours ago (and is open)
 * 3. the day's default by Asia/Bangkok time: Mon–Fri → café, Sat/Sun → poolside.
 */
export function getRoomForToday(now: Date = new Date(), storage: KeyValue | null = deviceStorage()): RoomDefinition {
  // URL override (skip schedule check)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('room');
    if (override && rooms[override]) {
      return rooms[override];
    }
  }

  const resume = resumableRoom(now, storage);
  if (resume) return resume;

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
