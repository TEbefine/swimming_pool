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

export interface RoomDefinition {
  roomId: string;
  name: string;
  backgroundImage: string;
  width: number;
  height: number;
  spawnPoint: { x: number; y: number };
  waterZones: Rect[];
  walkableZones: Rect[];
  ladderTriggers: LadderTrigger[];
  obstacles: Rect[];
  exits?: {
    triggerBox: [number, number, number, number];
    targetRoom: string;
  }[];
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
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  floatColor?: FloatColor;
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
