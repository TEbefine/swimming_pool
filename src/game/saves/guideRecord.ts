// The Fishing Guides (Nami by day, Kai by night) record your catches into your Player ID's Fish Book.
// ID-01 plan: "Lumen Bay fishing: talk to the NPC to finish … record species and size in the Fish Book."
// The record node shows a "writing…" line at once; App swaps in the real result when the server answers.
import type { DialogLine, DialogNode, DialogScript } from '../content/dialogues';
import { FREE_BY_ID } from '../fishing/freeFish';
import type { RecordResult } from './cloud';

export const FISHING_GUIDES: ReadonlySet<string> = new Set(['nami', 'kai']);

/** The guide's normal script, plus "Record my catches (N)" when this Player ID has catches waiting. */
export function guideScript(base: DialogScript, pending: number, signedIn: boolean): DialogScript {
  if (!signedIn || pending <= 0) return base;
  const greet = base.nodes[base.start];
  const menu = greet.choices ?? [];
  const label = `Record my catches (${pending})`;
  return {
    ...base,
    nodes: {
      ...base.nodes,
      [base.start]: { ...greet, choices: [{ label, next: 'record' }, ...menu] },
      record: {
        lines: [{ text: `${pending === 1 ? 'One catch' : `${pending} catches`}? Let me write them in your Fish Book.`, pose: 'clipboard', face: 'explain' }],
        next: 'record_result',
      },
      record_result: { lines: [{ text: 'Writing… one moment.', pose: 'clipboard', face: 'thinking' }], choices: menu },
    },
  };
}

function names(ids: string[]): string {
  const list = [...new Set(ids)].map((id) => FREE_BY_ID[id]?.name ?? id);
  return list.length <= 3 ? list.join(', ') : `${list.slice(0, 3).join(', ')} and ${list.length - 3} more`;
}

/** Replace the placeholder with what the server said. */
export function withRecordResult(script: DialogScript, r: RecordResult): DialogScript {
  const node = script.nodes.record_result;
  if (!node) return script;
  const lines: DialogLine[] = [];
  if (r.recorded > 0) {
    lines.push({ text: `Done! ${r.recorded === 1 ? 'One fish is' : `${r.recorded} fish are`} now in your Fish Book.`, pose: 'thumbsup', face: 'confident' });
    if (r.newKinds.length) lines.push({ text: `New kinds for you: ${names(r.newKinds)}!`, pose: 'happy', face: 'smile' });
  }
  if (r.dropped > 0) {
    lines.push({ text: `${r.dropped === 1 ? 'One catch' : `${r.dropped} catches`} couldn't go in the book${r.error ? `: ${r.error}` : '.'}`, pose: 'thinking', face: 'thinking' });
  } else if (r.error) {
    lines.push({ text: `Hmm, the record book won't open right now (${r.error}) Your catches stay safe with you. Try again later.`, pose: 'radio', face: 'thinking' });
  }
  if (!lines.length) lines.push({ text: 'Nothing new to write down. Go catch something!', pose: 'talk', face: 'smile' });
  const next: DialogNode = { ...node, lines };
  return { ...script, nodes: { ...script.nodes, record_result: next } };
}
