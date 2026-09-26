import { CITY } from './cityView';

export interface MoverDef {
  id: string;
  frames: string[];
  frameMs?: number;
  nightFrames?: string[];
  layer: 'far' | 'near';
  y: number | [number, number];
  speed: number; // px/s
  everySec: [number, number]; // [min, max]
  direction: 1 | -1 | 'random';
  onlyWhen?: 'day' | 'night';
}

export const MOVER_CONFIGS: MoverDef[] = [
  {
    id: 'train',
    frames: ['/sprites/world/train_day.webp'],
    nightFrames: ['/sprites/world/train_night.webp'],
    layer: 'near',
    y: CITY.trackY, // 150
    speed: 90,
    everySec: [35, 80],
    direction: 'random',
  },
  {
    id: 'bird',
    frames: ['/sprites/world/bird_up.webp', '/sprites/world/bird_down.webp'],
    frameMs: 180,
    layer: 'far',
    y: [35, 80],
    speed: 45,
    everySec: [12, 30],
    onlyWhen: 'day',
    direction: -1,
  },
  {
    id: 'flock',
    frames: ['/sprites/world/birds_flock.webp'],
    layer: 'far',
    y: [60, 95],
    speed: 35,
    everySec: [40, 90],
    onlyWhen: 'day',
    direction: -1,
  },
  {
    id: 'plane',
    frames: ['/sprites/world/plane.webp'],
    layer: 'far',
    y: [20, 45],
    speed: 25,
    everySec: [60, 120],
    direction: 1,
  },
];

interface CloudInstance {
  frame: string;
  x: number;
  y: number;
  speed: number;
}

interface MoverInstance {
  config: MoverDef;
  active: boolean;
  x: number;
  y: number;
  direction: 1 | -1;
  activeTime: number;
  nextSpawnTime: number;
  width: number;
}

const DEFAULT_WIDTHS: Record<string, number> = {
  train: 365,
  bird: 19,
  flock: 68,
  plane: 65,
};

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MoversManager {
  private clouds: CloudInstance[] = [];
  private movers: MoverInstance[] = [];

  constructor() {
    this.initClouds();
    this.initMovers();
  }

  private initClouds() {
    this.clouds = [
      { frame: '/sprites/world/cloud_1.webp', x: 80, y: 48, speed: 4 },
      { frame: '/sprites/world/cloud_2.webp', x: 420, y: 68, speed: 4 },
      { frame: '/sprites/world/cloud_3.webp', x: 760, y: 56, speed: 4 },
    ];
  }

  private initMovers() {
    const now = performance.now();
    this.movers = MOVER_CONFIGS.map((config) => {
      const defW = DEFAULT_WIDTHS[config.id] || 60;
      return {
        config,
        active: false,
        x: 0,
        y: typeof config.y === 'number' ? config.y : config.y[0],
        direction: config.direction === -1 ? -1 : 1,
        activeTime: 0,
        // First spawn 3–8 s after entering the room
        nextSpawnTime: now + randRange(3, 8) * 1000,
        width: defW,
      };
    });
  }

  /** Reset mover positions and spawn timers when entering/changing room. */
  public reset() {
    const now = performance.now();
    this.initClouds();
    for (const m of this.movers) {
      m.active = false;
      m.activeTime = 0;
      m.nextSpawnTime = now + randRange(3, 8) * 1000;
    }
  }

  /** Update movers positions, wrapping, and spawn timers. */
  public update(dt: number, night: number, moverSprites: Map<string, HTMLImageElement>) {
    const now = performance.now();

    // 1. Update clouds (always present, drifting right at 4 px/s, wrapping)
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      const sprite = moverSprites.get(cloud.frame);
      const w = sprite?.width ?? 130;
      if (cloud.x > 1024 + w) {
        cloud.x = -w;
      }
    }

    // 2. Update periodic movers
    for (const m of this.movers) {
      const { config } = m;
      const spriteKey = (night > 0.5 && config.nightFrames && config.nightFrames.length > 0)
        ? config.nightFrames[0]
        : config.frames[0];
      const sprite = moverSprites.get(spriteKey);
      if (sprite && sprite.width > 0) {
        m.width = sprite.width;
      }

      if (m.active) {
        m.x += m.direction * config.speed * dt;
        m.activeTime += dt * 1000;

        // Check if finished crossing
        if (m.direction === 1 && m.x > 1024) {
          m.active = false;
          m.nextSpawnTime = now + randRange(config.everySec[0], config.everySec[1]) * 1000;
        } else if (m.direction === -1 && m.x < -m.width) {
          m.active = false;
          m.nextSpawnTime = now + randRange(config.everySec[0], config.everySec[1]) * 1000;
        }
      } else {
        // Inactive: check if ready to spawn
        if (now >= m.nextSpawnTime) {
          // Check time-of-day condition
          if (config.onlyWhen === 'day' && night >= 0.5) {
            m.nextSpawnTime = now + randRange(3, 8) * 1000;
            continue;
          }
          if (config.onlyWhen === 'night' && night < 0.5) {
            m.nextSpawnTime = now + randRange(3, 8) * 1000;
            continue;
          }

          // Spawn
          m.active = true;
          m.activeTime = 0;
          m.y = typeof config.y === 'number' ? config.y : randRange(config.y[0], config.y[1]);

          if (config.direction === 'random') {
            m.direction = Math.random() < 0.5 ? 1 : -1;
          } else {
            m.direction = config.direction;
          }

          m.x = m.direction === 1 ? -m.width : 1024;
        }
      }
    }
  }

  /** Render movers for a specific layer ('far' on L0.5, 'near' on L0.8). */
  public render(
    ctx: CanvasRenderingContext2D,
    layer: 'far' | 'near',
    moverSprites: Map<string, HTMLImageElement>,
    night: number
  ) {
    if (layer === 'far') {
      // 1. Clouds: alpha fades to 0.25 at night
      ctx.save();
      const cloudAlpha = Math.max(0.25, 1 - 0.75 * night);
      ctx.globalAlpha = cloudAlpha;

      for (const cloud of this.clouds) {
        const sprite = moverSprites.get(cloud.frame);
        if (!sprite) continue;
        const h = sprite.height;
        const drawY = Math.round(cloud.y - h);
        ctx.drawImage(sprite, Math.round(cloud.x), drawY);
      }
      ctx.restore();

      // 2. Far movers (birds, flock, plane)
      for (const m of this.movers) {
        if (m.config.layer !== 'far' || !m.active) continue;
        this.renderMoverSprite(ctx, m, moverSprites, night);
      }
    } else if (layer === 'near') {
      // Near movers (train on city tracks)
      for (const m of this.movers) {
        if (m.config.layer !== 'near' || !m.active) continue;
        this.renderMoverSprite(ctx, m, moverSprites, night);
      }
    }
  }

  private renderMoverSprite(
    ctx: CanvasRenderingContext2D,
    m: MoverInstance,
    moverSprites: Map<string, HTMLImageElement>,
    night: number
  ) {
    const { config } = m;
    const frames = (night > 0.5 && config.nightFrames && config.nightFrames.length > 0)
      ? config.nightFrames
      : config.frames;

    let frame = frames[0];
    if (config.frameMs && frames.length > 1) {
      const idx = Math.floor(m.activeTime / config.frameMs) % frames.length;
      frame = frames[idx];
    }

    const sprite = moverSprites.get(frame);
    if (!sprite) return;

    const w = sprite.width;
    const h = sprite.height;
    // y = sprite BOTTOM edge
    const drawY = Math.round(m.y - h);
    const drawX = Math.round(m.x);

    // If moving right-to-left (direction = -1), flip horizontally
    if (m.direction === -1) {
      ctx.save();
      ctx.translate(drawX + w, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, drawX, drawY);
    }
  }
}
