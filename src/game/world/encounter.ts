// Random animal encounters while walking in tall grass (Teera, 2026-11-02).
// Each `stepPx` walked inside a grass zone rolls `chance`. On a hit the engine plays the flash
// transition and calls `onEncounter`. Battles come later (docs/ui/battle-screen.md); until then the
// App shows a short "coming soon" talk box from `encounterScript`.

import type { DialogScript } from '../content/dialogues';

export const ENCOUNTER = {
  /** Walk this many px in grass per roll (the player walks ~160 px/s). */
  stepPx: 32,
  /** Chance per roll → on average one animal every ~400 px (≈ 2.5 s) of walking in grass. */
  chance: 0.08,
  /** No encounter right after arriving in the room or right after the last one. */
  graceMs: 1500,
  cooldownMs: 4000,
  /** Flash transition length before the battle (3 white flashes, then the screen closes). */
  flashMs: 900,
};

export class EncounterRoller {
  private walked = 0;
  private quietUntil = 0;
  private readonly rand: () => number;
  constructor(rand: () => number = Math.random) { this.rand = rand; }

  /** Arriving / after a battle: start counting from zero and wait a moment. */
  reset(now: number, quietMs: number = ENCOUNTER.graceMs): void {
    this.walked = 0;
    this.quietUntil = now + quietMs;
  }

  /** Call every frame with how far the player walked. True = an animal appears now. */
  step(distPx: number, inGrass: boolean, now: number): boolean {
    if (!inGrass) { this.walked = 0; return false; }
    if (now < this.quietUntil || distPx <= 0) return false;
    this.walked += distPx;
    while (this.walked >= ENCOUNTER.stepPx) {
      this.walked -= ENCOUNTER.stepPx;
      if (this.rand() < ENCOUNTER.chance) {
        this.reset(now, ENCOUNTER.flashMs + ENCOUNTER.cooldownMs);
        return true;
      }
    }
    return false;
  }
}

/** The approved cat family (docs/ui/battle-screen.md) — names only until the battle sprites exist. */
const WILD_CATS = ['grey-and-white cat', 'fluffy white cat', 'British Shorthair', 'Siamese cat', 'orange tabby cat'];

/** Placeholder until the battle screen exists. Lines stay ≤ 64 characters (2 rows). */
export function encounterScript(rand: () => number = Math.random): DialogScript {
  const cat = WILD_CATS[Math.floor(rand() * WILD_CATS.length)];
  return {
    name: 'Tall grass',
    accent: '#2F7A4A',
    closePose: 'none',
    start: 'meet',
    nodes: {
      meet: {
        lines: [
          { text: 'The grass rustles...' },
          { text: `A wild ${cat} jumps out!` },
          { text: 'It stares at you, then dashes back into the grass.' },
          { text: '(Animal battles are coming soon.)' },
        ],
      },
    },
  };
}
