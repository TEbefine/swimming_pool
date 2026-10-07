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
import { music } from './audio/music';
import { NetworkManager } from './network';
import { rooms } from './rooms';
import { CITY, ROOM_LIGHTS, bangkokHour, skyAt } from './world/cityView';
import { MoversManager } from './world/movers';
import { renderAmbient } from './world/ambient';
import { getTonightGenre } from './rooms/club';
import { FrameBudget, LOW_POWER_QUERY, prefersLowPower } from './frameBudget';
import { ImageLoader, releaseSprite, spriteReady, type Sprite } from './imageLoader';
import { findOpenArea, intersectRect, spanVisible, type ViewRect } from './renderView';
import {
  LabelCache, buildExitSign, buildNameTag, buildPromptBubble, buildSpeechBubble,
  drawExitSign, drawNameTag, drawPromptBubble, drawSpeechBubble, exitSignWidth, nameTagSize, wrapBubbleText,
} from './labelCache';
import { quality, ThrottleWatch, TIER_LABEL } from './quality';

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

/** NPC side walk: the two STRIDE frames only (a standing frame in between made them look like they glide). */
const NPC_WALK_CYCLE = ['walk1', 'walk2'] as const;
/** Ground covered per step at 1× (px). Steps advance by distance, so the feet never slide. */
const NPC_STRIDE_PX = 7;
/** Body lift in the middle of each step at 1× (px) — the little up-down that makes it read as walking. */
const NPC_STEP_BOB_PX = 1.5;
/** With a crowd on screen, only this many name tags are drawn (closest first). Speech bubbles always show. */
const MAX_NAME_TAGS = 12;
/** The painted world is always 1024 × 576 art pixels; the canvas may be smaller (phone camera). */
const WORLD_W = 1024;
const WORLD_H = 576;
/** Story worlds set long ago (view.past): nothing modern in the sky. */
const PAST_SKIP_MOVERS: ReadonlySet<string> = new Set(['plane']);

/** After arriving, stand still this long before starting the pause pose (looks less robotic). */
const NPC_SETTLE_MS = 450;

function npcWalkFrame(distancePx: number, actorScale: number): string {
  const i = Math.floor(distancePx / (NPC_STRIDE_PX * (actorScale || 1))) % NPC_WALK_CYCLE.length;
  return NPC_WALK_CYCLE[i];
}

/** Up-down bob for the current step: 0 when a foot lands, highest halfway through the step. */
function npcStepBob(distancePx: number, actorScale: number): number {
  const k = actorScale || 1;
  const phase = (distancePx / (NPC_STRIDE_PX * k)) % 1;
  return Math.round(Math.sin(phase * Math.PI) * NPC_STEP_BOB_PX * k);
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
  /** Walking bob in px (sprite drawn this much higher; shadow stays on the floor). */
  bob?: number;
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

/** Walk bounce (art px at 1×) on the passing frames. */
const STEP_LIFT_PX = 2;
/** Standing breath: one slow cycle, upper body (above BREATHE_SPLIT of the height) sinks 1 px. */
const BREATHE_MS = 2600;
const BREATHE_SPLIT = 0.62;
const BREATHE_POSES = new Set(['idle', 'side_idle', 'back_idle']);

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
  private bgImage: Sprite | null = null;
  private sprites: Map<string, Sprite> = new Map();
  private elementImages: Map<string, Sprite> = new Map();
  private npcSprites: Map<string, Sprite> = new Map();
  private moverSprites: Map<string, Sprite> = new Map();
  private cityImage: Sprite | null = null;
  public isAssetsLoaded: boolean = false;
  private assetAbort = new AbortController();
  private imageLoader = new ImageLoader(6);
  private manifests = new Map<string, Promise<Record<string, { path: string }>>>();
  private waterManifest: Record<string, Record<string, { path: string }>> = {};
  private waterLoads = new Map<string, Promise<void>>();
  private destroyed = false;
  private roomLoading = false;

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
  private headAnchor: WeakMap<Sprite, number> = new WeakMap();
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
  /** Optional: asked before walking through a room exit. Return false to stay (the story shows why). */
  public exitGuard: ((targetRoom: string) => boolean) | null = null;

  // NPC blink timers: next blink time per NPC
  private npcBlinkTimers: Map<string, { nextBlink: number; blinkEnd: number }> = new Map();

  // Dialog state: movement freeze + NPC pose override
  private dialogFrozen: boolean = false;
  private dialogNpcId: string | null = null;
  private npcPoseOverride: Map<string, { pose: string; until: number }> = new Map();

  // Debug overlay (F3)
  private showDebug: boolean = false;
  private debugFrames = 0;
  private debugSince = 0;
  private debugFps = 0;

  // Loop control
  private animId: number = 0;
  private frameBudget = new FrameBudget();
  private lowPower = prefersLowPower();
  private powerQuery = window.matchMedia(LOW_POWER_QUERY);
  private lastActiveTime = 0;
  /** Last real input (key, tap, D-pad). Long quiet stretches drop to the deep-idle frame rate. */
  private lastInputTime = 0;
  private wakeTimer: number | null = null;
  private lastRenderAt = 0;
  private throttle = new ThrottleWatch();
  private perfHud: HTMLDivElement | null = null;
  private perfWorkMs = 0;
  private perfFrames = 0;
  private perfSince = 0;
  private unsubscribeQuality: (() => void) | null = null;
  private serverRoomCounts: Record<string, number> | null = null;
  private serverRoomCountsAt = 0;

  // What the player can actually see (phones crop the canvas with object-fit: cover)
  private view: ViewRect = { x: 0, y: 0, w: 1024, h: 576 };
  private cssW = 0;
  private cssH = 0;
  private resizeObserver: ResizeObserver | null = null;
  /** See-through part of the room painting (windows / open sky); null = solid painting */
  private openArea: ViewRect | null = null;
  private labels = new LabelCache(320);
  private promptLabel: ReturnType<typeof buildPromptBubble> | null = null;
  /** Night lights pre-drawn once per minute instead of 4 gradients every frame */
  private lightsCanvas: HTMLCanvasElement | null = null;
  private lightsKey = '';
  private shadowCache = new Map<string, HTMLCanvasElement>();
  private chatTimeout: number | null = null;
  private running: boolean = false;
  private identityPaused = false;

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
  /** Extra drawing in world coordinates (fishing line, float, reel bar…).
   *  'world' = right after the characters (the night overlay darkens it), 'top' = after name tags. */
  public isAnimationActive?: () => boolean;
  public onDrawLayer?: (ctx: CanvasRenderingContext2D, layer: 'world' | 'top', time: number) => void;
  /** Extra sideways shake of the local player's sprite in px (e.g. straining on a fishing rod). Feet stay put. */
  public localShakeX = 0;
  /** Phone camera: look at this x instead of the player (e.g. halfway to a fishing float). null = follow the player. */
  public cameraFocusX: number | null = null;

  constructor(canvas: HTMLCanvasElement, room: RoomDefinition, playerName: string = 'Swimmer', initialFloat: FloatColor = 'red') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.room = room;
    this.actorScale = room.actorScale ?? 1;
    music.playForRoom(room.roomId);

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
    this.observeCanvasSize();
    this.unsubscribeQuality = quality.subscribe(() => {
      // A different tier changes what a frame costs: re-learn "normal" before judging again.
      this.throttle.reset(performance.now());
      this.lastActiveTime = performance.now();
    });
    if (typeof location !== 'undefined' && /[?&]perf=1/.test(location.search)) this.createPerfHud();
  }

  /** Cache the canvas's on-screen size (reading clientWidth every frame would force layout). */
  private observeCanvasSize() {
    this.resizeObserver?.disconnect();
    const update = () => {
      this.cssW = this.canvas.clientWidth;
      this.cssH = this.canvas.clientHeight;
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(update);
      this.resizeObserver.observe(this.canvas);
    }
  }

  private markInput = () => {
    if (this.identityPaused) return;
    const now = performance.now();
    this.lastInputTime = now;
    this.lastActiveTime = now;
    // Wake straight away from a slow idle frame instead of waiting for the timer.
    if (this.wakeTimer !== null && this.running && !document.hidden) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
      cancelAnimationFrame(this.animId);
      this.animId = requestAnimationFrame(this.gameLoop);
    }
  };

  private createPerfHud() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9999;pointer-events:none;' +
      'font:11px/1.35 ui-monospace,monospace;color:#d1fae5;background:rgba(2,6,23,.78);' +
      'padding:3px 6px;border-radius:4px;white-space:pre';
    el.textContent = 'perf…';
    document.body.appendChild(el);
    this.perfHud = el;
  }

  private updatePerfHud(now: number) {
    if (!this.perfHud) return;
    if (this.perfSince === 0) this.perfSince = now;
    if (now - this.perfSince < 1000) return;
    const secs = (now - this.perfSince) / 1000;
    const fps = this.perfFrames / secs;
    const work = this.perfWorkMs / Math.max(1, this.perfFrames);
    const q = quality.getSnapshot();
    const seen = Math.round((this.view.w * this.view.h) / (WORLD_W * WORLD_H) * 100);
    const remote = this.remotePlayers.size;
    this.perfHud.textContent =
      `${fps.toFixed(0)} fps · ${work.toFixed(1)} ms/frame · CPU ${(work * fps / 10).toFixed(1)}%\n` +
      `${TIER_LABEL[q.mode]}${q.mode === 'auto' ? ' → ' + TIER_LABEL[q.tier] : ''}${q.stepped ? ' (cooled down)' : ''}` +
      ` · drawn ${seen}% · players ${remote + 1} · labels ${this.labels.size}`;
    this.perfSince = now;
    this.perfFrames = 0;
    this.perfWorkMs = 0;
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
      const previousRoom = existing?.data.roomId;
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
      // Movement packets do not change presence; avoid repainting the entire HUD.
      if (this.onPlayerCountChange && (!existing || previousRoom !== data.roomId)) {
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

    // Crowd relay: head-counts for every room (we only receive the people in our own room)
    this.network.on('room_counts', (_, raw) => {
      this.serverRoomCounts = raw as Record<string, number>;
      this.serverRoomCountsAt = Date.now();
    });

    this.network.on('player_leave', (_, raw) => {
      const { id } = raw as { id: string };
      this.remotePlayers.delete(id);
      this.poseStart.delete(id);
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
    if (this.serverRoomCounts && Date.now() - this.serverRoomCountsAt < 10000) return { ...this.serverRoomCounts };
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
    if (this.destroyed || this.roomLoading || this.fadeDirection !== 'none') return false;
    if (this.room.roomId === roomId) return false;
    const targetRoom = rooms[roomId];
    if (!targetRoom) return false;

    return new Promise<boolean>((resolve) => {
      this.roomLoading = true;
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

          // Switch room & scale (arrive at the matching door if the room has one for where we came from)
          const arrival = targetRoom.arrivals?.[this.room.roomId];
          this.room = targetRoom;
          this.actorScale = targetRoom.actorScale ?? 1;
          music.playForRoom(targetRoom.roomId);
          this.localPlayer.roomId = targetRoom.roomId;
          this.localPlayer.x = arrival?.x ?? targetRoom.spawnPoint.x;
          this.localPlayer.y = arrival?.y ?? targetRoom.spawnPoint.y;
          this.localPlayer.facing = arrival?.facing ?? 1;
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
          if (this.destroyed) { resolve(false); return; }

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
          this.roomLoading = false;
          this.fadeDirection = 'in';
          resolve(true);
        } catch (e) {
          console.error('Failed to change room:', e);
          this.roomLoading = false;
          this.fadeDirection = 'in';
          resolve(false);
        }
      };
    });
  }

  // =========================================================================
  // ASSET LOADING
  // =========================================================================

  private readManifest(path: string): Promise<Record<string, { path: string }>> {
    let pending = this.manifests.get(path);
    if (!pending) {
      pending = fetch(path, { signal: this.assetAbort.signal }).then((res) => {
        if (!res.ok) throw new Error(`Unable to load ${path}`);
        return res.json();
      }).catch((error) => {
        this.manifests.delete(path);
        throw error;
      });
      this.manifests.set(path, pending);
    }
    return pending;
  }

  /** Water art belongs only to the current pool and the colours actually in use. */
  private ensureWaterColor(color: string): Promise<void> {
    if (!this.room.waterZones?.length || this.destroyed) return Promise.resolve();
    const existing = this.waterLoads.get(color);
    if (existing) return existing;
    const entries = this.waterManifest[color];
    if (!entries) return Promise.resolve();
    const signal = this.assetAbort.signal;
    const pending = Promise.all(Object.entries(entries).map(async ([action, info]) => {
      const key = `water_${color}_${action}`;
      if (this.sprites.has(key)) return;
      const image = await this.imageLoader.load(info.path, signal);
      if (image && !signal.aborted) this.sprites.set(key, image);
      else releaseSprite(image);
    })).then(() => {});
    this.waterLoads.set(color, pending);
    return pending;
  }

  public async loadAssets(): Promise<void> {
    if (this.destroyed) return;
    this.isAssetsLoaded = false;
    this.assetAbort.abort();
    this.assetAbort = new AbortController();
    const signal = this.assetAbort.signal;
    const room = this.room;
    // Room-specific images must not grow with the number of places visited.
    // Keep the tiny shared land set; browser HTTP caching handles revisits.
    for (const [key, img] of this.sprites) {
      if (!key.startsWith('land_') || /^land_\d/.test(key)) { releaseSprite(img); this.sprites.delete(key); }
    }
    this.waterLoads.clear();
    this.elementImages.forEach(releaseSprite);
    this.elementImages.clear();
    this.npcSprites.forEach(releaseSprite);
    this.npcSprites.clear();
    releaseSprite(this.bgImage);
    this.bgImage = null;
    this.openArea = null;
    this.lightsKey = '';
    this.lastRenderAt = 0;
    this.throttle.reset(performance.now());
    const loadInto = async (key: string, src: string, target: Map<string, Sprite>) => {
      if (target.has(key)) return;
      const img = await this.imageLoader.load(src, signal);
      if (img && !signal.aborted) target.set(key, img);
      else releaseSprite(img);
    };
    const loadSet = (prefix: string, entries: Record<string, { path: string }>, target = this.sprites) =>
      Promise.all(Object.entries(entries).map(([action, info]) => loadInto(prefix + action, info.path, target)));

    const jobs: Promise<unknown>[] = [];
    jobs.push(this.imageLoader.load(room.backgroundImage, signal).then((img) => {
      if (signal.aborted) { releaseSprite(img); return; }
      this.bgImage = img;
      this.measureOpenArea(img);
    }));
    jobs.push((async () => {
      // The shared manifest contains both land and water dictionaries.
      const manifest = await this.readManifest('/sprites/character_manifest.json') as unknown as {
        land: Record<string, { path: string }>;
        water: Record<string, Record<string, { path: string }>>;
      };
      if (signal.aborted) return;
      this.waterManifest = manifest.water;
      await Promise.all([
        loadSet('land_', manifest.land),
        this.ensureWaterColor(this.localPlayer.floatColor),
        ...[...this.remotePlayers.values()]
          .filter((p) => p.data.roomId === room.roomId)
          .map((p) => this.ensureWaterColor(p.data.floatColor)),
      ]);
    })());
    // Close-up rooms draw the big swimsuit set only when the room has no outfit of its own
    // (landPrefix() prefers the outfit), so don't download both.
    const loadScaledLand = async (): Promise<void> => {
      if (this.actorScale <= 1 || signal.aborted) return;
      const folder = landFolder(this.actorScale);
      const m = await this.readManifest(`/sprites/${folder}/manifest.json`);
      if (!signal.aborted) await loadSet(`${folder}_`, m);
    };
    const outfit = room.outfit;
    if (outfit && outfit !== 'swim') {
      jobs.push(this.readManifest(`/sprites/outfits/${outfit}/manifest.json`)
        .then(async (m) => { if (!signal.aborted) await loadSet(`outfit_${outfit}_`, m); })
        .then(() => (this.sprites.has(`outfit_${outfit}_idle`) ? undefined : loadScaledLand()))
        .catch(() => loadScaledLand()));
    } else {
      jobs.push(loadScaledLand());
    }
    for (const asset of new Set(room.elements?.map((el) => el.asset))) {
      jobs.push(loadInto(asset, asset, this.elementImages));
    }
    if (room.roomId === 'club') {
      jobs.push(loadInto('club_stage_banner', `/sprites/banners/banner_${getTonightGenre()}.webp`, this.elementImages));
    }
    for (const npc of room.npcs ?? []) {
      jobs.push((async () => {
        if (npc.sprite.endsWith('.webp')) {
          await loadInto(`npc_${npc.id}_idle`, npc.sprite, this.npcSprites);
        } else {
          try {
            const manifest = await this.readManifest(`${npc.sprite}/manifest.json`);
            if (!signal.aborted) await loadSet(`npc_${npc.id}_`, manifest, this.npcSprites);
          } catch {
            if (!signal.aborted) await loadInto(`npc_${npc.id}_idle`, `${npc.sprite}.webp`, this.npcSprites);
          }
        }
      })());
    }
    if (room.view) {
      if (room.view.city !== false && !this.cityImage) {
        jobs.push(this.imageLoader.load(CITY.image, signal).then((img) => {
          if (!signal.aborted) this.cityImage = img;
          else releaseSprite(img);
        }));
      }
      const movers = ['bird_up', 'bird_down', 'birds_flock', 'cloud_1', 'cloud_2', 'cloud_3'];
      if (!room.view.past) movers.push('plane');
      if (room.view.city !== false) movers.push('train_day', 'train_night');
      const paths = new Set(movers.map((name) => `/sprites/world/${name}.webp`));
      for (const [path, img] of this.moverSprites) if (!paths.has(path)) { releaseSprite(img); this.moverSprites.delete(path); }
      for (const path of paths) jobs.push(loadInto(path, path, this.moverSprites));
    } else {
      this.moverSprites.forEach(releaseSprite);
      this.moverSprites.clear();
    }
    if (!room.view || room.view.city === false) {
      releaseSprite(this.cityImage);
      this.cityImage = null;
      this.cityCanvas.width = this.cityCanvas.height = 0;
    }
    const results = await Promise.allSettled(jobs);
    if (!signal.aborted && !this.destroyed) {
      // A missing optional sprite set must not freeze the room behind a black fade.
      // Loaded outfits/base land sprites continue to provide the normal fallbacks.
      this.isAssetsLoaded = true;
      for (const result of results) {
        if (result.status === 'rejected') console.warn('Some room art could not load:', result.reason);
      }
    }
  }

  // =========================================================================
  // INPUT
  // =========================================================================

  private setupInputListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.powerQuery.addEventListener('change', this.updatePowerPreference);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    // Any tap or key anywhere (Game Boy buttons, dialogs, chat) counts as the player being here.
    window.addEventListener('pointerdown', this.markInput, { passive: true, capture: true });
    window.addEventListener('keydown', this.markInput, { passive: true, capture: true });
  }

  /** Release every held key — stops "walking forever" after alt-tab / tab switch. */
  private clearKeys = () => {
    this.keys = {};
    this.virtualDpad = { dx: 0, dy: 0 };
    this.clickTarget = null;
  };

  private updatePowerPreference = () => {
    this.lowPower = prefersLowPower();
  };

  private handleVisibilityChange = () => {
    this.clearKeys();
    cancelAnimationFrame(this.animId);
    if (this.wakeTimer !== null) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    this.heartbeatId = null;
    if (document.hidden || !this.running || this.identityPaused) return;
    this.startHeartbeat();
    // Never replay time spent in the background or create multiple frame loops.
    this.frameBudget.reset(performance.now());
    this.throttle.reset(performance.now());
    this.lastActiveTime = this.lastInputTime = performance.now();
    this.broadcastState();
    this.animId = requestAnimationFrame(this.gameLoop);
  };

  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.assetAbort.abort();
    for (const map of [this.sprites, this.elementImages, this.npcSprites, this.moverSprites]) {
      map.forEach(releaseSprite);
      map.clear();
    }
    this.manifests.clear();
    this.waterLoads.clear();
    releaseSprite(this.bgImage);
    releaseSprite(this.cityImage);
    this.bgImage = this.cityImage = null;
    this.skyCanvas.width = this.skyCanvas.height = 0;
    this.cityCanvas.width = this.cityCanvas.height = 0;
    this.poseStart.clear();
    this.remotePlayers.clear();
    this.npcWanderCycles.clear();
    this.npcRuntime.clear();
    if (this.emoteTimeout !== null) clearTimeout(this.emoteTimeout);
    if (this.chatTimeout !== null) clearTimeout(this.chatTimeout);
    cancelAnimationFrame(this.animId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.powerQuery.removeEventListener('change', this.updatePowerPreference);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerdown', this.markInput, { capture: true });
    window.removeEventListener('keydown', this.markInput, { capture: true });
    if (this.wakeTimer !== null) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unsubscribeQuality?.();
    this.unsubscribeQuality = null;
    this.perfHud?.remove();
    this.perfHud = null;
    this.labels.clear();
    this.lightsCanvas = null;
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    if (this.fidgetTimeout !== null) clearTimeout(this.fidgetTimeout);
    this.network.sendPlayerLeave(this.localPlayer.id);
    this.network.destroy();
    sound.destroy();
    music.destroy();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.identityPaused) return;
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
    if (this.identityPaused) return;
    if (!this.touchMoveEnabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    // The phone canvas is a camera window onto the world: add its offset
    const clickX = (e.clientX - rect.left) * scaleX + this.view.x;
    const clickY = (e.clientY - rect.top) * scaleY + this.view.y;

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
    this.observeCanvasSize();
    this.applyCanvasMode();
  }

  /** Phone (camera follow): the canvas is only as big as what the screen shows, and the camera
   *  moves by drawing the world shifted. Before, a full 1024 × 576 canvas was drawn every frame
   *  and CSS cropped away more than half of it. Desktop: the whole world, letterboxed. */
  private applyCanvasMode() {
    if (!this.canvas) return;
    if (this.cameraFollow) {
      this.canvas.style.objectFit = 'fill';
      this.canvas.style.objectPosition = 'center center';
    } else {
      if (this.canvas.width !== WORLD_W) this.canvas.width = WORLD_W;
      if (this.canvas.height !== WORLD_H) this.canvas.height = WORLD_H;
      this.canvas.style.objectFit = 'contain';
      this.canvas.style.objectPosition = 'center center';
      this.view = { x: 0, y: 0, w: WORLD_W, h: WORLD_H };
    }
  }

  public setCameraFollow(enabled: boolean) {
    this.cameraFollow = enabled;
    if (enabled) this.currentCamPctX = Math.max(0, Math.min(100, (this.localPlayer.x / WORLD_W) * 100));
    this.applyCanvasMode();
    if (enabled) this.updateCameraAndView(0);
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

  /** Set the local player's pose (and facing) directly — used by minigames like fishing. */
  public setPlayerPose(action: string, facing?: 1 | -1) {
    if (this.emoteTimeout) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }
    if (facing) this.localPlayer.facing = facing;
    this.localPlayer.currentAction = action;
    this.broadcastState();
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
    void this.ensureWaterColor(color);
    this.localPlayer.floatColor = color;
    this.broadcastState();
  }

  public setPlayerName(name: string) {
    this.localPlayer.name = name.trim() || 'Swimmer';
    this.broadcastState();
  }

  public toggleWaterLand() {
    // Only the pool has swimmable water. Elsewhere (café, town, Dalbit river…) ◯ with nothing nearby does nothing.
    if (!this.room.waterZones?.length && this.localPlayer.state === 'land') return;
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
      if (this.chatTimeout !== null) clearTimeout(this.chatTimeout);
      this.chatTimeout = window.setTimeout(() => {
        this.chatTimeout = null;
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
    if (this.destroyed || document.hidden) return;
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
    if (this.running || this.destroyed) return;
    this.running = true;
    this.frameBudget.reset(performance.now());
    this.throttle.reset(performance.now());
    this.lastActiveTime = this.lastInputTime = performance.now();
    if (!document.hidden && !this.identityPaused) this.animId = requestAnimationFrame(this.gameLoop);
    if (!document.hidden && !this.identityPaused) this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatId !== null) clearInterval(this.heartbeatId);
    this.heartbeatId = window.setInterval(() => {
      if (this.running && !document.hidden && !this.identityPaused) this.broadcastState();
    }, 1500);
  }

  private targetFps(time: number): number {
    // A crowd is always moving somewhere: only players the camera can see keep the frame rate up.
    let movingRemote = false;
    for (const p of this.remotePlayers.values()) {
      if (p.data.roomId !== this.room.roomId) continue;
      if (Math.abs(p.data.x - p.targetX) + Math.abs(p.data.y - p.targetY) <= 0.5) continue;
      if (spanVisible(this.view, p.data.x, 40)) { movingRemote = true; break; }
    }
    const active = this.isMoving || this.clickTarget !== null ||
      this.virtualDpad.dx !== 0 || this.virtualDpad.dy !== 0 ||
      Object.keys(this.keys).some((code) => this.keys[code] && MOVE_CODES.has(code)) ||
      this.fadeDirection !== 'none' || this.particles.length > 0 || movingRemote ||
      this.emoteTimeout !== null || this.isAnimationActive?.();
    if (active) this.lastActiveTime = time;
    const budget = quality.budget;
    // Fishing and walking keep the full active rate; quiet scenes slow down in two steps.
    if (time - this.lastActiveTime <= 4000) return budget.active;
    if (time - this.lastInputTime > 45000) return budget.deep;
    return budget.idle;
  }

  /** Ask for the next frame. Below the display rate, sleep on a timer instead of waking the
   *  page on every vsync just to skip it (60–120 wake-ups/sec → 10–30). */
  private scheduleNext(fps: number) {
    if (!this.running || document.hidden || this.destroyed || this.identityPaused) return;
    const wait = this.frameBudget.due - performance.now() - 4;
    if (fps < 50 && wait > 8) {
      this.wakeTimer = window.setTimeout(() => {
        this.wakeTimer = null;
        if (this.running && !document.hidden && !this.destroyed && !this.identityPaused) this.animId = requestAnimationFrame(this.gameLoop);
      }, wait);
    } else {
      this.animId = requestAnimationFrame(this.gameLoop);
    }
  }

  /** Move the phone camera and work out which part of the world is on screen this frame. */
  private updateCameraAndView(dt: number) {
    if (!this.cameraFollow) {
      this.view = { x: 0, y: 0, w: WORLD_W, h: WORLD_H };
      return;
    }
    const focusX = this.cameraFocusX ?? this.localPlayer.x;
    const targetPctX = Math.max(0, Math.min(100, (focusX / WORLD_W) * 100));
    const smooth = dt > 0 ? 1 - Math.pow(1 - (this.cameraFocusX !== null ? 0.06 : 0.15), dt * 60) : 1;
    this.currentCamPctX += (targetPctX - this.currentCamPctX) * smooth;

    // Size the canvas to the screen box's shape (cover-fit of the world), in art pixels.
    const cssW = this.cssW || this.canvas.clientWidth;
    const cssH = this.cssH || this.canvas.clientHeight;
    let visW = WORLD_W;
    let visH = WORLD_H;
    if (cssW > 0 && cssH > 0) {
      const scale = Math.max(cssW / WORLD_W, cssH / WORLD_H);
      visW = Math.max(16, Math.min(WORLD_W, Math.round(cssW / scale)));
      visH = Math.max(16, Math.min(WORLD_H, Math.round(cssH / scale)));
    }
    if (this.canvas.width !== visW) this.canvas.width = visW;
    if (this.canvas.height !== visH) this.canvas.height = visH;
    // Whole art pixels only, so the pixel art never shimmers while the camera glides.
    const x = Math.round((WORLD_W - visW) * this.currentCamPctX / 100);
    const y = Math.round((WORLD_H - visH) / 2);
    this.view = { x, y, w: visW, h: visH };
  }

  private gameLoop = (time: number) => {
    if (!this.running || document.hidden || this.identityPaused) return;
    const fps = this.targetFps(time);
    const dt = this.frameBudget.advance(time, fps);
    if (dt === null || !this.isAssetsLoaded) {
      this.scheduleNext(fps);
      return;
    }
    const workStart = performance.now();
    // Smaller physics steps preserve collisions at lower render rates.
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      this.update(step);
      remaining -= step;
      if (!this.isAssetsLoaded) {
        this.scheduleNext(fps);
        return;
      }
    }
    this.updateContextAction();
    if (this.showDebug) {
      this.debugFrames++;
      if (time - this.debugSince >= 1000) {
        this.debugFps = Math.round(this.debugFrames * 1000 / (time - this.debugSince));
        this.debugFrames = 0;
        this.debugSince = time;
      }
    }
    this.updateCameraAndView(dt);
    this.render();

    const workEnd = performance.now();
    const work = workEnd - workStart;
    const interval = this.lastRenderAt ? time - this.lastRenderAt : 1000 / fps;
    this.lastRenderAt = time;
    if (this.throttle.sample(workEnd, work, interval, 1000 / fps) && quality.stepDown()) {
      console.info('[perf] device is struggling, stepping quality down to', quality.tier);
    }
    if (this.perfHud) {
      this.perfFrames++;
      this.perfWorkMs += work;
      this.updatePerfHud(workEnd);
    }
    this.scheduleNext(fps);
  };

  private update(dt: number) {
    this.updateFade(dt);
    this.updateLocalPlayer(dt);
    this.updateRemotePlayers(dt);
    this.updateParticles(dt);
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
    if (this.skyCanvas.width !== WORLD_W || this.skyCanvas.height !== WORLD_H) {
      this.skyCanvas.width = WORLD_W;
      this.skyCanvas.height = WORLD_H;
    }
    const skyCtx = this.skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, this.room.view?.skyBottomY ?? this.skyCanvas.height);
    grad.addColorStop(0, `rgb(${Math.round(sky.top[0])}, ${Math.round(sky.top[1])}, ${Math.round(sky.top[2])})`);
    grad.addColorStop(1, `rgb(${Math.round(sky.bottom[0])}, ${Math.round(sky.bottom[1])}, ${Math.round(sky.bottom[2])})`);
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, this.skyCanvas.width, this.skyCanvas.height);

    if (this.room.view?.city === false) return;

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
      const distance = this.clickTarget ? Math.min(speed * dt,
        Math.hypot(this.clickTarget.x - oldX, this.clickTarget.y - oldY)) : speed * dt;
      const moved = this.attemptMove(oldX + moveX * distance, oldY + moveY * distance);

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
  private getHeadAnchor(img: Sprite): number {
    const cached = this.headAnchor.get(img);
    if (cached !== undefined) return cached;
    let ax = Math.floor(img.width / 2);
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (g && spriteReady(img)) {
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
    if (spriteReady(img)) this.headAnchor.set(img, ax);
    return ax;
  }

  /** Point-vs-obstacle test (the player's feet are the collision point). */
  private isBlocked(x: number, y: number): boolean {
    // Rooms like the river mouth: you can only stand on the walkable areas (pier, beach), never on water
    if (this.room.strictWalkable && !this.room.walkableZones.some(
      (z) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height,
    )) {
      return true;
    }
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
            // A story can say "not yet" (e.g. no leaving before breakfast): step back out of the exit.
            if (this.exitGuard && !this.exitGuard(exit.targetRoom)) {
              const towardCentre = Math.sign(this.room.width / 2 - (ex + ew / 2)) || -1;
              this.localPlayer.x = Math.max(this.room.bounds.minX, Math.min(this.room.bounds.maxX, ex + ew / 2 + towardCentre * (ew / 2 + 14)));
              this.localPlayer.y = oy;
              return true;
            }
            this.changeRoom(exit.targetRoom);
            break;
          }
        }
      }
    }

    return nx !== ox || ny !== oy;
  }

  /** Near a room exit: a small bobbing arrow + the place's name, so paths between maps are easy to find. */
  private drawExitHints(time: number) {
    if (!this.room.exits || this.fadeDirection !== 'none') return;
    const ctx = this.ctx;
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    for (const exit of this.room.exits) {
      const target = rooms[exit.targetRoom];
      if (!target) continue;
      const [ex, ey, ew, eh] = exit.triggerBox;
      const cx = ex + ew / 2;
      const cy = ey + eh / 2;
      const d = Math.hypot(px - cx, py - cy);
      if (d > 140) continue;
      const alpha = Math.min(1, (140 - d) / 60);
      const left = cx < this.room.width / 2;
      const label = left ? `< ${target.name}` : `${target.name} >`;
      const sign = this.labels.get(`exit:${label}`, () => buildExitSign(this.labels, label));
      const w = sign ? sign.w : exitSignWidth(ctx, label);
      const bob = Math.round(Math.sin(time / 260) * 2) * (left ? -1 : 1);
      // pinned to the exit's own edge, above the player's name tag (the bottom of the screen is under the emote bar)
      const x = Math.round(Math.max(4, Math.min(this.room.width - w - 4, left ? ex + ew + 4 + bob : ex - w - 4 + bob)));
      const y = Math.round(Math.max(60, Math.min(cy, py) - 134));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (sign) ctx.drawImage(sign.canvas, x - sign.ax, y - sign.ay);
      else drawExitSign(ctx, label, x, y, w);
      ctx.restore();
    }
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
        this.poseStart.delete(id);
        if (this.onPlayerCountChange) {
          this.onPlayerCountChange(this.getLocalRoomPlayerCount());
        }
        continue;
      }

      // Smooth lerp movement toward network target
      const lerpFactor = 1 - Math.exp(-dt * 10);
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

  private updateParticles(dt: number) {
    const frames = dt * 60;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * frames;
      p.y += p.vy * frames;
      p.life += frames;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  /** Draw a full-canvas image, but only the part that is on screen. */
  private drawCropped(img: CanvasImageSource & { width: number; height: number }, r: ViewRect) {
    const kx = img.width / WORLD_W;
    const ky = img.height / WORLD_H;
    this.ctx.drawImage(img, r.x * kx, r.y * ky, r.w * kx, r.h * ky, r.x, r.y, r.w, r.h);
  }

  /** Room-light glows, painted once per minute into a small bitmap (was 3–7 gradients per frame). */
  private getLightsCanvas(night: number): { canvas: HTMLCanvasElement; x: number; y: number } | null {
    const lights = ROOM_LIGHTS[this.room.roomId];
    if (!lights || lights.length === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of lights) {
      x0 = Math.min(x0, l.x - l.radius); y0 = Math.min(y0, l.y - l.radius);
      x1 = Math.max(x1, l.x + l.radius); y1 = Math.max(y1, l.y + l.radius);
    }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const key = `${this.room.roomId}:${night.toFixed(2)}`;
    if (this.lightsKey !== key || !this.lightsCanvas) {
      const c = this.lightsCanvas ?? document.createElement('canvas');
      c.width = Math.ceil(x1 - x0);
      c.height = Math.ceil(y1 - y0);
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'lighter';
      for (const light of lights) {
        const lx = light.x - x0;
        const ly = light.y - y0;
        const grad = g.createRadialGradient(lx, ly, 0, lx, ly, light.radius);
        const [r, gr, b] = light.color;
        grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${0.35 * night})`);
        grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(lx, ly, light.radius, 0, Math.PI * 2);
        g.fill();
      }
      this.lightsCanvas = c;
      this.lightsKey = key;
    }
    return { canvas: this.lightsCanvas, x: x0, y: y0 };
  }

  /** Find the see-through part of the room painting once, when it loads. */
  private measureOpenArea(img: Sprite | null) {
    this.openArea = null;
    if (!img || !this.room.view) return;
    try {
      const w = Math.min(img.width, 1024);
      const h = Math.min(img.height, 576);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, w, h);
      const area = findOpenArea(g.getImageData(0, 0, w, h).data, w, h);
      const kx = WORLD_W / w;
      const ky = WORLD_H / h;
      this.openArea = area
        ? { x: Math.floor(area.x * kx), y: Math.floor(area.y * ky), w: Math.ceil(area.w * kx), h: Math.ceil(area.h * ky) }
        : { x: 0, y: 0, w: 0, h: 0 };
      c.width = c.height = 0;
    } catch {
      this.openArea = null; // unreadable: draw the whole sky as before
    }
  }

  private render() {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    // Everything below draws in world coordinates; the canvas shows the camera window `v`.
    ctx.translate(-v.x, -v.y);

    const hasView = !!this.room.view;
    const hour = bangkokHour(undefined, this.room.view?.fixedHour);
    const sky = skyAt(hour);
    const time = performance.now();
    const density = quality.budget.ambient;

    if (hasView) {
      this.updateSkyAndCityCache(hour);
      // The sky, the city and everything flying only show through the painting's windows.
      const skyRect = this.bgImage
        ? (this.openArea ? intersectRect(this.openArea, v) : v)
        : v;
      if (skyRect) {
        ctx.save();
        if (skyRect !== v) {
          ctx.beginPath();
          ctx.rect(skyRect.x, skyRect.y, skyRect.w, skyRect.h);
          ctx.clip();
        }
        // L0. Sky gradient
        this.drawCropped(this.skyCanvas, skyRect);
        renderAmbient(ctx, this.room.roomId, 'sky', time, sky.night, density);

        // L0.5. Far movers (clouds, birds, plane)
        this.movers.render(ctx, 'far', this.moverSprites, sky.night, this.room.view!.past ? PAST_SKIP_MOVERS : undefined);

        // L0.7. City panorama at (cityOffsetX, CITY.y), multiplied by skyAt().cityTint
        // (rooms with view.city === false — painted postcard scenes — have no city and no train)
        if (this.room.view!.city !== false) {
          ctx.drawImage(this.cityCanvas, this.room.view!.cityOffsetX, CITY.y);
          // L0.8. Near movers (train)
          this.movers.render(ctx, 'near', this.moverSprites, sky.night);
        }
        ctx.restore();
      }

      // L1. Room background (transparent windows)
      if (this.bgImage) this.drawCropped(this.bgImage, v);
    } else if (this.bgImage) {
      // 1. Background (poolside / standard)
      this.drawCropped(this.bgImage, v);
    } else {
      ctx.fillStyle = '#4079d0';
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }

    // 1b. Ambient water glints on the painted background
    renderAmbient(ctx, this.room.roomId, 'back', time, sky.night, density);

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
      if (spriteReady(bannerImg) && spanVisible(v, 328, 190)) {
        const boxX = 141;
        const boxY = 42;
        const boxW = 516 - 141; // 375
        const boxH = 219 - 42;  // 177
        const scale = Math.min(boxW / bannerImg.width, boxH / bannerImg.height);
        const dw = Math.round(bannerImg.width * scale);
        const dh = Math.round(bannerImg.height * scale);
        const dx = Math.round(boxX + (boxW - dw) / 2);
        const dy = Math.round(boxY + (boxH - dh) / 2);
        ctx.drawImage(bannerImg, dx, dy, dw, dh);
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

    // 6. Depth-sorted list: object elements + NPCs + players (off-screen ones are skipped)
    const drawFns: { y: number; draw: () => void }[] = [];
    const overlayFns: (() => void)[] = [];

    // 6a. Object-layer elements
    if (this.room.elements) {
      for (const el of this.room.elements) {
        if (el.layer === 'object') {
          const img = this.elementImages.get(el.asset);
          if (img && !spanVisible(v, el.x, img.width / 2 + 2)) continue;
          const capturedEl = el;
          drawFns.push({ y: el.y, draw: () => this.renderElement(capturedEl) });
        }
      }
    }

    // 6b. NPCs (depth-sorted by dynamic feet y)
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const state = this.getNpcRenderState(npc, time);
        if (!spanVisible(v, state.x, 110)) continue;
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
    let allPlayers: PlayerData[] = [this.localPlayer];
    for (const r of this.remotePlayers.values()) {
      if ((r.data.roomId || 'poolside') === this.room.roomId && spanVisible(v, r.data.x, 110)) {
        allPlayers.push(r.data);
      }
    }
    // Packed room: draw the closest people (like MMOs do); everyone still counts as online.
    const maxShown = quality.budget.maxPlayers + 1;
    if (allPlayers.length > maxShown) {
      const keep = this.nearestPlayerIds(allPlayers, maxShown);
      allPlayers = allPlayers.filter((p) => keep.has(p.id));
    }
    // A packed room: everyone is still drawn, but only the nearest name tags (they're the clutter)
    const tagBudget = allPlayers.length > MAX_NAME_TAGS ? this.nearestPlayerIds(allPlayers, MAX_NAME_TAGS) : null;
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
      const capturedX = player.x + (player === this.localPlayer ? this.localShakeX : 0);
      const capturedPlayer = player;
      const capturedSprite = sprite;
      const capturedDrawY = drawY;
      const capturedH = h;
      const capturedAir = air;
      const showTag = !tagBudget || tagBudget.has(player.id);
      drawFns.push({
        y: this.sortYFor(player),
        draw: () => {
          this.renderPlayerSprite(capturedPlayer, capturedDrawY, capturedSprite, capturedX, capturedAir);
          // Defer nametag + bubble as overlays
          overlayFns.push(() => this.renderPlayerOverlay(capturedPlayer, capturedDrawY, capturedH, showTag));
        }
      });
    }

    // Sort by y ascending and draw
    drawFns.sort((a, b) => a.y - b.y);
    for (const d of drawFns) {
      d.draw();
    }
    this.onDrawLayer?.(ctx, 'world', time);

    // 6d. Ambient sparkles / petals (darkened by the night overlay below)
    renderAmbient(ctx, this.room.roomId, 'front', time, sky.night, density);

    // L4. Night: multiply the screen with rgba(20,24,60, 0.45*night), then add the room lights
    if (hasView && sky.night > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(20, 24, 60, ${(this.room.view?.nightDarkness ?? 0.45) * sky.night})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.restore();

      const lights = this.getLightsCanvas(sky.night);
      if (lights) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(lights.canvas, lights.x, lights.y);
        ctx.restore();
      }
    }

    // L4b. Beacon glows (lighthouse) on top of the night
    if (hasView) renderAmbient(ctx, this.room.roomId, 'glow', time, sky.night, density);

    // 7. Overlays (name tags, speech bubbles) — always on top
    for (const fn of overlayFns) {
      fn();
    }
    this.drawExitHints(time);
    this.onDrawLayer?.(ctx, 'top', time);

    // 8. Debug overlay (F3)
    if (this.showDebug) {
      this.renderDebugOverlay();
    }

    // 9. Fade to/from black overlay
    if (this.fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, this.fadeAlpha))})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }
    ctx.restore();
  }

  /** Ids of the `n` players closest to the local player (always including the local player). */
  private nearestPlayerIds(players: PlayerData[], n: number): Set<string> {
    const me = this.localPlayer;
    const sorted = players
      .map((p) => ({ id: p.id, d: p === me ? -1 : Math.abs(p.x - me.x) + Math.abs(p.y - me.y) * 1.5 }))
      .sort((a, b) => a.d - b.d);
    return new Set(sorted.slice(0, n).map((p) => p.id));
  }

  // =========================================================================
  // SPRITE HELPERS
  // =========================================================================

  /** Select the correct sprite for a player, accounting for actorScale. */
  private getPlayerSprite(player: PlayerData): Sprite | undefined {
    const isWater = player.state === 'water';

    if (isWater) {
      const color = player.floatColor || 'red';
      void this.ensureWaterColor(color);
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

    // Idle loop (standing NPCs): play a few poses now and then, e.g. clack clack
    const loop = this.room.npcs?.find((n) => n.id === npcId)?.idleLoop;
    if (loop && loop.poses.length) {
      const run = loop.poses.length * loop.frameMs;
      const offset = [...npcId].reduce((h, ch) => h + ch.charCodeAt(0) * 97, 0) % (run + loop.pauseMs); // not all in sync
      const t = (time + offset) % (run + loop.pauseMs);
      if (t < run) return loop.poses[Math.floor(t / loop.frameMs)];
      return 'idle';
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
    if (!img || !spanVisible(this.view, el.x, img.width / 2 + 2)) return;
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
      const bob = overridePose ? 0 : npcStepBob(travelled, this.actorScale);
      return { x, y, facing: seg.facing, action, bob };
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
        const walking = !overridePose && travelled >= 2;
        const action = overridePose || (walking ? npcWalkFrame(travelled, this.actorScale) : 'side_idle');
        const bob = walking ? npcStepBob(travelled, this.actorScale) : 0;
        return { x: curX, y: curY, facing, action, bob };
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
    const shadowRx = Math.round(17 * (this.actorScale || 1));
    const shadowRy = Math.round(5 * (this.actorScale || 1));
    this.drawShadow(Math.round(state.x), Math.round(state.y - 2), shadowRx, shadowRy, 0.22);

    // Sprite (bottom-centre anchor, native size; side frames face RIGHT so flip for leftward)
    this.ctx.save();
    this.ctx.translate(state.x, state.y - (state.bob ?? 0));
    if (state.facing === -1) {
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(sprite, -Math.floor(sprite.width / 2), -sprite.height);
    this.ctx.restore();
  }

  /** Soft ground shadow, stamped from a cached bitmap (an ellipse path per actor per frame adds
   *  up fast in a crowd). */
  private drawShadow(cx: number, cy: number, rx: number, ry: number, alpha: number) {
    const key = `${rx}:${ry}:${Math.round(alpha * 50)}`;
    let c = this.shadowCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = rx * 2 + 2;
      c.height = ry * 2 + 2;
      const g = c.getContext('2d')!;
      g.fillStyle = `rgba(20, 25, 40, ${(Math.round(alpha * 50) / 50).toFixed(3)})`;
      g.beginPath();
      g.ellipse(rx + 1, ry + 1, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      if (this.shadowCache.size > 64) this.shadowCache.clear();
      this.shadowCache.set(key, c);
    }
    this.ctx.drawImage(c, cx - rx - 1, cy - ry - 1);
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
  private renderPlayerSprite(player: PlayerData, drawY: number, spriteImg: Sprite | undefined, drawX: number = player.x, air: number = 0) {
    if (!spriteImg) return;
    const isWater = player.state === 'water';
    // Snap to whole pixels so the sprite never blurs between two pixels
    const sx = Math.round(drawX);
    const sy = Math.round(drawY);
    const groundX = Math.round(player.x);
    const groundY = Math.round(player.y);

    // Shadow on land
    if (!isWater) {
      // Shadow shrinks and fades while in the air
      const shrink = 1 - 0.3 * air;
      // wide props (a fishing rod) must not make the shadow wider than the body
      const bodyW = player.currentAction.startsWith('fish_') ? 48 : spriteImg.width;
      const shadowRadiusX = Math.round(Math.max(16, bodyW * 0.38) * shrink);
      const shadowRadiusY = Math.round(Math.max(5, bodyW * 0.13) * shrink);
      this.drawShadow(groundX, groundY - 2, shadowRadiusX, shadowRadiusY, 0.28 * (1 - 0.45 * air));
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
    const action = player.currentAction;
    const k = this.actorScale || 1;
    if (!isWater && air === 0 && action.endsWith('_pass')) {
      // Step bounce: on the passing step (legs together) the whole body is 1 art-pixel higher
      this.ctx.drawImage(spriteImg, -ax, -h - Math.round(STEP_LIFT_PX * k));
    } else if (!isWater && air === 0 && BREATHE_POSES.has(action)) {
      // Breathing: head + chest sink 1 px for half of each breath, feet stay planted
      const t = (performance.now() + idHash(player.id)) % BREATHE_MS;
      const down = t > BREATHE_MS / 2 ? Math.round(k) : 0;
      const cut = Math.round(h * BREATHE_SPLIT);
      this.ctx.drawImage(spriteImg, 0, cut, w, h - cut, -ax, -h + cut, w, h - cut);
      this.ctx.drawImage(spriteImg, 0, 0, w, cut, -ax, -h + down, w, cut);
    } else {
      this.ctx.drawImage(spriteImg, -ax, -h);
    }
    this.ctx.restore();
  }

  /** Deferred: player name tag + speech bubble (drawn above all depth-sorted items). */
  private renderPlayerOverlay(player: PlayerData, drawY: number, spriteHeight: number, showTag = true) {
    // Hide all name tags while dialog is open
    if (!this.dialogFrozen && showTag) {
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
    const isMe = player.id === this.localPlayer.id;
    const nameText = isMe ? `${player.name} (You)` : player.name;
    const label = this.labels.get(`tag:${isMe ? 1 : 0}:${nameText}`, () => buildNameTag(this.labels, nameText, isMe));
    if (label) {
      this.ctx.drawImage(label.canvas, Math.floor(x - label.ax), Math.floor(y - label.ay));
      return;
    }
    // Pixel font still loading: draw live (not cached, so it's redrawn properly once it arrives)
    this.ctx.save();
    const { boxW } = nameTagSize(this.ctx, nameText);
    drawNameTag(this.ctx, nameText, isMe, Math.floor(x - boxW / 2), Math.floor(y - 20), boxW);
    this.ctx.restore();
  }

  private renderSpeechBubble(text: string, x: number, y: number, alpha: number) {
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const label = this.labels.get(`say:${text}`, () => buildSpeechBubble(this.labels, text));
    if (label) {
      this.ctx.drawImage(label.canvas, Math.floor(x - label.ax), Math.floor(y - label.ay));
    } else {
      drawSpeechBubble(this.ctx, wrapBubbleText(this.ctx, text), x, y);
    }
    this.ctx.restore();
  }

  /** Draw a small pixel speech-bubble with ◯ above an NPC's head, gentle 2px bob. */
  private renderPromptBubble(x: number, y: number, time: number) {
    const bob = Math.sin(time * 0.004) * 2;
    if (!this.promptLabel) this.promptLabel = buildPromptBubble();
    const l = this.promptLabel;
    if (l) {
      this.ctx.drawImage(l.canvas, Math.floor(x - l.ax), Math.floor(y + bob - l.ay));
      return;
    }
    this.ctx.save();
    drawPromptBubble(this.ctx, x, y + bob);
    this.ctx.restore();
  }

  // =========================================================================
  // DIALOG / NPC POSE PUBLIC API
  // =========================================================================

  /** Suspend gameplay while the local identity overlay is open, preserving room state. */
  public setIdentityPaused(paused: boolean) {
    this.identityPaused = paused;
    this.handleVisibilityChange();
  }

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
        if (this.destroyed) { resolve(); return; }
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

    this.ctx.fillText(
      `Render: ${this.debugFps} fps · ${this.lowPower ? 'low power' : 'desktop'} · sprites: ${this.sprites.size + this.npcSprites.size + this.elementImages.size + this.moverSprites.size}`,
      4, 26
    );
    this.ctx.restore();
  }
}
