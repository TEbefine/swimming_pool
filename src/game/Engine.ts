import type {
  PlayerData,
  FloatColor,
  Particle,
  ChatMessage,
  RoomDefinition,
  Rect,
  ElementDef,
  ContextAction,
  ContextActionId
} from './types';
import { sound } from './audio';
import { NetworkManager } from './network';

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
  public isAssetsLoaded: boolean = false;

  // Local Player
  public localPlayer: PlayerData;
  private walkFrame: number = 0;
  private walkTimer: number = 0;
  private isMoving: boolean = false;
  private clickTarget: { x: number; y: number } | null = null;
  private emoteTimeout: number | null = null;
  private lastFootstepTime: number = 0;

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
  private mergedSeats: { x: number; y: number; facing: 1 | -1 }[] = [];
  private elementInteractions: { id: string; label: string; x: number; y: number; radius: number }[] = [];

  // Debug overlay (F3)
  private showDebug: boolean = false;

  // Loop control
  private animId: number = 0;
  private lastTime: number = 0;
  private running: boolean = false;

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
      timestamp: Date.now()
    };

    this.buildMergedData();
    this.network = new NetworkManager(this.localPlayer.id);
    this.setupNetworkHandlers();
    this.setupInputListeners();
  }

  // =========================================================================
  // MERGED DATA (obstacles, seats, interactions from room + elements)
  // =========================================================================

  private buildMergedData() {
    this.mergedObstacles = [...this.room.obstacles];
    this.mergedSeats = this.room.seats ? [...this.room.seats] : [];
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
            facing: el.seat.facing
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

  // =========================================================================
  // NETWORK
  // =========================================================================

  private setupNetworkHandlers() {
    this.network.on('player_state', (_, raw) => {
      const data = raw as PlayerData;
      if (data.id === this.localPlayer.id) return;

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
        existing.lastUpdate = Date.now();
      } else {
        this.remotePlayers.set(data.id, {
          data,
          targetX: data.x,
          targetY: data.y,
          lastUpdate: Date.now()
        });
        if (this.onPlayerCountChange) {
          this.onPlayerCountChange(this.remotePlayers.size + 1);
        }
      }
    });

    this.network.on('chat_message', (_, raw) => {
      const msg = raw as ChatMessage;
      sound.playChatChime();
      if (this.onChatMessageReceived) {
        this.onChatMessageReceived(msg);
      }
    });

    this.network.on('player_leave', (_, raw) => {
      const { id } = raw as { id: string };
      this.remotePlayers.delete(id);
      if (this.onPlayerCountChange) {
        this.onPlayerCountChange(this.remotePlayers.size + 1);
      }
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

    // 3. 1.5× land sprites (for rooms with actorScale > 1)
    if (this.actorScale > 1) {
      const res15x = await fetch('/sprites/land_1_5x/manifest.json');
      const manifest15x = await res15x.json() as Record<string, { path: string }>;
      for (const [action, info] of Object.entries(manifest15x)) {
        loadImg(`land_1_5x_${action}`, info.path, this.sprites);
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

    // 5. NPC sprites (manifest-based or single image)
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const isFile = npc.sprite.endsWith('.webp') || npc.sprite.endsWith('.png');
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

    await Promise.all(imgPromises);
    this.isAssetsLoaded = true;
  }

  // =========================================================================
  // INPUT
  // =========================================================================

  private setupInputListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
  }

  public destroy() {
    this.running = false;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.network.sendPlayerLeave(this.localPlayer.id);
    this.network.destroy();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // If typing inside an input element, do not capture movement
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
      return;
    }

    this.keys[e.key.toLowerCase()] = true;
    this.clickTarget = null; // Keyboard overrides click-to-move

    // F3 debug overlay toggle
    if (e.key === 'F3') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
    }

    // Hotkeys 1-5 for Emotes
    if (e.key === '1') this.triggerEmote('wave');
    if (e.key === '2') {
      if (this.localPlayer.state === 'land') this.triggerEmote('sit');
      else this.triggerEmote('relax');
    }
    if (e.key === '3') {
      if (this.localPlayer.state === 'land') this.triggerEmote('lie');
      else this.triggerEmote('happy');
    }
    if (e.key === '4') this.triggerEmote('surprise');
    if (e.key === '5') {
      if (this.localPlayer.state === 'land') this.triggerEmote('jump');
      else this.triggerEmote('wave');
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
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

    // Priority 3: NPC within 50px → talk
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const dx = px - npc.x;
        const dy = py - npc.y;
        if (Math.sqrt(dx * dx + dy * dy) <= 50) {
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
        const npc = this.findNearestNpc(50);
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
      this.localPlayer.currentAction = 'sit';
      this.clickTarget = null;
      this.broadcastState();
    }
  }

  /** Stand up from a seat. */
  public standUp() {
    if (this.seatedIndex < 0) return;
    this.seatedIndex = -1;
    this.localPlayer.currentAction = 'idle';
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

  private findNearestNpc(maxDist: number) {
    if (!this.room.npcs) return null;
    const px = this.localPlayer.x;
    const py = this.localPlayer.y;
    let best: { id: string; name: string; x: number; y: number } | null = null;
    let bestDist = maxDist;
    for (const npc of this.room.npcs) {
      const dx = px - npc.x;
      const dy = py - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = npc;
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
    if (this.emoteTimeout) {
      clearTimeout(this.emoteTimeout);
    }
    this.localPlayer.currentAction = action;
    sound.playEmoteSound(action);

    if (action === 'jump') {
      this.createJumpParticles(this.localPlayer.x, this.localPlayer.y);
    }

    this.broadcastState();

    this.emoteTimeout = window.setTimeout(() => {
      if (this.localPlayer.currentAction === action) {
        this.localPlayer.currentAction = this.isMoving 
          ? (this.localPlayer.state === 'water' ? 'swim1' : 'walk1') 
          : (this.localPlayer.state === 'water' ? 'tread' : 'idle');
        this.broadcastState();
      }
    }, 2800);
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
      floatColor: this.localPlayer.floatColor
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

  private broadcastState() {
    this.localPlayer.timestamp = Date.now();
    this.network.broadcastPlayerState(this.localPlayer);
  }

  public start() {
    this.running = true;
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame(this.gameLoop);

    // Heartbeat broadcast every 1.5 seconds
    setInterval(() => {
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
    this.updateLocalPlayer(dt);
    this.updateRemotePlayers(dt);
    this.updateParticles();
    this.updateContextAction();
  }

  private updateLocalPlayer(dt: number) {
    // If seated, don't process movement
    if (this.seatedIndex >= 0) return;

    let dx = 0;
    let dy = 0;

    // Keyboard movement
    if (this.keys['arrowleft'] || this.keys['a']) dx -= 1;
    if (this.keys['arrowright'] || this.keys['d']) dx += 1;
    if (this.keys['arrowup'] || this.keys['w']) dy -= 1;
    if (this.keys['arrowdown'] || this.keys['s']) dy += 1;

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
      }
    }

    const wasMoving = this.isMoving;
    this.isMoving = dx !== 0 || dy !== 0;

    if (this.isMoving) {
      // Clear manual emote when starting to walk
      if (this.emoteTimeout) {
        clearTimeout(this.emoteTimeout);
        this.emoteTimeout = null;
      }

      // Facing
      if (dx < 0) this.localPlayer.facing = -1;
      if (dx > 0) this.localPlayer.facing = 1;

      // Speed (swimming is slightly slower than walking)
      let speed = this.localPlayer.state === 'water' ? 120 : 160;

      // Actor scale speed multiplier
      speed *= this.actorScale;

      // Sprint multiplier on land
      if (this.isRunning && this.localPlayer.state === 'land') {
        speed *= 1.6;
      }
      
      // Normalize diagonal
      let moveX = dx;
      let moveY = dy;
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      if (len > 0) {
        moveX /= len;
        moveY /= len;
      }

      const newX = this.localPlayer.x + moveX * speed * dt;
      const newY = this.localPlayer.y + moveY * speed * dt;

      // Check collision and clamp inside boundaries
      this.attemptMove(newX, newY);

      // Walk / Swim animation frame timer
      this.walkTimer += dt;
      if (this.walkTimer > 0.13) {
        this.walkTimer = 0;
        this.walkFrame = (this.walkFrame + 1) % 4;

        if (this.localPlayer.state === 'land') {
          // Play soft footstep on contact frames
          if (this.walkFrame === 0 || this.walkFrame === 2) {
            const now = Date.now();
            if (now - this.lastFootstepTime > 260) {
              sound.playFootstep();
              this.lastFootstepTime = now;
            }
          }
        } else {
          // Water swim ripple
          this.createSwimRipples(this.localPlayer.x, this.localPlayer.y);
        }
      }

      if (this.localPlayer.state === 'land') {
        if (dx !== 0) {
          // Horizontal walk: step A -> passing pose (side_idle) -> step B -> passing pose (side_idle)
          const walkCycle = ['walk1', 'side_idle', 'walk2', 'side_idle'];
          this.localPlayer.currentAction = walkCycle[this.walkFrame];
        } else if (dy < 0) {
          // Moving up: back view
          this.localPlayer.currentAction = 'back_idle';
        } else {
          // Moving down: front view
          this.localPlayer.currentAction = (this.walkFrame % 2 === 0) ? 'idle' : 'walk1';
        }
      } else {
        // Water swimming: alternate swim strokes
        this.localPlayer.currentAction = (this.walkFrame % 2 === 0) ? 'swim1' : 'swim2';
      }

      this.broadcastState();
    } else {
      if (wasMoving) {
        if (this.localPlayer.state === 'land') {
          if (this.localPlayer.currentAction === 'back_idle') {
            this.localPlayer.currentAction = 'back_idle';
          } else if (this.localPlayer.facing === 1 || this.localPlayer.facing === -1) {
            this.localPlayer.currentAction = 'side_idle';
          } else {
            this.localPlayer.currentAction = 'idle';
          }
        } else {
          this.localPlayer.currentAction = 'tread';
        }
        this.broadcastState();
      }
    }
  }

  private attemptMove(targetX: number, targetY: number) {
    // Clamp to map boundaries using room bounds
    const { minX, maxX, minY, maxY } = this.room.bounds;
    const clampedX = Math.max(minX, Math.min(maxX, targetX));
    const clampedY = Math.max(minY, Math.min(maxY, targetY));

    // Check obstacle collision (uses merged obstacles)
    for (const obs of this.mergedObstacles) {
      if (
        clampedX >= obs.x &&
        clampedX <= obs.x + obs.width &&
        clampedY >= obs.y &&
        clampedY <= obs.y + obs.height
      ) {
        // Obstructed, do not move into obstacle
        return;
      }
    }

    // Water enter/exit logic — only when the room has water zones
    const hasWater = this.room.waterZones && this.room.waterZones.length > 0;
    if (hasWater) {
      const prevState = this.localPlayer.state;
      const isInsideWater = this.isPointInWater(clampedX, clampedY);

      if (isInsideWater && prevState === 'land') {
        // Jump/step into water
        this.localPlayer.state = 'water';
        this.localPlayer.currentAction = this.isMoving ? 'swim1' : 'tread';
        sound.playSplash();
        this.createSplashParticles(clampedX, clampedY);
      } else if (!isInsideWater && prevState === 'water') {
        // Step onto land deck
        this.localPlayer.state = 'land';
        this.localPlayer.currentAction = this.isMoving ? 'walk1' : 'idle';
        sound.playFootstep();
        this.createLandDripParticles(clampedX, clampedY);
      }
    }

    this.localPlayer.x = clampedX;
    this.localPlayer.y = clampedY;
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
          this.onPlayerCountChange(this.remotePlayers.size + 1);
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

    // 1. Background
    if (this.bgImage) {
      this.ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = '#4079d0';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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

    // 6b. NPCs
    if (this.room.npcs) {
      for (const npc of this.room.npcs) {
        const capturedNpc = npc;
        drawFns.push({
          y: npc.y,
          draw: () => {
            this.renderNpcSprite(capturedNpc, time);
            // Defer NPC nametag as overlay
            overlayFns.push(() => this.renderNpcOverlay(capturedNpc));
          }
        });
      }
    }

    // 6c. All players (local + remote)
    const allPlayers: PlayerData[] = [this.localPlayer];
    for (const r of this.remotePlayers.values()) {
      allPlayers.push(r.data);
    }
    for (const player of allPlayers) {
      const sprite = this.getPlayerSprite(player);
      const h = sprite?.height ?? 82;
      let drawY = player.y;
      if (player.state === 'water') {
        drawY += Math.sin((time * 0.0035) + player.x * 0.05) * 3;
      }
      if (player.currentAction === 'jump') {
        const jumpProgress = (time % 600) / 600;
        drawY -= Math.sin(jumpProgress * Math.PI) * 16;
      }
      const capturedPlayer = player;
      const capturedSprite = sprite;
      const capturedDrawY = drawY;
      const capturedH = h;
      drawFns.push({
        y: player.y,
        draw: () => {
          this.renderPlayerSprite(capturedPlayer, capturedDrawY, capturedSprite);
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

    // 7. Overlays (name tags, speech bubbles) — always on top
    for (const fn of overlayFns) {
      fn();
    }

    // 8. Debug overlay (F3)
    if (this.showDebug) {
      this.renderDebugOverlay();
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

    // Use 1.5× sprites if room has actorScale > 1
    if (this.actorScale > 1) {
      let key15x = `land_1_5x_${action}`;
      if (this.sprites.has(key15x)) return this.sprites.get(key15x);
      // Fallback to 1.5× idle
      key15x = 'land_1_5x_idle';
      if (this.sprites.has(key15x)) return this.sprites.get(key15x);
    }

    // Standard 1× sprites
    let spriteKey = `land_${action}`;
    if (!this.sprites.has(spriteKey)) {
      spriteKey = 'land_idle';
    }
    return this.sprites.get(spriteKey) || this.sprites.get('land_idle');
  }

  /** Pick a pose for an NPC based on time (simple animation cycle). */
  private getNpcAction(npcId: string, time: number): string {
    // Only animate if multiple frames are loaded
    if (!this.npcSprites.has(`npc_${npcId}_blink`)) return 'idle';
    const cycle = ['idle', 'idle', 'blink', 'idle', 'pour', 'idle', 'serve', 'wai'];
    const idx = Math.floor(time / 3500) % cycle.length;
    return cycle[idx];
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

  /** Draw an NPC sprite at native size (already café-scale). */
  private renderNpcSprite(
    npc: { id: string; name: string; x: number; y: number; sprite: string; facing: 1 | -1 },
    time: number
  ) {
    const action = this.getNpcAction(npc.id, time);
    const spriteKey = `npc_${npc.id}_${action}`;
    const sprite = this.npcSprites.get(spriteKey) || this.npcSprites.get(`npc_${npc.id}_idle`);
    if (!sprite) return;

    // Shadow
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(20, 25, 40, 0.22)';
    this.ctx.beginPath();
    const shadowRx = Math.max(16, Math.round(sprite.width * 0.35));
    const shadowRy = Math.max(5, Math.round(sprite.width * 0.12));
    this.ctx.ellipse(npc.x, npc.y - 2, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Sprite (bottom-centre anchor, native size)
    this.ctx.save();
    this.ctx.translate(npc.x, npc.y);
    if (npc.facing === -1) {
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(sprite, -Math.floor(sprite.width / 2), -sprite.height);
    this.ctx.restore();
  }

  /** Deferred: NPC name tag (drawn above all depth-sorted items). */
  private renderNpcOverlay(
    npc: { id: string; name: string; x: number; y: number; sprite: string; facing: 1 | -1 }
  ) {
    const sprite = this.npcSprites.get(`npc_${npc.id}_idle`);
    const h = sprite?.height ?? 82;
    // Render nametag as a non-"me" tag
    const tagData: PlayerData = {
      id: '__npc_' + npc.id,
      name: npc.name,
      x: npc.x,
      y: npc.y,
      state: 'land',
      facing: npc.facing,
      floatColor: 'gray',
      currentAction: 'idle',
      timestamp: 0
    };
    this.renderNameTag(tagData, npc.x, npc.y - h - 6);
  }

  /** Draw a player's sprite (shadow, character, jump). */
  private renderPlayerSprite(player: PlayerData, drawY: number, spriteImg: HTMLImageElement | undefined) {
    if (!spriteImg) return;
    const isWater = player.state === 'water';

    // Shadow on land
    if (!isWater) {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(20, 25, 40, 0.28)';
      this.ctx.beginPath();
      const shadowRadiusX = Math.max(16, Math.round(spriteImg.width * 0.38));
      const shadowRadiusY = Math.max(5, Math.round(spriteImg.width * 0.13));
      this.ctx.ellipse(player.x, player.y - 2, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Character sprite with horizontal flipping
    this.ctx.save();
    this.ctx.translate(player.x, drawY);
    if (player.facing === -1) {
      this.ctx.scale(-1, 1);
    }
    // Anchor: bottom center
    const w = spriteImg.width;
    const h = spriteImg.height;
    this.ctx.drawImage(spriteImg, -Math.floor(w / 2), -h);
    this.ctx.restore();
  }

  /** Deferred: player name tag + speech bubble (drawn above all depth-sorted items). */
  private renderPlayerOverlay(player: PlayerData, drawY: number, spriteHeight: number) {
    // Player Name Badge
    this.renderNameTag(player, player.x, drawY - spriteHeight - 6);

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

    this.ctx.font = '8px "Silkscreen", monospace';
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

    this.ctx.font = '10px "Press Start 2P", monospace';
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

    const lineHeight = 14;
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
