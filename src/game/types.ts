export type PlayerState = 'land' | 'water';

export type LandAction = 
  | 'idle' 
  | 'walk1' 
  | 'walk2' 
  | 'wave' 
  | 'talk' 
  | 'happy' 
  | 'thinking' 
  | 'sit' 
  | 'lie' 
  | 'jump';

export type WaterAction = 
  | 'idle' 
  | 'swim' 
  | 'wave' 
  | 'talk' 
  | 'happy' 
  | 'relax' 
  | 'surprise';

export type FloatColor = 
  | 'red' 
  | 'blue' 
  | 'pink' 
  | 'yellow' 
  | 'black' 
  | 'green' 
  | 'purple' 
  | 'gray';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LadderTrigger extends Rect {
  targetState: PlayerState;
  targetY: number;
}

export interface ElementDef {
  id: string;
  asset: string;
  x: number;
  y: number;
  /** wall: drawn right after the background · floor: under all characters · object: depth-sorted by y */
  layer: 'wall' | 'floor' | 'object';
  /** Blocking footprint (w × h) centred on x, bottom edge on y */
  collider?: { w: number; h: number };
  /** Where a character sits, relative to (x, y). pose 'lie' uses the lie action (e.g. a bed). */
  seat?: { dx: number; dy: number; facing: 1 | -1; pose?: 'sit' | 'lie' };
  /** Walk within `radius` px of (x + dx, y + dy) to get this action */
  interact?: { id: string; label: string; dx: number; dy: number; radius: number };
}

export interface Interactable {
  id: string;
  label: string;
  rect: Rect;
}

export type ContextActionId = 'sit' | 'stand' | 'talk' | 'read' | 'dive' | 'climb' | 'jump';

export interface ContextAction {
  id: ContextActionId;
  label: string;
}

export type RoomSchedule = 'always' | 'weekdays' | 'weekends';

/** Where an NPC may stroll. Feet stay inside `area`; it pauses between walks and plays one of `idlePoses`. */
export interface NpcWander {
  area: Rect;
  /** px per second at actorScale 1 (multiply by the room's actorScale) */
  speed: number;
  /** Random pause between walks, [min, max] ms */
  pauseMs: [number, number];
  /** Pose names from the NPC's manifest shown while pausing */
  idlePoses: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  x: number;
  y: number;
  sprite: string;
  facing: 1 | -1;
  standAt?: { dx: number; dy: number; facing: 1 | -1 };
  /** Optional: the NPC walks around instead of standing still */
  wander?: NpcWander;
}

export interface RoomDefinition {
  roomId: string;
  name: string;
  backgroundImage: string;
  width: number;
  height: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  spawnPoint: { x: number; y: number };
  waterZones?: Rect[];
  walkableZones: Rect[];
  ladderTriggers?: LadderTrigger[];
  obstacles: Rect[];
  seats?: { x: number; y: number; facing: 1 | -1 }[];
  npcs?: NpcDef[];
  interactables?: Interactable[];
  elements?: ElementDef[];
  actorScale?: number;
  /** What the player wears here: sprites in public/sprites/outfits/<outfit>/ ('swim' = the base swimsuit art). */
  outfit: 'swim' | 'cafe' | 'pajamas';
  exits?: {
    triggerBox: [number, number, number, number];
    targetRoom: string;
  }[];
  /** Path to 320×180 thumbnail for the scene selector. */
  thumbnail: string;
  /** Single emoji shown as room icon in UI. */
  icon: string;
  /** When this room is open. */
  schedule: RoomSchedule;
  /** Outside city view seen through transparent windows. */
  view?: {
    cityOffsetX: number;
    /** Always show this Bangkok hour in this room (e.g. 21 = night club), ignoring the real clock */
    fixedHour?: number;
  };
}

export interface PlayerData {
  id: string;
  name: string;
  x: number;
  y: number;
  state: PlayerState;
  facing: 1 | -1; // 1 = right, -1 = left
  floatColor: FloatColor;
  currentAction: string;
  lastMessage?: string;
  messageTime?: number;
  isTyping?: boolean;
  timestamp: number;
  /** Which room the player is in. Old clients omit this (defaults to 'poolside'). */
  roomId?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  floatColor?: FloatColor;
  /** Which room this message was sent in. Old clients omit this (defaults to 'poolside'). */
  roomId?: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
}
