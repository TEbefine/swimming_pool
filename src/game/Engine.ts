import type {
  PlayerData,
  FloatColor,
  Particle,
  ChatMessage,
  RoomDefinition,
  Rect,
  ElementDef,
  ContextAction,
  ContextActionId,
  NpcDef
} from './types';
import { sound } from './audio';
import { NetworkManager } from './network';
import { rooms } from './rooms';
import { CITY, ROOM_LIGHTS, bangkokHour, skyAt } from './world/cityView';
import { MoversManager } from './world/movers';
import { getTonightGenre } from './rooms/club';

/** Hash string into 32-bit unsigned integer (FNV-1a). */
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

/** Seeded PRNG (Mulberry32) returning values in [0, 1). */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NpcWanderSegment {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  walkMs: number;
  pauseMs: number;
  totalMs: number;
  startTime: number;
  endTime: number;
  idlePose: string;
  facing: 1 | -1;
}

/** 4-frame NPC side walk (the idle side pose is the passing frame between the two strides). */
const NPC_WALK_CYCLE = ['walk1', 'side_idle', 'walk2', 'side_idle'] as const;
/** Ground covered per walk frame at 1× (px). Frames advance by distance, so the feet never slide. */
const NPC_STRIDE_PX = 9;
/** After arriving, stand still this long before starting the pause pose (looks less robotic). */
const NPC_SETTLE_MS = 450;

function npcWalkFrame(distancePx: number, actorScale: number): string {
  const i = Math.floor(distancePx / (NPC_STRIDE_PX * (actorScale || 1))) % NPC_WALK_CYCLE.length;
  return NPC_WALK_CYCLE[i];
}

interface NpcWanderCycle {
  segments: NpcWanderSegment[];
  totalCycleMs: number;
}

/** Precompute 1000 deterministic wander segments for an NPC, looping seamlessly. */
function buildWanderCycle(npc: NpcDef, actorScale: number): NpcWanderCycle | null {
  const wander = npc.wander;
  if (!wander) return null;

  const segments: NpcWanderSegment[] = [];
  const speedPxPerMs = Math.max(0.01, (wander.speed * (actorScale || 1)) / 1000);
  const count = 1000;

  const homeX = Math.max(wander.area.x, Math.min(wander.area.x + wander.area.width, npc.x));
  const homeY = Math.max(wander.area.y, Math.min(wander.area.y + wander.area.height, npc.y));

  let prevX = homeX;
  let prevY = homeY;
  let currentTime = 0;

  for (let i = 0; i < count; i++) {
    const seed = hashString(`${npc.id}_${i}`);
    const rng = seededRandom(seed);

    let tx: number;
    let ty: number;
    if (i === count - 1) {
      // Loop ends back at starting position
      tx = homeX;
      ty = homeY;
    } else {
      // NPC sheets only have SIDE walk frames, so keep walks mostly sideways:
      // at least a short stroll left/right, and never more than ~0.35 px up/down per px across.
      const minDx = Math.min(90 * (actorScale || 1), wander.area.width * 0.35);
      tx = Math.round(wander.area.x + rng() * wander.area.width);
      if (Math.abs(tx - prevX) < minDx) {
        const dir = tx >= prevX ? 1 : -1;
        tx = prevX + dir * minDx;
        if (tx > wander.area.x + wander.area.width || tx < wander.area.x) tx = prevX - dir * minDx;
        tx = Math.round(Math.max(wander.area.x, Math.min(wander.area.x + wander.area.width, tx)));
      }
      const maxDy = Math.abs(tx - prevX) * 0.35;
      const wantY = wander.area.y + rng() * wander.area.height;
      ty = Math.round(Math.max(wander.area.y, Math.min(wander.area.y + wander.area.height,
        Math.max(prevY - maxDy, Math.min(prevY + maxDy, wantY)))));
    }

    const dist = Math.hypot(tx - prevX, ty - prevY);
    const walkMs = Math.max(100, Math.round(dist / speedPxPerMs));
    const pauseMs = Math.round(wander.pauseMs[0] + rng() * (wander.pauseMs[1] - wander.pauseMs[0]));
    const totalMs = walkMs + pauseMs;
    const poseIdx = Math.floor(rng() * wander.idlePoses.length);
    const idlePose = wander.idlePoses[poseIdx] || 'idle';
    const facing: 1 | -1 = tx >= prevX ? 1 : -1;

    segments.push({
      startX: prevX,
      startY: prevY,
      targetX: tx,
      targetY: ty,
      walkMs,
      pauseMs,
      totalMs,
      startTime: currentTime,
      endTime: currentTime + totalMs,
      idlePose,
      facing,
    });

    currentTime += totalMs;
    prevX = tx;
    prevY = ty;
  }

  return { segments, totalCycleMs: Math.max(1, currentTime) };
}

/** Binary search for the active segment at a given cycle time offset. */
function findWanderSegment(segments: NpcWanderSegment[], t: number): NpcWanderSegment {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const seg = segments[mid];
    if (t < seg.startTime) {
      high = mid - 1;
    } else if (t >= seg.endTime) {
      low = mid + 1;
    } else {
      return seg;
    }
  }
  return segments[Math.min(Math.max(0, low), segments.length - 1)];
}

interface NpcRuntimeState {
  frozen: boolean;
  frozenX: number;
  frozenY: number;
  frozenFacing: 1 | -1;
  easeStartTime: number;
  easeDuration: number;
  easeStartX: number;
  easeStartY: number;
}

interface NpcRenderState {
  x: number;
  y: number;
  facing: 1 | -1;
  action: string;
}

/** Physical keys that move the player (KeyboardEvent.code, layout-independent). */
const MOVE_CODES = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS',
]);

/** Pose → art to borrow until a dedicated sprite exists. */
const POSE_FALLBACK: Record<string, string> = {
  walk_down1: 'idle', walk_down2: 'idle', walk_down_pass: 'idle',
  walk_up1: 'back_idle', walk_up2: 'back_idle', walk_up_pass: 'back_idle',
  side_pass: 'side_idle',
};

/** One hop: time in the air (ms) and peak height (art px at 1×). */
const JUMP_MS = 520;
const JUMP_HEIGHT = 18;

/** Poses that stay until the player moves (or presses the same emote again). */
const HOLD_POSES = new Set(['sit', 'lie']);

/** Standing/walking poses are lined up on the head so the body doesn't slide between
 *  frames. Others (wave, sit, …) keep the image center — raised arms would skew it,
 *  and seat spots are tuned to it. */
const HEAD_ANCHOR = new Set([
  'idle', 'side_idle', 'back_idle', 'walk1', 'walk2', 'side_pass',
  'walk_down1', 'walk_down2', 'walk_down_pass', 'walk_up1', 'walk_up2', 'walk_up_pass',
]);

/** Sprite folder for a room's actor scale: 2 → 'land_2_0x' (made by scripts/process_land_scaled.py). */
function landFolder(scale: number): string {
  return `land_${scale.toFixed(1).replace('.', '_')}x`;
}

/** Optional idle fidgets, used automatically once their sprites are in the manifest. */
const FIDGET_EXTRAS = ['yawn', 'stretch', 'look_back'];

/** Small stable number from a player id (desyncs blinks between players). */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 4200;
}

const WALK_CYCLES = {
  side: ['walk1', 'side_pass', 'walk2', 'side_pass'],
  down: ['walk_down1', 'walk_down_pass', 'walk_down2', 'walk_down_pass'],
  up: ['walk_up1', 'walk_up_pass', 'walk_up2', 'walk_up_pass'],
} as const;

interface RemotePlayer {
  data: PlayerData;
  targetX: number;
  targetY: number;
  lastUpdate: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private room: RoomDefinition;

  // Assets
  private bgImage: HTMLImageElement | null = null;
  private sprites: Map<string, HTMLImageElement> = new Map();
  private elementImages: Map<string, HTMLImageElement> = new Map();
  private npcSprites: Map<string, HTMLImageElement> = new Map();
  private moverSprites: Map<string, HTMLImageElement> = new Map();
  private cityImage: HTMLImageElement | null = null;
  public isAssetsLoaded: boolean = false;

  // Outside world & movers
  private movers: MoversManager = new MoversManager();
  private skyCanvas: HTMLCanvasElement = document.createElement('canvas');
  private cityCanvas: HTMLCanvasElement = document.createElement('canvas');
  private lastSkyRebuildMinute: number = -1;
  private lastCityRoomId: string = '';

  // Local Player
  public localPlayer: PlayerData;
  private walkFrame: number = 0;
  private walkTimer: number = 0;
  private isMoving: boolean = false;
  private clickTarget: { x: number; y: number } | null = null;
  private emoteTimeout: number | null = null;
  private lastFootstepTime: number = 0;

  // Motion polish (4-direction facing, idle fidgets, stuck detection)
  /** Which way the body faces on screen. 'side' uses `facing` for left/right. */
  private moveDir: 'down' | 'up' | 'side' = 'down';
  private idleTime: number = 0;
  private nextFidgetAt: number = 8 + Math.random() * 6;
  private fidgetTimeout: number | null = null;
  private stuckTime: number = 0;

  // Network throttle + heartbeat handle
  private lastBroadcast: number = 0;
  private lastSentAction: string = '';
  private lastSentFacing: 1 | -1 = 1;
  private heartbeatId: number | null = null;

  // Animation timing shared by local + remote players: when did each player's pose start?
  private poseStart: Map<string, { action: string; t: number }> = new Map();
  // Head column of each sprite, so every pose lines up on the head (no wobble between frames)
  private headAnchor: WeakMap<HTMLImageElement, number> = new WeakMap();
  private jumpUntil: number = 0;

  // Remote Players
  private remotePlayers: Map<string, RemotePlayer> = new Map();

  // Network
  public network: NetworkManager;

  // Particles
  private particles: Particle[] = [];

  // Input states
  private keys: { [key: string]: boolean } = {};
  private touchMoveEnabled: boolean = true;
  private virtualDpad: { dx: number; dy: number } = { dx: 0, dy: 0 };
  private cameraFollow: boolean = false;
  private currentCamPctX: number = 50;

  // Running (sprint) mode
  private isRunning: boolean = false;

  // Context action state
  private currentContextAction: ContextAction = { id: 'jump', label: 'Jump' };

  // Seated state: which seat index the player is sitting in (-1 = not seated)
  private seatedIndex: number = -1;

  // Room element derived data
  private actorScale: number;
  private mergedObstacles: Rect[] = [];
  /** Seat spots. sortY = just in front of the furniture, so a seated player is drawn on top of it. */
  private mergedSeats: { x: number; y: number; facing: 1 | -1; pose: 'sit' | 'lie'; sortY: number }[] = [];
  private elementInteractions: { id: string; label: string; x: number; y: number; radius: number }[] = [];

  // NPC talk spots: per-NPC interaction zones
  private npcTalkSpots: Map<string, { dx: number; dy: number; radius: number }> = new Map();

  // NPC wander precalculated cycles & local runtime state
  private npcWanderCycles: Map<string, NpcWanderCycle> = new Map();
  private npcRuntime: Map<string, NpcRuntimeState> = new Map();

  // NPC blink timers: next blink time per NPC
  private npcBlinkTimers: Map<string, { nextBlink: number; blinkEnd: number }> = new Map();

  // Dialog state: movement freeze + NPC pose override
  private dialogFrozen: boolean = false;
  private dialogNpcId: string | null = null;
  private npcPoseOverride: Map<string, { pose: string; until: number }> = new Map();

  // Debug overlay (F3)
  private showDebug: boolean = false;

  // Loop control
  private animId: number = 0;
  private lastTime: number = 0;
  private running: boolean = false;

  // Fade transition state
  private fadeAlpha: number = 0;
  private fadeDirection: 'in' | 'out' | 'none' = 'none';
  private fadeCallback: (() => void) | null = null;

  // Room change callback
  public onRoomChanged?: (room: RoomDefinition) => void;

  // Callbacks to UI
  public onChatMessageReceived?: (msg: ChatMessage) => void;
  public onPlayerCountChange?: (count: number) => void;
  public onContextChange?: (action: ContextAction) => void;
  public onInteract?: (id: string, actionId?: ContextActionId) => void;

  constructor(canvas: HTMLCanvasElement, room: RoomDefinition, playerName: string = 'Swimmer', initialFloat: FloatColor = 'red') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.room = room;
    this.actorScale = room.actorScale ?? 1;

    const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
    this.localPlayer = {
      id: playerId,
      name: playerName,
      x: this.room.spawnPoint.x,
      y: this.room.spawnPoint.y,
      state: 'land',
      facing: 1,
      floatColor: initialFloat,
      currentAction: 'idle',
      timestamp: Date.now(),
      roomId: room.roomId
    };

    this.buildMergedData();
    this.buildNpcTalkSpots();
    this.network = new NetworkManager(this.localPlayer.id);
    this.setupNetworkHandlers();
    this.setupInputListeners();
  }

  // =========================================================================
  // MERGED DATA (obstacles, seats, interactions from room + elements)
  // =========================================================================

  private buildMergedData() {
    this.mergedObstacles = [...this.room.obstacles];
    // Plain room seats (no furniture): sort by their own spot
    this.mergedSeats = (this.room.seats ?? []).map((st) => ({ ...st, pose: 'sit' as const, sortY: st.y }));
    this.elementInteractions = [];

    if (this.room.elements) {
      for (const el of this.room.elements) {
        if (el.collider) {
          this.mergedObstacles.push({
            x: el.x - el.collider.w / 2,
            y: el.y - el.collider.h,
            width: el.collider.w,
            height: el.collider.h
          });
        }
        if (el.seat) {
          this.mergedSeats.push({
            x: el.x + el.seat.dx,
            y: el.y + el.seat.dy,
            facing: el.seat.facing,
            pose: el.seat.pose ?? 'sit',
            sortY: el.y + 1
          });
        }
        if (el.interact) {
          this.elementInteractions.push({
            id: el.interact.id,
            label: el.interact.label,
            x: el.x + el.interact.dx,
            y: el.y + el.interact.dy,
            radius: el.interact.radius
          });
        }
      }
    }
  }

  /** Build NPC talk spots from config. */
  private buildNpcTalkSpots() {
    // Default talk spots per NPC id
    const defaultSpots: Record<string, { dx: number; dy: number; radius: number }> = {
      barista: { dx: 0, dy: 40, radius: 55 },
    };
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        if (npc.standAt) {
          this.npcTalkSpots.set(npc.id, {
            dx: npc.standAt.dx,
            dy: npc.standAt.dy,
            radius: 65,
          });
        } else if (defaultSpots[npc.id]) {
          this.npcTalkSpots.set(npc.id, defaultSpots[npc.id]);
        }
      }
    }
  }

  // =========================================================================
  // NETWORK
  // =========================================================================

  private setupNetworkHandlers() {
    this.network.on('player_state', (_, raw) => {
      const data = raw as PlayerData;
      if (data.id === this.localPlayer.id) return;
      // Default roomId for old clients
      if (!data.roomId) data.roomId = 'poolside';

      const existing = this.remotePlayers.get(data.id);
      if (existing) {
        existing.targetX = data.x;
        existing.targetY = data.y;
        existing.data.facing = data.facing;
        existing.data.state = data.state;
        existing.data.floatColor = data.floatColor;
        existing.data.currentAction = data.currentAction;
        existing.data.name = data.name;
        existing.data.lastMessage = data.lastMessage;
        existing.data.messageTime = data.messageTime;
        existing.data.roomId = data.roomId;
        existing.lastUpdate = Date.now();
      } else {
        this.remotePlayers.set(data.id, {
          data,
          targetX: data.x,
          targetY: data.y,
          lastUpdate: Date.now()
        });
      }
      // Always re-emit count (per current room)
      if (this.onPlayerCountChange) {
        this.onPlayerCountChange(this.getLocalRoomPlayerCount());
      }
    });

    this.network.on('chat_message', (_, raw) => {
      const msg = raw as ChatMessage;
      if (!msg.roomId) msg.roomId = 'poolside';
      // Only play chime and show if same room
      if (msg.roomId === this.room.roomId) {
        sound.playChatChime();
        if (this.onChatMessageReceived) {
          this.onChatMessageReceived(msg);
        }
      }
    });

    this.network.on('player_leave', (_, raw) => {
      const { id } = raw as { id: string };
      this.remotePlayers.delete(id);
      if (this.onPlayerCountChange) {
        this.onPlayerCountChange(this.getLocalRoomPlayerCount());
      }
    });
  }

  /** Count remote players in the current room + self. */
  private getLocalRoomPlayerCount(): number {
    let count = 1; // local player
    for (const r of this.remotePlayers.values()) {
      if ((r.data.roomId || 'poolside') === this.room.roomId) count++;
    }
    return count;
  }

  /** Get player counts per room (active in last 10s). */
  public getPlayerCountByRoom(): Record<string, number> {
    const counts: Record<string, number> = {};
    // Count self
    const myRoom = this.room.roomId;
    counts[myRoom] = (counts[myRoom] || 0) + 1;
    const now = Date.now();
    for (const r of this.remotePlayers.values()) {
      if (now - r.lastUpdate > 10000) continue;
      const rid = r.data.roomId || 'poolside';
      counts[rid] = (counts[rid] || 0) + 1;
    }
    return counts;
  }

  /** Get the current room definition. */
  public getRoom(): RoomDefinition {
    return this.room;
  }

  /**
   * Runtime room change: fade to black (300ms), clear seated/dialog/emote state,
   * force land state, load the new room's background, elements and sprite set (actorScale),
   * place player at spawnPoint, fade in, broadcast state.
   */
  public async changeRoom(roomId: string): Promise<boolean> {
    if (this.fadeDirection !== 'none') return false;
    if (this.room.roomId === roomId) return false;
    const targetRoom = rooms[roomId];
    if (!targetRoom) return false;

    return new Promise<boolean>((resolve) => {
      this.fadeDirection = 'out';
      this.fadeCallback = async () => {
        try {
          // Clear seated, dialog, and emote state
          this.seatedIndex = -1;
          this.setDialogFrozen(false);
          if (this.emoteTimeout) {
            clearTimeout(this.emoteTimeout);
            this.emoteTimeout = null;
          }

          // Force land state
          this.localPlayer.state = 'land';
          this.localPlayer.currentAction = 'idle';
          this.clickTarget = null;
          this.isMoving = false;

          // Switch room & scale
          this.room = targetRoom;
          this.actorScale = targetRoom.actorScale ?? 1;
          this.localPlayer.roomId = targetRoom.roomId;
          this.localPlayer.x = targetRoom.spawnPoint.x;
          this.localPlayer.y = targetRoom.spawnPoint.y;
          this.localPlayer.facing = 1;
          this.moveDir = 'down';
          this.idleTime = 0;

          // Clear dynamic elements & rebuild layout
          this.elementImages.clear();
          this.npcSprites.clear();
          this.npcWanderCycles.clear();
          this.npcRuntime.clear();
          this.buildMergedData();
          this.buildNpcTalkSpots();
          this.npcBlinkTimers.clear();
          this.npcPoseOverride.clear();
          this.movers.reset();
          this.lastSkyRebuildMinute = -1;

          // Reload assets for new room
          await this.loadAssets();

          // Notify UI
          if (this.onRoomChanged) {
            this.onRoomChanged(targetRoom);
          }
          if (this.onPlayerCountChange) {
            this.onPlayerCountChange(this.getLocalRoomPlayerCount());
          }

          // Broadcast state to peers
          this.broadcastState();

          // Fade back in
          this.fadeDirection = 'in';
          resolve(true);
        } catch (e) {
          console.error('Failed to change room:', e);
          this.fadeDirection = 'in';
          resolve(false);
        }
      };
    });
  }

  // =========================================================================
  // ASSET LOADING
  // =========================================================================

  public async loadAssets(): Promise<void> {
    const imgPromises: Promise<void>[] = [];

    // Helper: load a single image into a Map
    const loadImg = (key: string, src: string, target: Map<string, HTMLImageElement>): void => {
      imgPromises.push(new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => { target.set(key, img); resolve(); };
        img.onerror = () => resolve();
      }));
    };

    // 1. Background
    imgPromises.push(new Promise((resolve) => {
      const img = new Image();
      img.src = this.room.backgroundImage;
      img.onload = () => { this.bgImage = img; resolve(); };
      img.onerror = () => resolve();
    }));

    // 2. Character manifest (1× land + water floats)
    const manifestRes = await fetch('/sprites/character_manifest.json');
    const manifest = await manifestRes.json();

    for (const [action, info] of Object.entries(manifest.land as Record<string, { path: string }>)) {
      loadImg(`land_${action}`, info.path, this.sprites);
    }

    for (const [color, actions] of Object.entries(manifest.water as Record<string, Record<string, { path: string }>>)) {
      for (const [action, info] of Object.entries(actions)) {
        loadImg(`water_${color}_${action}`, info.path, this.sprites);
      }
    }

    // 3. Bigger land sprites for close-up rooms (actorScale 2 → /sprites/land_2_0x/)
    if (this.actorScale > 1) {
      const folder = landFolder(this.actorScale);
      if (!this.sprites.has(`${folder}_idle`)) {
        const resScaled = await fetch(`/sprites/${folder}/manifest.json`);
        const manifestScaled = await resScaled.json() as Record<string, { path: string }>;
        for (const [action, info] of Object.entries(manifestScaled)) {
          loadImg(`${folder}_${action}`, info.path, this.sprites);
        }
      }
    }

    // 3b. Room outfit (café clothes, pajamas…). Missing folder → keeps the swimsuit.
    const outfit = this.room.outfit;
    if (outfit && outfit !== 'swim' && !this.sprites.has(`outfit_${outfit}_idle`)) {
      try {
        const res = await fetch(`/sprites/outfits/${outfit}/manifest.json`);
        if (res.ok) {
          const m = await res.json() as Record<string, { path: string }>;
          for (const [action, info] of Object.entries(m)) {
            loadImg(`outfit_${outfit}_${action}`, info.path, this.sprites);
          }
        }
      } catch {
        // No outfit art yet (dev server answers with index.html) — swimsuit it is
      }
    }

    // 4. Element images (deduplicated by asset path)
    if (this.room.elements) {
      const loaded = new Set<string>();
      for (const el of this.room.elements) {
        if (!loaded.has(el.asset)) {
          loaded.add(el.asset);
          loadImg(el.asset, el.asset, this.elementImages);
        }
      }
    }

    // 4b. Club stage banner (tonight's genre)
    if (this.room.roomId === 'club') {
      const genre = getTonightGenre();
      loadImg('club_stage_banner', `/sprites/banners/banner_${genre}.webp`, this.elementImages);
    }

    // 5. NPC sprites (manifest-based or single image)
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const isFile = npc.sprite.endsWith('.webp');
        if (isFile) {
          loadImg(`npc_${npc.id}_idle`, npc.sprite, this.npcSprites);
        } else {
          // Load from manifest directory
          try {
            const npcRes = await fetch(`${npc.sprite}/manifest.json`);
            const npcManifest = await npcRes.json() as Record<string, { path: string }>;
            for (const [action, info] of Object.entries(npcManifest)) {
              loadImg(`npc_${npc.id}_${action}`, info.path, this.npcSprites);
            }
          } catch {
            // Fallback: try as single image with .webp extension
            loadImg(`npc_${npc.id}_idle`, `${npc.sprite}.webp`, this.npcSprites);
          }
        }
      }
    }

    // 6. Outside city view & movers (if room has view)
    if (this.room.view) {
      if (!this.cityImage) {
        imgPromises.push(new Promise((resolve) => {
          const img = new Image();
          img.src = CITY.image;
          img.onload = () => { this.cityImage = img; resolve(); };
          img.onerror = () => resolve();
        }));
      }

      const moverFiles = [
        '/sprites/world/train_day.webp',
        '/sprites/world/train_night.webp',
        '/sprites/world/bird_up.webp',
        '/sprites/world/bird_down.webp',
        '/sprites/world/birds_flock.webp',
        '/sprites/world/plane.webp',
        '/sprites/world/cloud_1.webp',
        '/sprites/world/cloud_2.webp',
        '/sprites/world/cloud_3.webp',
      ];
      for (const path of moverFiles) {
        if (!this.moverSprites.has(path)) {
          loadImg(path, path, this.moverSprites);
        }
      }
    }

    await Promise.all(imgPromises);
    this.isAssetsLoaded = true;
  }

  // =========================================================================
  // INPUT
  // =========================================================================

  private setupInputListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('visibilitychange', this.clearKeys);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
  }

  /** Release every held key — stops "walking forever" after alt-tab / tab switch. */
  private clearKeys = () => {
    this.keys = {};
  };

  public destroy() {
    this.running = false;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('visibilitychange', this.clearKeys);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    if (this.fidgetTimeout !== null) clearTimeout(this.fidgetTimeout);
    this.network.sendPlayerLeave(this.localPlayer.id);
    this.network.destroy();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // If typing inside an input element, do not capture movement
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
      return;
    }

    // e.code = physical key, so WASD / 1-5 also work with the Thai keyboard layout
    this.keys[e.code] = true;
    if (MOVE_CODES.has(e.code)) this.clickTarget = null; // Keyboard overrides click-to-move

    // F3 debug overlay toggle
    if (e.key === 'F3') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
    }

    // Hotkeys 1-5 for Emotes (ignore auto-repeat while held)
    if (e.repeat) return;
    if (e.code === 'Digit1') this.triggerEmote('wave');
    if (e.code === 'Digit2') {
      if (this.localPlayer.state === 'land') this.triggerEmote('sit');
      else this.triggerEmote('relax');
    }
    if (e.code === 'Digit3') {
      if (this.localPlayer.state === 'land') this.triggerEmote('lie');
      else this.triggerEmote('happy');
    }
    if (e.code === 'Digit4') this.triggerEmote('surprise');
    if (e.code === 'Digit5') {
      if (this.localPlayer.state === 'land') this.triggerEmote('jump');
      else this.triggerEmote('wave');
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (!this.touchMoveEnabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    this.clickTarget = { x: clickX, y: clickY };
    this.createClickRipple(clickX, clickY);
  };

  public setTouchMoveEnabled(enabled: boolean) {
    this.touchMoveEnabled = enabled;
    if (!enabled) {
      this.clickTarget = null;
    }
  }

  public setVirtualDpad(dx: number, dy: number) {
    this.virtualDpad = { dx, dy };
    if (dx !== 0 || dy !== 0) {
      this.clickTarget = null;
    }
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public setCanvas(newCanvas: HTMLCanvasElement) {
    if (this.canvas === newCanvas) return;
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas = newCanvas;
    this.ctx = newCanvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    if (this.cameraFollow && this.canvas) {
      this.canvas.style.objectFit = 'cover';
      this.canvas.style.objectPosition = `${this.currentCamPctX.toFixed(2)}% center`;
    }
  }

  public setCameraFollow(enabled: boolean) {
    this.cameraFollow = enabled;
    if (this.canvas) {
      if (enabled) {
        this.canvas.style.objectFit = 'cover';
        const targetPctX = Math.max(0, Math.min(100, (this.localPlayer.x / this.canvas.width) * 100));
        this.currentCamPctX = targetPctX;
        this.canvas.style.objectPosition = `${targetPctX.toFixed(2)}% center`;
      } else {
        this.canvas.style.objectFit = 'contain';
        this.canvas.style.objectPosition = 'center center';
      }
    }
  }

  // =========================================================================
  // CONTEXT ACTION SYSTEM
  // =========================================================================

  /** Compute which action button A should perform based on proximity. */
  public getContextAction(): ContextAction {
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;

    // Priority 1: If currently sitting → stand
    if (this.seatedIndex >= 0) {
      return { id: 'stand', label: 'Stand' };
    }

    // Priority 2: Seat within 40px → sit (uses merged seats)
    for (const seat of this.mergedSeats) {
      const dx = px - seat.x;
      const dy = py - seat.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 40) {
        return { id: 'sit', label: 'Sit' };
      }
    }

    // Priority 3: NPC talk spot / in range → talk
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        if (this.isPlayerInNpcTalkRange(npc)) {
          return { id: 'talk', label: 'Talk' };
        }
      }
    }

    // Priority 4a: Element interactions (radius-based)
    for (const ei of this.elementInteractions) {
      const dx = px - ei.x;
      const dy = py - ei.y;
      if (Math.sqrt(dx * dx + dy * dy) <= ei.radius) {
        return { id: 'read', label: ei.label };
      }
    }

    // Priority 4b: Old-style rect interactables (backward compat)
    if (this.room.interactables) {
      for (const item of this.room.interactables) {
        const r = item.rect;
        if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
          return { id: 'read', label: item.label };
        }
      }
    }

    // Priority 5: Pool edge / ladder → dive or climb
    if (this.room.waterZones && this.room.waterZones.length > 0) {
      if (this.localPlayer.state === 'land') {
        // Near water edge? Check if any water zone boundary is close
        for (const wz of this.room.waterZones) {
          const nearTop = Math.abs(py - wz.y) < 30 && px >= wz.x && px <= wz.x + wz.width;
          const nearBottom = Math.abs(py - (wz.y + wz.height)) < 30 && px >= wz.x && px <= wz.x + wz.width;
          if (nearTop || nearBottom) {
            return { id: 'dive', label: 'Dive' };
          }
        }
      } else {
        // In water, near edge → climb
        for (const wz of this.room.waterZones) {
          const nearTop = Math.abs(py - wz.y) < 30 && px >= wz.x && px <= wz.x + wz.width;
          const nearBottom = Math.abs(py - (wz.y + wz.height)) < 30 && px >= wz.x && px <= wz.x + wz.width;
          if (nearTop || nearBottom) {
            return { id: 'climb', label: 'Climb' };
          }
        }
      }
    }

    // Ladder triggers → dive/climb
    if (this.room.ladderTriggers) {
      for (const lt of this.room.ladderTriggers) {
        if (px >= lt.x && px <= lt.x + lt.width && py >= lt.y && py <= lt.y + lt.height) {
          return this.localPlayer.state === 'land'
            ? { id: 'dive', label: 'Dive' }
            : { id: 'climb', label: 'Climb' };
        }
      }
    }

    // Default: jump
    return { id: 'jump', label: 'Jump' };
  }

  /** Called every frame to emit onContextChange when the action id changes. */
  private updateContextAction() {
    const next = this.getContextAction();
    if (next.id !== this.currentContextAction.id) {
      this.currentContextAction = next;
      if (this.onContextChange) {
        this.onContextChange(next);
      }
    }
  }

  /** Perform the current context action (mapped to A button). */
  public interact() {
    const action = this.currentContextAction;
    switch (action.id) {
      case 'sit':
        this.sitDown();
        break;
      case 'stand':
        this.standUp();
        break;
      case 'talk': {
        const npc = this.findNearestTalkSpotNpc();
        if (npc && this.onInteract) {
          this.onInteract(npc.id, 'talk');
        }
        // Play talk emote
        this.triggerEmote('talk');
        break;
      }
      case 'read': {
        // Check element interactions first, then old rect-based
        const ei = this.findNearestElementInteraction();
        if (ei && this.onInteract) {
          this.onInteract(ei.id, 'read');
        } else {
          const item = this.findNearestInteractable();
          if (item && this.onInteract) {
            this.onInteract(item.id, 'read');
          }
        }
        this.triggerEmote('thinking');
        break;
      }
      case 'dive':
        this.toggleWaterLand();
        break;
      case 'climb':
        this.toggleWaterLand();
        break;
      case 'jump':
        if (this.localPlayer.state === 'water') {
          this.triggerEmote('happy');
        } else {
          this.triggerEmote('jump');
        }
        break;
    }
  }

  /** Sit down in the nearest merged seat. */
  private sitDown() {
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    let bestDist = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < this.mergedSeats.length; i++) {
      const seat = this.mergedSeats[i];
      const dx = px - seat.x;
      const dy = py - seat.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 40 && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const seat = this.mergedSeats[bestIdx];
      this.seatedIndex = bestIdx;
      this.localPlayer.x = seat.x;
      this.localPlayer.y = seat.y;
      this.localPlayer.facing = seat.facing;
      this.localPlayer.currentAction = seat.pose; // bed = lie down, cushions/beanbag = sit
      this.clickTarget = null;
      this.broadcastState();
    }
  }

  /** Stand up from a seat. */
  public standUp() {
    if (this.seatedIndex < 0) return;
    this.seatedIndex = -1;
    this.moveDir = 'down';
    this.localPlayer.currentAction = 'idle';
    this.idleTime = 0;
    this.broadcastState();
  }

  /** Whether the player is currently seated. */
  public isSeated(): boolean {
    return this.seatedIndex >= 0;
  }

  /** Set running (sprint) mode. While true, land speed × 1.6. */
  public setRunning(value: boolean) {
    this.isRunning = value;
  }


  /** Find the nearest NPC whose talkSpot the local player is inside. */
  private findNearestTalkSpotNpc(): { id: string; name: string; x: number; y: number } | null {
    if (!this.room.npcs) return null;
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    let best: { id: string; name: string; x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const npc of this.room.npcs) {
      const curState = this.getNpcCurrentState(npc);
      if (this.isPlayerInNpcTalkRange(npc, curState)) {
        const dist = Math.hypot(px - curState.x, py - curState.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = { id: npc.id, name: npc.name, x: curState.x, y: curState.y };
        }
      }
    }
    return best;
  }

  private findNearestElementInteraction() {
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    let best: (typeof this.elementInteractions)[0] | null = null;
    let bestDist = Infinity;
    for (const ei of this.elementInteractions) {
      const dx = px - ei.x;
      const dy = py - ei.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ei.radius && dist < bestDist) {
        bestDist = dist;
        best = ei;
      }
    }
    return best;
  }

  private findNearestInteractable() {
    if (!this.room.interactables) return null;
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    for (const item of this.room.interactables) {
      const r = item.rect;
      if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
        return item;
      }
    }
    return null;
  }

  // =========================================================================
  // ORIGINAL ENGINE METHODS
  // =========================================================================

  private createClickRipple(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 1.5,
        vy: Math.sin(angle) * 1.5,
        size: 3,
        alpha: 1,
        color: this.localPlayer.state === 'water' ? '#69d2e7' : '#ffd700',
        life: 0,
        maxLife: 20
      });
    }
  }

  public triggerEmote(action: string) {
    const p = this.localPlayer;
    const now = performance.now();

    // Pressing Sit / Lie again while already doing it = stand back up
    if (HOLD_POSES.has(action) && p.currentAction === action && this.seatedIndex < 0) {
      if (this.emoteTimeout) clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
      p.currentAction = this.idlePose();
      this.broadcastState();
      return;
    }
    // No double-jumping in mid-air
    if (action === 'jump' && now < this.jumpUntil) return;

    if (this.emoteTimeout) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }
    if (this.fidgetTimeout) {
      clearTimeout(this.fidgetTimeout);
      this.fidgetTimeout = null;
    }
    this.idleTime = 0;
    p.currentAction = action;
    sound.playEmoteSound(action);

    if (action === 'jump') {
      this.jumpUntil = now + JUMP_MS;
      this.createJumpParticles(p.x, p.y); // take-off dust
    }

    this.broadcastState();

    // Sit / lie on the floor stay until you walk away or press again
    if (HOLD_POSES.has(action) && p.state === 'land') return;

    const duration = action === 'jump' ? JUMP_MS : 2800;
    this.emoteTimeout = window.setTimeout(() => {
      this.emoteTimeout = null;
      if (p.currentAction !== action) return;
      if (action === 'jump') this.createJumpParticles(p.x, p.y); // landing dust
      p.currentAction = this.isMoving
        ? (p.state === 'water' ? 'swim1' : WALK_CYCLES[this.moveDir][this.walkFrame])
        : (p.state === 'water' ? 'tread' : this.idlePose());
      this.broadcastState();
    }, duration);
  }

  public setFloatColor(color: FloatColor) {
    this.localPlayer.floatColor = color;
    this.broadcastState();
  }

  public setPlayerName(name: string) {
    this.localPlayer.name = name.trim() || 'Swimmer';
    this.broadcastState();
  }

  public toggleWaterLand() {
    if (this.localPlayer.state === 'land') {
      this.localPlayer.state = 'water';
      this.localPlayer.y = 340;
      this.localPlayer.currentAction = 'tread';
      sound.playSplash();
      this.createSplashParticles(this.localPlayer.x, this.localPlayer.y);
    } else {
      this.localPlayer.state = 'land';
      this.localPlayer.y = 470;
      this.localPlayer.currentAction = 'idle';
      sound.playFootstep();
      this.createLandDripParticles(this.localPlayer.x, this.localPlayer.y);
    }
    this.broadcastState();
  }

  public sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const chatMsg: ChatMessage = {
      id: 'm_' + Math.random().toString(36).substring(2, 9),
      senderId: this.localPlayer.id,
      senderName: this.localPlayer.name,
      text: trimmed,
      timestamp: Date.now(),
      floatColor: this.localPlayer.floatColor,
      roomId: this.room.roomId
    };

    this.localPlayer.lastMessage = trimmed;
    this.localPlayer.messageTime = Date.now();

    // Set talk action temporarily if not moving
    if (!this.isMoving) {
      this.localPlayer.currentAction = 'talk';
      setTimeout(() => {
        if (this.localPlayer.currentAction === 'talk' && !this.isMoving) {
          this.localPlayer.currentAction = this.localPlayer.state === 'water' ? 'tread' : 'idle';
          this.broadcastState();
        }
      }, 2500);
    }

    sound.playChatChime();
    this.network.sendChatMessage(chatMsg);
    this.broadcastState();

    if (this.onChatMessageReceived) {
      this.onChatMessageReceived(chatMsg);
    }
  }

  /** Send local state. While walking we call with force=false: position is capped
   *  at ~15 msgs/s, but a pose or facing change always goes out immediately. */
  private broadcastState(force: boolean = true) {
    const now = performance.now();
    if (
      !force &&
      now - this.lastBroadcast < 66 &&
      this.localPlayer.currentAction === this.lastSentAction &&
      this.localPlayer.facing === this.lastSentFacing
    ) {
      return;
    }
    this.lastBroadcast = now;
    this.lastSentAction = this.localPlayer.currentAction;
    this.lastSentFacing = this.localPlayer.facing;
    this.localPlayer.timestamp = Date.now();
    this.network.broadcastPlayerState(this.localPlayer);
  }

  public start() {
    this.running = true;
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame(this.gameLoop);

    // Heartbeat broadcast every 1.5 seconds (kept so destroy() can clear it)
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    this.heartbeatId = window.setInterval(() => {
      if (this.running) {
        this.broadcastState();
      }
    }, 1500);
  }

  private gameLoop = (time: number) => {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1); // cap dt at 100ms
    this.lastTime = time;

    this.update(dt);
    this.render();

    if (this.cameraFollow && this.canvas) {
      const targetPctX = Math.max(0, Math.min(100, (this.localPlayer.x / this.canvas.width) * 100));
      this.currentCamPctX += (targetPctX - this.currentCamPctX) * 0.15;
      this.canvas.style.objectFit = 'cover';
      this.canvas.style.objectPosition = `${this.currentCamPctX.toFixed(2)}% center`;
    }

    this.animId = requestAnimationFrame(this.gameLoop);
  };

  private update(dt: number) {
    this.updateFade(dt);
    this.updateLocalPlayer(dt);
    this.updateRemotePlayers(dt);
    this.updateParticles();
    this.updateContextAction();

    if (this.room.view) {
      const hour = bangkokHour(undefined, this.room.view.fixedHour);
      const sky = skyAt(hour);
      this.movers.update(dt, sky.night, this.moverSprites);
    }
  }

  private updateSkyAndCityCache(hour: number) {
    const currentMinute = Math.floor(hour * 60);
    const roomChanged = this.lastCityRoomId !== this.room.roomId;

    if (currentMinute === this.lastSkyRebuildMinute && !roomChanged) {
      return;
    }

    this.lastSkyRebuildMinute = currentMinute;
    this.lastCityRoomId = this.room.roomId;

    const sky = skyAt(hour);

    // 1. Sky Canvas (full canvas: 1024x576)
    if (this.skyCanvas.width !== this.canvas.width || this.skyCanvas.height !== this.canvas.height) {
      this.skyCanvas.width = this.canvas.width;
      this.skyCanvas.height = this.canvas.height;
    }
    const skyCtx = this.skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, this.skyCanvas.height);
    grad.addColorStop(0, `rgb(${Math.round(sky.top[0])}, ${Math.round(sky.top[1])}, ${Math.round(sky.top[2])})`);
    grad.addColorStop(1, `rgb(${Math.round(sky.bottom[0])}, ${Math.round(sky.bottom[1])}, ${Math.round(sky.bottom[2])})`);
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, this.skyCanvas.width, this.skyCanvas.height);

    // 2. City Canvas (1086x362)
    if (this.cityCanvas.width !== CITY.width || this.cityCanvas.height !== CITY.height) {
      this.cityCanvas.width = CITY.width;
      this.cityCanvas.height = CITY.height;
    }
    if (this.cityImage) {
      const cityCtx = this.cityCanvas.getContext('2d')!;
      cityCtx.clearRect(0, 0, CITY.width, CITY.height);
      cityCtx.drawImage(this.cityImage, 0, 0);

      // Multiply with skyAt().cityTint
      cityCtx.save();
      cityCtx.globalCompositeOperation = 'multiply';
      const tintR = Math.round(sky.cityTint[0] * 255);
      const tintG = Math.round(sky.cityTint[1] * 255);
      const tintB = Math.round(sky.cityTint[2] * 255);
      cityCtx.fillStyle = `rgb(${tintR}, ${tintG}, ${tintB})`;
      cityCtx.fillRect(0, 0, CITY.width, CITY.height);

      // Mask with original city image alpha
      cityCtx.globalCompositeOperation = 'destination-in';
      cityCtx.drawImage(this.cityImage, 0, 0);
      cityCtx.restore();
    }
  }

  private updateFade(dt: number) {
    if (this.fadeDirection === 'out') {
      this.fadeAlpha += dt / 0.3; // 300ms fade to black
      if (this.fadeAlpha >= 1) {
        this.fadeAlpha = 1;
        this.fadeDirection = 'none';
        if (this.fadeCallback) {
          const cb = this.fadeCallback;
          this.fadeCallback = null;
          cb();
        }
      }
    } else if (this.fadeDirection === 'in') {
      this.fadeAlpha -= dt / 0.3; // 300ms fade from black
      if (this.fadeAlpha <= 0) {
        this.fadeAlpha = 0;
        this.fadeDirection = 'none';
      }
    }
  }

  private updateLocalPlayer(dt: number) {
    // If seated, dialog frozen, or fading out, don't process movement
    if (this.seatedIndex >= 0 || this.dialogFrozen || this.fadeDirection === 'out') return;

    let dx = 0;
    let dy = 0;

    // Keyboard movement (physical keys — see MOVE_CODES)
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) dy -= 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy += 1;

    // Virtual D-pad movement (mobile controller)
    if (this.virtualDpad.dx !== 0 || this.virtualDpad.dy !== 0) {
      dx += this.virtualDpad.dx;
      dy += this.virtualDpad.dy;
    }

    // Click to move
    if (this.clickTarget) {
      const distThreshold = 4;
      const tdx = this.clickTarget.x - this.localPlayer.x;
      const tdy = this.clickTarget.y - this.localPlayer.y;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);

      if (dist > distThreshold) {
        dx = tdx / dist;
        dy = tdy / dist;
      } else {
        this.clickTarget = null;
        this.stuckTime = 0;
      }
    }

    const wasMoving = this.isMoving;
    this.isMoving = dx !== 0 || dy !== 0;

    if (this.isMoving) {
      this.idleTime = 0;

      const airborne = performance.now() < this.jumpUntil;

      // Clear manual emote / idle fidget when starting to walk (a jump finishes its hop)
      if (this.emoteTimeout && !airborne) {
        clearTimeout(this.emoteTimeout);
        this.emoteTimeout = null;
      }
      if (this.fidgetTimeout) {
        clearTimeout(this.fidgetTimeout);
        this.fidgetTimeout = null;
      }

      // Normalize diagonal
      let moveX = dx;
      let moveY = dy;
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      if (len > 0) {
        moveX /= len;
        moveY /= len;
      }

      // Body direction from the dominant axis (pure diagonals read as side-walk)
      if (Math.abs(moveX) >= Math.abs(moveY) * 0.75) {
        this.moveDir = 'side';
      } else {
        this.moveDir = moveY < 0 ? 'up' : 'down';
      }
      // Left/right facing — ignore tiny x drift so click-to-move up/down doesn't flicker
      if (moveX < -0.2) this.localPlayer.facing = -1;
      if (moveX > 0.2) this.localPlayer.facing = 1;

      // Speed (swimming is slightly slower than walking)
      let speed = this.localPlayer.state === 'water' ? 120 : 160;
      speed *= this.actorScale;
      const sprinting = this.isRunning && this.localPlayer.state === 'land';
      if (sprinting) speed *= 1.6;

      const oldX = this.localPlayer.x;
      const oldY = this.localPlayer.y;
      const moved = this.attemptMove(oldX + moveX * speed * dt, oldY + moveY * speed * dt);

      // Click-to-move that runs into furniture gives up instead of walking in place forever
      if (this.clickTarget) {
        const progress = Math.hypot(this.localPlayer.x - oldX, this.localPlayer.y - oldY);
        this.stuckTime = !moved || progress < speed * dt * 0.25 ? this.stuckTime + dt : 0;
        if (this.stuckTime > 0.25) {
          this.clickTarget = null;
          this.stuckTime = 0;
          this.isMoving = false;
          this.localPlayer.currentAction =
            this.localPlayer.state === 'water' ? 'tread' : this.idlePose();
          this.broadcastState();
          return;
        }
      }

      // Step timing follows speed, so running feet don't slide
      const stepInterval = sprinting ? 0.085 : 0.13;
      if (!wasMoving) {
        // First frame of a walk: show a stepping pose immediately (snappy start)
        this.walkFrame = 0;
        this.walkTimer = 0;
      } else {
        this.walkTimer += dt;
      }
      if (this.walkTimer > stepInterval) {
        this.walkTimer -= stepInterval;
        this.walkFrame = (this.walkFrame + 1) % 4;

        if (this.localPlayer.state === 'land') {
          // Contact frames: soft footstep (+ a little dust when running)
          if (this.walkFrame === 0 || this.walkFrame === 2) {
            const now = Date.now();
            if (now - this.lastFootstepTime > (sprinting ? 170 : 260)) {
              sound.playFootstep();
              this.lastFootstepTime = now;
            }
            if (sprinting) this.createRunDust(this.localPlayer.x, this.localPlayer.y);
          }
        } else {
          // Water swim ripple
          this.createSwimRipples(this.localPlayer.x, this.localPlayer.y);
        }
      }

      if (this.localPlayer.state === 'land') {
        if (!airborne) this.localPlayer.currentAction = WALK_CYCLES[this.moveDir][this.walkFrame];
      } else {
        // Water swimming: alternate swim strokes
        this.localPlayer.currentAction = (this.walkFrame % 2 === 0) ? 'swim1' : 'swim2';
      }

      this.broadcastState(false);
    } else {
      this.stuckTime = 0;
      if (wasMoving) {
        // Stop facing the way we walked: down → front, up → back, left/right → side
        this.localPlayer.currentAction =
          this.localPlayer.state === 'land' ? this.idlePose() : 'tread';
        this.broadcastState();
      } else {
        this.updateIdleFidget(dt);
      }
    }
  }

  /** Sprite-key prefix for land poses in this room: the room's outfit if its art is
   *  loaded, otherwise the swimsuit (land_2_0x in close-up rooms). */
  private landPrefix(): string {
    const o = this.room.outfit;
    if (o && o !== 'swim' && this.sprites.has(`outfit_${o}_idle`)) return `outfit_${o}_`;
    return this.actorScale > 1 ? `${landFolder(this.actorScale)}_` : 'land_';
  }

  /** Standing pose that matches the last walking direction. */
  private idlePose(): string {
    if (this.moveDir === 'up') return 'back_idle';
    if (this.moveDir === 'side') return 'side_idle';
    return 'idle';
  }

  /** True when the player is just standing around on land with nothing else going on. */
  private isIdleStanding(): boolean {
    const a = this.localPlayer.currentAction;
    return (
      this.localPlayer.state === 'land' &&
      !this.isMoving &&
      this.seatedIndex < 0 &&
      !this.dialogFrozen &&
      this.emoteTimeout === null &&
      this.fidgetTimeout === null &&
      (a === 'idle' || a === 'side_idle' || a === 'back_idle')
    );
  }

  /** Small signs of life after standing still for a while (like Animal Crossing / Pokémon):
   *  glance around, turn to face the camera, or think for a moment. */
  private updateIdleFidget(dt: number) {
    if (!this.isIdleStanding()) {
      this.idleTime = 0;
      return;
    }
    this.idleTime += dt;
    if (this.idleTime < this.nextFidgetAt) return;
    this.idleTime = 0;
    this.nextFidgetAt = 7 + Math.random() * 9;

    const back = (restore: () => void, ms: number) => {
      this.fidgetTimeout = window.setTimeout(() => {
        this.fidgetTimeout = null;
        if (this.isMoving || this.seatedIndex >= 0 || this.dialogFrozen) return;
        restore();
        this.broadcastState();
      }, ms);
    };

    if (this.moveDir === 'up') {
      // Been staring at the wall — turn around to look at the player
      this.moveDir = 'down';
      this.localPlayer.currentAction = 'idle';
    } else if (this.moveDir === 'side' && Math.random() < 0.6) {
      // Glance the other way, then back
      const original = this.localPlayer.facing;
      this.localPlayer.facing = (original === 1 ? -1 : 1);
      back(() => { this.localPlayer.facing = original; }, 900);
    } else {
      // Think for a moment — or yawn / stretch / look back once that art exists
      const prefix = this.landPrefix();
      const pool = ['thinking', ...FIDGET_EXTRAS.filter((a) => this.sprites.has(prefix + a))];
      const fidget = pool[Math.floor(Math.random() * pool.length)];
      const pose = this.idlePose();
      this.localPlayer.currentAction = fidget;
      back(() => {
        if (this.localPlayer.currentAction === fidget) this.localPlayer.currentAction = pose;
      }, 1600);
    }
    this.broadcastState();
  }

  private createRunDust(x: number, y: number) {
    const behind = -this.localPlayer.facing;
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: x + behind * (6 + Math.random() * 6),
        y: y - 1,
        vx: behind * (0.3 + Math.random() * 0.5),
        vy: -0.15 - Math.random() * 0.35,
        size: 2 + Math.round(Math.random()),
        alpha: 0.6,
        color: '#d9cbb0',
        life: 0,
        maxLife: 16,
      });
    }
  }

  /** Depth-sort y for a player: someone sitting/lying on furniture is drawn just in front
   *  of it (their feet are higher up than the furniture's base). Works for remote players
   *  too, because a seated player's position is exactly the seat spot. */
  private sortYFor(player: PlayerData): number {
    if (player.currentAction === 'sit' || player.currentAction === 'lie') {
      for (const seat of this.mergedSeats) {
        if (Math.abs(seat.x - player.x) < 2 && Math.abs(seat.y - player.y) < 2) {
          return Math.max(player.y, seat.sortY);
        }
      }
    }
    return player.y;
  }

  /** How long (ms) this player has been in their current pose. Tracked by watching
   *  pose changes, so it works for remote players without any network change. */
  private poseAge(player: PlayerData, now: number): number {
    const rec = this.poseStart.get(player.id);
    if (!rec || rec.action !== player.currentAction) {
      this.poseStart.set(player.id, { action: player.currentAction, t: now });
      return 0;
    }
    return now - rec.t;
  }

  /** Column of the head's center in a sprite (average of opaque pixels in the head band).
   *  AI-drawn frames put the head at slightly different x positions; anchoring on it
   *  stops the character sliding back and forth between walk frames. Cached per image. */
  private getHeadAnchor(img: HTMLImageElement): number {
    const cached = this.headAnchor.get(img);
    if (cached !== undefined) return cached;
    let ax = Math.floor(img.width / 2);
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (g && img.complete && img.width > 0) {
        g.drawImage(img, 0, 0);
        const y0 = Math.floor(img.height * 0.08);
        const y1 = Math.floor(img.height * 0.3);
        const data = g.getImageData(0, y0, img.width, y1 - y0).data;
        let sum = 0;
        let n = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 100) {
            sum += ((i - 3) / 4) % img.width;
            n++;
          }
        }
        if (n > 0) ax = Math.round(sum / n);
      }
    } catch {
      // Canvas read blocked — fall back to the image center
    }
    if (img.complete) this.headAnchor.set(img, ax);
    return ax;
  }

  /** Point-vs-obstacle test (the player's feet are the collision point). */
  private isBlocked(x: number, y: number): boolean {
    for (const obs of this.mergedObstacles) {
      if (x >= obs.x && x <= obs.x + obs.width && y >= obs.y && y <= obs.y + obs.height) {
        return true;
      }
    }
    return false;
  }

  /** Move with wall-sliding: if the diagonal is blocked, try each axis on its own.
   *  Returns true when the player actually moved. */
  private attemptMove(targetX: number, targetY: number): boolean {
    // Clamp to map boundaries using room bounds
    const { minX, maxX, minY, maxY } = this.room.bounds;
    const cx = Math.max(minX, Math.min(maxX, targetX));
    const cy = Math.max(minY, Math.min(maxY, targetY));
    const ox = this.localPlayer.x;
    const oy = this.localPlayer.y;

    let nx = cx;
    let ny = cy;
    if (this.isBlocked(nx, ny)) {
      if (cx !== ox && !this.isBlocked(cx, oy)) {
        ny = oy; // slide horizontally along the obstacle
      } else if (cy !== oy && !this.isBlocked(ox, cy)) {
        nx = ox; // slide vertically along the obstacle
      } else {
        return false;
      }
    }

    // Water enter/exit logic — only when the room has water zones
    const hasWater = this.room.waterZones && this.room.waterZones.length > 0;
    if (hasWater) {
      const prevState = this.localPlayer.state;
      const isInsideWater = this.isPointInWater(nx, ny);

      if (isInsideWater && prevState === 'land') {
        // Jump/step into water
        this.localPlayer.state = 'water';
        this.localPlayer.currentAction = this.isMoving ? 'swim1' : 'tread';
        sound.playSplash();
        this.createSplashParticles(nx, ny);
      } else if (!isInsideWater && prevState === 'water') {
        // Step onto land deck
        this.localPlayer.state = 'land';
        this.localPlayer.currentAction = this.isMoving ? 'walk1' : this.idlePose();
        sound.playFootstep();
        this.createLandDripParticles(nx, ny);
      }
    }

    this.localPlayer.x = nx;
    this.localPlayer.y = ny;

    // Check room exits
    if (this.room.exits && this.fadeDirection === 'none') {
      for (const exit of this.room.exits) {
        const [ex, ey, ew, eh] = exit.triggerBox;
        if (nx >= ex && nx <= ex + ew && ny >= ey && ny <= ey + eh) {
          if (rooms[exit.targetRoom]) {
            this.changeRoom(exit.targetRoom);
            break;
          }
        }
      }
    }

    return nx !== ox || ny !== oy;
  }

  private isPointInWater(x: number, y: number): boolean {
    if (!this.room.waterZones) return false;
    for (const w of this.room.waterZones) {
      if (x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height) {
        return true;
      }
    }
    return false;
  }

  private updateRemotePlayers(dt: number) {
    const now = Date.now();
    for (const [id, remote] of this.remotePlayers.entries()) {
      // Disconnect timeout: 20 seconds
      if (now - remote.lastUpdate > 20000) {
        this.remotePlayers.delete(id);
        if (this.onPlayerCountChange) {
          this.onPlayerCountChange(this.getLocalRoomPlayerCount());
        }
        continue;
      }

      // Smooth lerp movement toward network target
      const lerpFactor = Math.min(1, dt * 10);
      remote.data.x += (remote.targetX - remote.data.x) * lerpFactor;
      remote.data.y += (remote.targetY - remote.data.y) * lerpFactor;
    }
  }

  // =========================================================================
  // PARTICLES
  // =========================================================================

  private createSplashParticles(x: number, y: number) {
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.particles.push({
        x,
        y: y - 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        size: Math.random() * 3 + 2,
        alpha: 1,
        color: Math.random() > 0.4 ? '#ffffff' : '#68d8d6',
        life: 0,
        maxLife: 35
      });
    }
  }

  private createSwimRipples(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() * 20 - 10),
      y: y + 8,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: 4,
      alpha: 0.8,
      color: '#b2ebf2',
      life: 0,
      maxLife: 25
    });
  }

  private createJumpParticles(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: x + (Math.random() * 24 - 12),
        y: y + 2,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 1.5,
        size: 2,
        alpha: 0.8,
        color: '#c2b280',
        life: 0,
        maxLife: 20
      });
    }
  }

  private createLandDripParticles(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: x + (Math.random() * 16 - 8),
        y: y,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.2,
        size: 2,
        alpha: 0.7,
        color: '#80deea',
        life: 0,
        maxLife: 30
      });
    }
  }

  private updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  private render() {
    this.ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const hasView = !!this.room.view;
    const hour = bangkokHour(undefined, this.room.view?.fixedHour);
    const sky = skyAt(hour);

    if (hasView) {
      this.updateSkyAndCityCache(hour);

      // L0. Sky gradient (full canvas)
      this.ctx.drawImage(this.skyCanvas, 0, 0);

      // L0.5. Far movers (clouds, birds, plane)
      this.movers.render(this.ctx, 'far', this.moverSprites, sky.night);

      // L0.7. City panorama at (cityOffsetX, CITY.y), multiplied by skyAt().cityTint
      const offsetX = this.room.view!.cityOffsetX;
      this.ctx.drawImage(this.cityCanvas, offsetX, CITY.y);

      // L0.8. Near movers (train)
      this.movers.render(this.ctx, 'near', this.moverSprites, sky.night);

      // L1. Room background (transparent windows)
      if (this.bgImage) {
        this.ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);
      }
    } else {
      // 1. Background (poolside / standard)
      if (this.bgImage) {
        this.ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);
      } else {
        this.ctx.fillStyle = '#4079d0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    // 2. Click destination marker
    if (this.clickTarget) {
      this.renderClickMarker(this.clickTarget.x, this.clickTarget.y);
    }

    // 3. Wall elements (drawn right after background)
    if (this.room.elements) {
      for (const el of this.room.elements) {
        if (el.layer === 'wall') this.renderElement(el);
      }
    }

    // 3b. Club genre banner (wall layer, stage panel rect x 141–516, y 42–219)
    if (this.room.roomId === 'club') {
      const bannerImg = this.elementImages.get('club_stage_banner');
      if (bannerImg && bannerImg.complete && bannerImg.width > 0) {
        const boxX = 141;
        const boxY = 42;
        const boxW = 516 - 141; // 375
        const boxH = 219 - 42;  // 177
        const scale = Math.min(boxW / bannerImg.width, boxH / bannerImg.height);
        const dw = Math.round(bannerImg.width * scale);
        const dh = Math.round(bannerImg.height * scale);
        const dx = Math.round(boxX + (boxW - dw) / 2);
        const dy = Math.round(boxY + (boxH - dh) / 2);
        this.ctx.drawImage(bannerImg, dx, dy, dw, dh);
      }
    }

    // 4. Floor elements (under all characters)
    if (this.room.elements) {
      for (const el of this.room.elements) {
        if (el.layer === 'floor') this.renderElement(el);
      }
    }

    // 5. Particles (splash / ripples)
    this.renderParticles();

    // 6. Depth-sorted list: object elements + NPCs + players
    const time = performance.now();
    const drawFns: { y: number; draw: () => void }[] = [];
    const overlayFns: (() => void)[] = [];

    // 6a. Object-layer elements
    if (this.room.elements) {
      for (const el of this.room.elements) {
        if (el.layer === 'object') {
          const capturedEl = el;
          drawFns.push({ y: el.y, draw: () => this.renderElement(capturedEl) });
        }
      }
    }

    // 6b. NPCs (depth-sorted by dynamic feet y)
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const state = this.getNpcRenderState(npc, time);
        const capturedNpc = npc;
        const capturedState = state;
        drawFns.push({
          y: capturedState.y,
          draw: () => {
            this.renderNpcSprite(capturedNpc, capturedState, time);
            // Defer NPC nametag + prompt bubble as overlay
            overlayFns.push(() => this.renderNpcOverlay(capturedNpc, capturedState, time));
          }
        });
      }
    }

    // 6c. All players (local + remote in same room)
    const allPlayers: PlayerData[] = [this.localPlayer];
    for (const r of this.remotePlayers.values()) {
      if ((r.data.roomId || 'poolside') === this.room.roomId) {
        allPlayers.push(r.data);
      }
    }
    for (const player of allPlayers) {
      const sprite = this.getPlayerSprite(player);
      const h = sprite?.height ?? 82;
      let drawY = player.y;
      if (player.state === 'water') {
        drawY += Math.sin((time * 0.0035) + player.x * 0.05) * 3;
      }
      // Jump: one hop that starts when the jump pose starts (works for remote players too)
      let air = 0; // 0 = on the ground, 1 = top of the hop
      const age = this.poseAge(player, time); // track every frame so each new pose restarts its clock
      if (player.currentAction === 'jump' && player.state === 'land') {
        const t = Math.min(1, age / JUMP_MS);
        air = 4 * t * (1 - t);
        drawY -= Math.round(air * JUMP_HEIGHT * this.actorScale);
      }
      // Feet stay planted on the ground: the legs in the walk frames do the stepping
      const capturedX = player.x;
      const capturedPlayer = player;
      const capturedSprite = sprite;
      const capturedDrawY = drawY;
      const capturedH = h;
      const capturedAir = air;
      drawFns.push({
        y: this.sortYFor(player),
        draw: () => {
          this.renderPlayerSprite(capturedPlayer, capturedDrawY, capturedSprite, capturedX, capturedAir);
          // Defer nametag + bubble as overlays
          overlayFns.push(() => this.renderPlayerOverlay(capturedPlayer, capturedDrawY, capturedH));
        }
      });
    }

    // Sort by y ascending and draw
    drawFns.sort((a, b) => a.y - b.y);
    for (const d of drawFns) {
      d.draw();
    }

    // L4. Night: if night > 0, multiply canvas with rgba(20,24,60, 0.45*night),
    // then add ROOM_LIGHTS as soft radial glows ('lighter', alpha 0.35*night)
    if (hasView && sky.night > 0) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'multiply';
      this.ctx.fillStyle = `rgba(20, 24, 60, ${0.45 * sky.night})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();

      const lights = ROOM_LIGHTS[this.room.roomId];
      if (lights && lights.length > 0) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        for (const light of lights) {
          const grad = this.ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
          const [r, g, b] = light.color;
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.35 * sky.night})`);
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          this.ctx.fillStyle = grad;
          this.ctx.beginPath();
          this.ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      }
    }

    // 7. Overlays (name tags, speech bubbles) — always on top
    for (const fn of overlayFns) {
      fn();
    }

    // 8. Debug overlay (F3)
    if (this.showDebug) {
      this.renderDebugOverlay();
    }

    // 9. Fade to/from black overlay
    if (this.fadeAlpha > 0) {
      this.ctx.save();
      this.ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, this.fadeAlpha))})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }
  }

  // =========================================================================
  // SPRITE HELPERS
  // =========================================================================

  /** Select the correct sprite for a player, accounting for actorScale. */
  private getPlayerSprite(player: PlayerData): HTMLImageElement | undefined {
    const isWater = player.state === 'water';

    if (isWater) {
      const color = player.floatColor || 'red';
      const action = player.currentAction || 'idle';
      let spriteKey = `water_${color}_${action}`;
      if (!this.sprites.has(spriteKey)) {
        if (action.startsWith('swim') && this.sprites.has(`water_${color}_swim`)) {
          spriteKey = `water_${color}_swim`;
        } else {
          spriteKey = `water_${color}_idle`;
        }
      }
      return this.sprites.get(spriteKey) || this.sprites.get('land_idle');
    }

    const action = player.currentAction || 'idle';
    const prefix = this.landPrefix();

    // Blink for ~140ms every ~4s while standing (only once idle_blink / side_idle_blink art exists).
    // Offset by player id so a crowd doesn't blink in sync.
    if (action === 'idle' || action === 'side_idle') {
      const blink = this.sprites.get(prefix + action + '_blink');
      if (blink && (performance.now() + idHash(player.id)) % 4200 < 140) return blink;
    }

    // Walk frames we don't have art for yet borrow the nearest idle pose
    // (drop real walk_down1.webp etc. into the manifest and they're used automatically)
    const fallback = POSE_FALLBACK[action] ?? 'idle';

    return (
      this.sprites.get(prefix + action) ||
      this.sprites.get(prefix + fallback) ||
      this.sprites.get(prefix + 'idle') ||
      this.sprites.get('land_' + action) ||
      this.sprites.get('land_idle')
    );
  }

  /** Pick a pose for an NPC based on time. Respects pose overrides and uses
   *  a natural idle/blink pattern (blink for 150ms every ~4s). */
  private getNpcAction(npcId: string, time: number): string {
    // Check for pose override first (dialog sequence, post-dialog wai, etc.)
    const override = this.npcPoseOverride.get(npcId);
    if (override) {
      if (time < override.until) {
        return override.pose;
      }
      this.npcPoseOverride.delete(npcId);
    }

    // Blink animation: 150ms blink every ~4s
    if (!this.npcSprites.has(`npc_${npcId}_blink`)) return 'idle';

    let timer = this.npcBlinkTimers.get(npcId);
    if (!timer) {
      timer = { nextBlink: time + 3000 + Math.random() * 2000, blinkEnd: 0 };
      this.npcBlinkTimers.set(npcId, timer);
    }

    if (time >= timer.blinkEnd && time >= timer.nextBlink) {
      // Start a blink
      timer.blinkEnd = time + 150;
      timer.nextBlink = time + 3500 + Math.random() * 2000;
    }

    if (time < timer.blinkEnd) {
      return 'blink';
    }

    return 'idle';
  }

  // =========================================================================
  // ELEMENT / NPC / PLAYER RENDER METHODS
  // =========================================================================

  /** Draw a room element at its anchor (bottom-centre). */
  private renderElement(el: ElementDef) {
    const img = this.elementImages.get(el.asset);
    if (!img) return;
    this.ctx.drawImage(img, el.x - Math.floor(img.width / 2), el.y - img.height);
  }

  /** Check if NPC is currently in a natural blink frame. */
  private isNpcBlinking(npcId: string, time: number): boolean {
    if (!this.npcSprites.has(`npc_${npcId}_blink`)) return false;
    let timer = this.npcBlinkTimers.get(npcId);
    if (!timer) {
      timer = { nextBlink: time + 3000 + Math.random() * 2000, blinkEnd: 0 };
      this.npcBlinkTimers.set(npcId, timer);
    }
    if (time >= timer.blinkEnd && time >= timer.nextBlink) {
      timer.blinkEnd = time + 150;
      timer.nextBlink = time + 3500 + Math.random() * 2000;
    }
    return time < timer.blinkEnd;
  }

  /** Compute deterministic scheduled state for an NPC from global Date.now(). */
  private getScheduledNpcState(npc: NpcDef, clockNow: number, perfTime: number): NpcRenderState {
    let cycle = this.npcWanderCycles.get(npc.id);
    if (!cycle) {
      cycle = buildWanderCycle(npc, this.actorScale) ?? undefined;
      if (cycle) this.npcWanderCycles.set(npc.id, cycle);
    }
    if (!cycle) {
      return {
        x: npc.x,
        y: npc.y,
        facing: npc.facing,
        action: this.getNpcAction(npc.id, perfTime),
      };
    }

    const cycleTime = clockNow % cycle.totalCycleMs;
    const seg = findWanderSegment(cycle.segments, cycleTime);
    const elapsedInSeg = cycleTime - seg.startTime;

    const override = this.npcPoseOverride.get(npc.id);
    let overridePose: string | null = null;
    if (override) {
      if (perfTime < override.until) {
        overridePose = override.pose;
      } else {
        this.npcPoseOverride.delete(npc.id);
      }
    }

    if (elapsedInSeg < seg.walkMs) {
      // Walking: frame chosen by distance travelled (4-frame cycle), so steps match the speed
      const progress = elapsedInSeg / seg.walkMs;
      const x = Math.round(seg.startX + (seg.targetX - seg.startX) * progress);
      const y = Math.round(seg.startY + (seg.targetY - seg.startY) * progress);
      const travelled = Math.hypot(x - seg.startX, y - seg.startY);
      const action = overridePose || npcWalkFrame(travelled, this.actorScale);
      return { x, y, facing: seg.facing, action };
    } else {
      // Paused: settle in the side pose first, then the idle pose; blink sometimes
      let action = (elapsedInSeg - seg.walkMs) < NPC_SETTLE_MS ? 'side_idle' : seg.idlePose;
      if (this.isNpcBlinking(npc.id, perfTime)) {
        action = 'blink';
      }
      if (overridePose) {
        action = overridePose;
      }
      return { x: seg.targetX, y: seg.targetY, facing: seg.facing, action };
    }
  }

  /** Compute full render state (wander, dialog freeze, or ease). */
  private getNpcRenderState(npc: NpcDef, perfTime: number): NpcRenderState {
    if (!npc.wander) {
      return {
        x: npc.x,
        y: npc.y,
        facing: npc.facing,
        action: this.getNpcAction(npc.id, perfTime),
      };
    }

    const rt = this.npcRuntime.get(npc.id);
    const override = this.npcPoseOverride.get(npc.id);
    let overridePose: string | null = null;
    if (override) {
      if (perfTime < override.until) {
        overridePose = override.pose;
      } else {
        this.npcPoseOverride.delete(npc.id);
      }
    }

    // 1. Frozen locally during dialog
    if (rt && rt.frozen) {
      return {
        x: rt.frozenX,
        y: rt.frozenY,
        facing: rt.frozenFacing,
        action: overridePose || 'idle',
      };
    }

    // 2. Easing back to scheduled position after dialog closes (600ms)
    if (rt && rt.easeStartTime > 0) {
      const elapsedEase = perfTime - rt.easeStartTime;
      if (elapsedEase < rt.easeDuration) {
        const t = Math.min(1, Math.max(0, elapsedEase / rt.easeDuration));
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const sched = this.getScheduledNpcState(npc, Date.now(), perfTime);
        const curX = Math.round((1 - ease) * rt.easeStartX + ease * sched.x);
        const curY = Math.round((1 - ease) * rt.easeStartY + ease * sched.y);
        const facing: 1 | -1 = sched.x >= curX ? 1 : -1;
        const travelled = Math.hypot(curX - rt.easeStartX, curY - rt.easeStartY);
        const action = overridePose || (travelled < 2 ? 'side_idle' : npcWalkFrame(travelled, this.actorScale));
        return { x: curX, y: curY, facing, action };
      } else {
        rt.easeStartTime = 0;
      }
    }

    // 3. Normal scheduled position
    return this.getScheduledNpcState(npc, Date.now(), perfTime);
  }

  private getNpcCurrentState(npc: NpcDef): NpcRenderState {
    return this.getNpcRenderState(npc, performance.now());
  }

  private isPlayerInNpcTalkRange(npc: NpcDef, state?: NpcRenderState): boolean {
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    const curState = state ?? this.getNpcCurrentState(npc);
    const spot = this.npcTalkSpots.get(npc.id);

    if (spot) {
      const spotX = curState.x + spot.dx;
      const spotY = curState.y + spot.dy;
      const dx = px - spotX;
      const dy = py - spotY;
      if (Math.hypot(dx, dy) <= spot.radius) return true;
    }
    const distToBody = Math.hypot(px - curState.x, py - curState.y);
    return distToBody <= 65;
  }

  /** Draw an NPC sprite at native size. */
  private renderNpcSprite(
    npc: NpcDef,
    state: NpcRenderState,
    _time: number
  ) {
    if (this.dialogFrozen && this.dialogNpcId === npc.id && !npc.wander) return;
    if (state.action === 'hidden') return;
    const spriteKey = `npc_${npc.id}_${state.action}`;
    const sprite = this.npcSprites.get(spriteKey) || this.npcSprites.get(`npc_${npc.id}_idle`);
    if (!sprite) return;

    // Shadow
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(20, 25, 40, 0.22)';
    this.ctx.beginPath();
    const shadowRx = Math.round(17 * (this.actorScale || 1));
    const shadowRy = Math.round(5 * (this.actorScale || 1));
    this.ctx.ellipse(state.x, state.y - 2, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Sprite (bottom-centre anchor, native size; side frames face RIGHT so flip for leftward)
    this.ctx.save();
    this.ctx.translate(state.x, state.y);
    if (state.facing === -1) {
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(sprite, -Math.floor(sprite.width / 2), -sprite.height);
    this.ctx.restore();
  }

  /** Deferred: NPC name tag + prompt bubble (drawn above all depth-sorted items). */
  private renderNpcOverlay(
    npc: NpcDef,
    state: NpcRenderState,
    time: number
  ) {
    const sprite = this.npcSprites.get(`npc_${npc.id}_idle`);
    const h = sprite?.height ?? 82;
    // Hide all name tags while dialog is open
    if (!this.dialogFrozen) {
      const tagData: PlayerData = {
        id: '__npc_' + npc.id,
        name: npc.name,
        x: state.x,
        y: state.y,
        state: 'land',
        facing: state.facing,
        floatColor: 'gray',
        currentAction: 'idle',
        timestamp: 0
      };
      this.renderNameTag(tagData, state.x, state.y - h - 6);
    }

    // Prompt bubble: show "◯" above NPC when player is in range and no dialog open
    if (!this.dialogFrozen) {
      if (this.isPlayerInNpcTalkRange(npc, state)) {
        this.renderPromptBubble(state.x, state.y - h - 24, time);
      }
    }
  }

  /** Draw a player's sprite (shadow, character, jump). */
  private renderPlayerSprite(player: PlayerData, drawY: number, spriteImg: HTMLImageElement | undefined, drawX: number = player.x, air: number = 0) {
    if (!spriteImg) return;
    const isWater = player.state === 'water';
    // Snap to whole pixels so the sprite never blurs between two pixels
    const sx = Math.round(drawX);
    const sy = Math.round(drawY);
    const groundX = Math.round(player.x);
    const groundY = Math.round(player.y);

    // Shadow on land
    if (!isWater) {
      this.ctx.save();
      // Shadow shrinks and fades while in the air
      this.ctx.fillStyle = `rgba(20, 25, 40, ${(0.28 * (1 - 0.45 * air)).toFixed(3)})`;
      this.ctx.beginPath();
      const shrink = 1 - 0.3 * air;
      const shadowRadiusX = Math.round(Math.max(16, spriteImg.width * 0.38) * shrink);
      const shadowRadiusY = Math.round(Math.max(5, spriteImg.width * 0.13) * shrink);
      this.ctx.ellipse(groundX, groundY - 2, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Character sprite with horizontal flipping
    this.ctx.save();
    this.ctx.translate(sx, sy);
    if (player.facing === -1) {
      this.ctx.scale(-1, 1);
    }
    // Anchor: bottom, lined up on the head so the body doesn't wobble between poses
    const w = spriteImg.width;
    const h = spriteImg.height;
    const ax = !isWater && HEAD_ANCHOR.has(player.currentAction)
      ? this.getHeadAnchor(spriteImg)
      : Math.floor(w / 2);
    this.ctx.drawImage(spriteImg, -ax, -h);
    this.ctx.restore();
  }

  /** Deferred: player name tag + speech bubble (drawn above all depth-sorted items). */
  private renderPlayerOverlay(player: PlayerData, drawY: number, spriteHeight: number) {
    // Hide all name tags while dialog is open
    if (!this.dialogFrozen) {
      this.renderNameTag(player, player.x, drawY - spriteHeight - 6);
    }

    // Speech Bubble
    if (player.lastMessage && player.messageTime) {
      const elapsed = (Date.now() - player.messageTime) / 1000;
      if (elapsed < 5.0) {
        const fadeAlpha = elapsed > 4.0 ? 1 - (elapsed - 4.0) : 1;
        this.renderSpeechBubble(player.lastMessage, player.x, drawY - spriteHeight - 26, fadeAlpha);
      }
    }
  }

  // =========================================================================
  // COMMON RENDER HELPERS
  // =========================================================================

  private renderClickMarker(x: number, y: number) {
    this.ctx.save();
    const pulse = (Math.sin(performance.now() * 0.008) + 1) * 0.5;
    this.ctx.strokeStyle = '#ffd700';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, 10 + pulse * 4, 5 + pulse * 2, 0, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.fillStyle = '#ffd700';
    this.ctx.fillRect(x - 1, y - 1, 2, 2);
    this.ctx.restore();
  }

  private renderParticles() {
    this.ctx.save();
    for (const p of this.particles) {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    this.ctx.restore();
  }

  private renderNameTag(player: PlayerData, x: number, y: number) {
    this.ctx.save();
    const isMe = player.id === this.localPlayer.id;
    const nameText = isMe ? `${player.name} (You)` : player.name;

    this.ctx.font = '8px "Nuan Pixel", monospace';
    const textWidth = this.ctx.measureText(nameText).width;
    const paddingX = 6;
    const boxW = textWidth + paddingX * 2;
    const boxH = 14;

    const boxX = Math.floor(x - boxW / 2);
    const boxY = Math.floor(y - boxH);

    // Pill background
    this.ctx.fillStyle = isMe ? 'rgba(15, 32, 67, 0.85)' : 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(boxX, boxY, boxW, boxH);

    // Outline
    this.ctx.strokeStyle = isMe ? '#4fc3f7' : '#90a4ae';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Text
    this.ctx.fillStyle = isMe ? '#e1f5fe' : '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(nameText, x, boxY + boxH / 2 + 1);

    this.ctx.restore();
  }

  private renderSpeechBubble(text: string, x: number, y: number, alpha: number) {
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    this.ctx.font = '16px "Nuan Pixel", monospace';
    const maxLineWidth = 180;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (this.ctx.measureText(testLine).width < maxLineWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);

    // Calculate bubble dimensions
    let maxMeasured = 0;
    for (const l of lines) {
      maxMeasured = Math.max(maxMeasured, this.ctx.measureText(l).width);
    }

    const lineHeight = 22; // Nuan Pixel 16px + room for Thai tone marks
    const padX = 10;
    const padY = 8;
    const bw = maxMeasured + padX * 2;
    const bh = lines.length * lineHeight + padY * 2;

    const bx = Math.floor(x - bw / 2);
    const by = Math.floor(y - bh);

    // 8-bit Pixel Bubble Background (white with crisp black pixel border)
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(bx, by, bw, bh);

    this.ctx.strokeStyle = '#1a1a24';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(bx, by, bw, bh);

    // Speech bubble tail pointing down
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.moveTo(x - 6, by + bh);
    this.ctx.lineTo(x, by + bh + 6);
    this.ctx.lineTo(x + 6, by + bh);
    this.ctx.fill();

    this.ctx.strokeStyle = '#1a1a24';
    this.ctx.beginPath();
    this.ctx.moveTo(x - 6, by + bh);
    this.ctx.lineTo(x, by + bh + 6);
    this.ctx.lineTo(x + 6, by + bh);
    this.ctx.stroke();

    // Cover seam between tail and bubble
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(x - 5, by + bh - 2, 10, 3);

    // Text lines
    this.ctx.fillStyle = '#111827';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    for (let idx = 0; idx < lines.length; idx++) {
      this.ctx.fillText(lines[idx], bx + padX, by + padY + idx * lineHeight);
    }

    this.ctx.restore();
  }

  /** Draw a small pixel speech-bubble with ◯ above an NPC's head, gentle 2px bob. */
  private renderPromptBubble(x: number, y: number, time: number) {
    this.ctx.save();
    const bob = Math.sin(time * 0.004) * 2;
    const bx = Math.floor(x - 12);
    const by = Math.floor(y - 18 + bob);
    const bw = 24;
    const bh = 16;

    // Bubble bg
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(bx, by, bw, bh);
    this.ctx.strokeStyle = '#4A2E1A';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(bx, by, bw, bh);

    // Small tail
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.moveTo(x - 3, by + bh);
    this.ctx.lineTo(x, by + bh + 4);
    this.ctx.lineTo(x + 3, by + bh);
    this.ctx.fill();
    this.ctx.strokeStyle = '#4A2E1A';
    this.ctx.beginPath();
    this.ctx.moveTo(x - 3, by + bh);
    this.ctx.lineTo(x, by + bh + 4);
    this.ctx.lineTo(x + 3, by + bh);
    this.ctx.stroke();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(x - 2, by + bh - 1, 4, 2);

    // ◯ symbol
    this.ctx.fillStyle = '#4A2E1A';
    this.ctx.font = '10px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('◯', x, by + bh / 2);
    this.ctx.restore();
  }

  // =========================================================================
  // DIALOG / NPC POSE PUBLIC API
  // =========================================================================

  /** Freeze local movement (called when dialog opens). */
  public setDialogFrozen(frozen: boolean, npcId?: string) {
    this.dialogFrozen = frozen;
    const targetNpcId = frozen && npcId ? npcId : this.dialogNpcId;
    this.dialogNpcId = frozen && npcId ? npcId : null;

    if (frozen) {
      // Stop any current movement
      this.clickTarget = null;
      this.isMoving = false;

      if (npcId && this.room.npcs) {
        const npc = this.room.npcs.find(n => n.id === npcId);
        if (npc) {
          if (npc.wander) {
            const currentPos = this.getNpcCurrentState(npc);
            const facing: 1 | -1 = this.localPlayer.x > currentPos.x ? 1 : -1;
            this.npcRuntime.set(npcId, {
              frozen: true,
              frozenX: currentPos.x,
              frozenY: currentPos.y,
              frozenFacing: facing,
              easeStartTime: 0,
              easeDuration: 0,
              easeStartX: 0,
              easeStartY: 0,
            });

            // Player moves to standAt relative to the NPC's CURRENT position
            if (npc.standAt) {
              const targetX = currentPos.x + npc.standAt.dx;
              const targetY = currentPos.y + npc.standAt.dy;
              const playerFacing = npc.standAt.facing;
              this.walkPlayerTo(targetX, targetY, playerFacing);
            }
          } else {
            // Static NPC (e.g. barista)
            this.localPlayer.facing = npc.x > this.localPlayer.x ? 1 : -1;
          }
        }
      }
      this.localPlayer.currentAction = 'talk';
      this.broadcastState();
    } else {
      // Unfreeze: ease NPC back (600ms) to scheduled position
      if (targetNpcId) {
        const rt = this.npcRuntime.get(targetNpcId);
        if (rt && rt.frozen) {
          rt.frozen = false;
          rt.easeStartTime = performance.now();
          rt.easeDuration = 600;
          rt.easeStartX = rt.frozenX;
          rt.easeStartY = rt.frozenY;
        }
      }
      this.localPlayer.currentAction = 'idle';
      this.broadcastState();
    }
  }

  /** Set a temporary pose override for an NPC (used during dialog). */
  public setNpcPose(npcId: string, pose: string, durationMs: number = 0) {
    const until = durationMs > 0 ? performance.now() + durationMs : Infinity;
    this.npcPoseOverride.set(npcId, { pose, until });
  }

  /** Clear NPC pose override (e.g. when dialog ends). */
  public clearNpcPose(npcId: string) {
    this.npcPoseOverride.delete(npcId);
  }

  /** Make the NPC face toward the local player. */
  public faceNpcTowardPlayer(npcId: string) {
    if (!this.room.npcs) return;
    const npc = this.room.npcs.find(n => n.id === npcId);
    if (npc) {
      const rt = this.npcRuntime.get(npcId);
      if (rt && rt.frozen) {
        rt.frozenFacing = this.localPlayer.x > rt.frozenX ? 1 : -1;
      } else {
        (npc as { facing: 1 | -1 }).facing = this.localPlayer.x > npc.x ? 1 : -1;
      }
    }
  }

  /** Get the current dialog NPC id (or null). */
  public getDialogNpcId(): string | null {
    return this.dialogNpcId;
  }

  /** Whether dialog is currently open (movement frozen). */
  public isDialogOpen(): boolean {
    return this.dialogFrozen;
  }

  /** Get an NPC definition by id from the current room. */
  public getNpcById(npcId: string) {
    return this.room.npcs?.find(n => n.id === npcId) ?? null;
  }

  /**
   * Walk the local player to a target position over time (max ~400ms).
   * Resolves when the player is close enough or the time limit expires.
   */
  public walkPlayerTo(tx: number, ty: number, facing: 1 | -1): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const maxDuration = 400;

      // Set click target so the normal movement system drives the walk
      this.clickTarget = { x: tx, y: ty };

      const check = () => {
        const elapsed = performance.now() - startTime;
        const dx = this.localPlayer.x - tx;
        const dy = this.localPlayer.y - ty;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 6 || elapsed > maxDuration) {
          // Snap to position and face
          this.localPlayer.x = tx;
          this.localPlayer.y = ty;
          this.localPlayer.facing = facing;
          this.clickTarget = null;
          this.isMoving = false;
          this.localPlayer.currentAction = 'idle';
          this.broadcastState();
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  // =========================================================================
  // F3 DEBUG OVERLAY
  // =========================================================================

  private renderDebugOverlay() {
    this.ctx.save();
    this.ctx.globalAlpha = 0.5;

    // Colliders — red
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = 1;
    for (const obs of this.mergedObstacles) {
      this.ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    }

    // Seats — green dots
    this.ctx.fillStyle = '#00ff00';
    for (const seat of this.mergedSeats) {
      this.ctx.beginPath();
      this.ctx.arc(seat.x, seat.y, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // NPC talk spots & wander areas — magenta circles and yellow bounds
    this.ctx.strokeStyle = '#ff00ff';
    this.ctx.lineWidth = 1.5;
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const curState = this.getNpcCurrentState(npc);
        const spot = this.npcTalkSpots.get(npc.id);
        if (spot) {
          const cx = curState.x + spot.dx;
          const cy = curState.y + spot.dy;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, spot.radius, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.fillStyle = '#ff00ff';
          this.ctx.font = '8px monospace';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('Talk', cx, cy - spot.radius - 4);
        }
        if (npc.wander) {
          this.ctx.save();
          this.ctx.strokeStyle = '#ffff00';
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([4, 4]);
          this.ctx.strokeRect(npc.wander.area.x, npc.wander.area.y, npc.wander.area.width, npc.wander.area.height);
          this.ctx.restore();
        }
      }
    }

    // Interaction radii — blue circles
    this.ctx.strokeStyle = '#0088ff';
    this.ctx.lineWidth = 1.5;
    for (const ei of this.elementInteractions) {
      this.ctx.beginPath();
      this.ctx.arc(ei.x, ei.y, ei.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      // Label
      this.ctx.fillStyle = '#0088ff';
      this.ctx.font = '8px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(ei.label, ei.x, ei.y - ei.radius - 4);
    }

    // Element anchors — yellow dots
    if (this.room.elements) {
      this.ctx.fillStyle = '#ffff00';
      for (const el of this.room.elements) {
        this.ctx.beginPath();
        this.ctx.arc(el.x, el.y, 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Room bounds — white dashed rect
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.setLineDash([4, 4]);
    const b = this.room.bounds;
    this.ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    this.ctx.setLineDash([]);

    // Player coords
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '10px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(
      `x:${Math.round(this.localPlayer.x)} y:${Math.round(this.localPlayer.y)} scale:${this.actorScale}`,
      4, 12
    );

    this.ctx.restore();
  }
}
