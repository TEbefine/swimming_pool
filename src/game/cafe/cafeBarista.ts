// What the barista says around the order app (Café step 2). Fake for now: no cup goes in the bag,
// no money is taken, no cutscene yet — she reads the order back and hands it over.

import type { DialogLine, DialogScript } from '../content/dialogues';
import { dialogues } from '../content/dialogues';
import { cupCount, orderTotal, readBackLine, type OrderLine } from './cafeMenu';

function baristaScript(start: string, nodes: DialogScript['nodes']): DialogScript {
  const base = dialogues.barista;
  return { name: base.name, portraitDir: base.portraitDir, faces: base.faces, accent: base.accent, start, nodes };
}

/** After "Place order": she reads it back, makes it, hands it over. (Fake: nothing goes in the bag yet.) */
export function orderReadBack(lines: OrderLine[]): DialogScript {
  const items: DialogLine[] = lines.map((l) => ({ text: readBackLine(l), pose: 'talk', face: 'neutral' }));
  const cups = cupCount(lines);
  return baristaScript('read', {
    read: {
      lines: [
        { text: 'Okay, let me read it back.', pose: 'thinking', face: 'thinking' },
        ...items,
        { text: `That's ฿${orderTotal(lines)}. It's on the house today!`, pose: 'happy', face: 'smile' },
        { text: cups > 1 ? 'Give me a minute...' : 'Give me one minute...', pose: 'pour', face: 'idea' },
        { text: 'Here you are! Enjoy.', pose: 'serve', face: 'smile' },
      ],
    },
  });
}

/** Closed the order app without ordering. */
export function orderCancelled(): DialogScript {
  return baristaScript('later', {
    later: { lines: [{ text: "No rush. Just call me when you're ready.", pose: 'talk', face: 'smile' }] },
  });
}
