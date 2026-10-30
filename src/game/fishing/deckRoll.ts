// Explicit protocol dispatch. Issuance/redemption accepts only the active reset-local version;
// retained kernels/vectors remain callable independently of that active version.
import { rollDeckCatch as rollV1 } from './deckKernelV1.js';
import { rollDeckCatch as rollV2 } from './deckRollV2.js';
import type { DeckRollInput, DeckCatch } from './deckKernelV1.js';
export type { DeckCastInfo, DeckRollInput, DeckCatch } from './deckKernelV1.js';
// V1 and v2 keep the same canonical bands/calendar; createDeckRng remains the v1 vector helper.
export { canonicalDeckCast, deckContextAt, createDeckRng } from './deckKernelV1.js';

export function rollDeckCatch(input: DeckRollInput): DeckCatch {
  switch (input?.version) {
    case 1: return rollV1(input);
    case 2: return rollV2(input);
    default: throw new RangeError('Unsupported fishing deck version.');
  }
}
