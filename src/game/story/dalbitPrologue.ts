// "The Heir of Dalbit" — Prologue director (Day 1 morning in the Kang family yard, for now).
// The story decides WHO says WHAT depending on the current beat, and what happens when a
// dialogue reaches a node (items, flags, next beat). Rooms whose id starts with "dalbit_"
// use it; everywhere else the normal dialogues in content/dialogues.ts run.
// Full script: project doc story/dalbit-heir.md.

import type { DialogScript } from '../content/dialogues';
import type { ContextActionId } from '../types';
import { npcName } from '../content/npcNames';
import { addItem, addLedger, getStory, setEnergy, setFlag, setStep, type StoryState } from './storyStore';

export function isStoryRoom(roomId: string): boolean {
  return roomId.startsWith('dalbit_');
}

/** Story beats, in order. `objective` is the line in the top banner. */
export const BEATS: Record<string, { objective: string }> = {
  d1_wake: { objective: 'Say good morning to Mother' },
  d1_father: { objective: 'Find Father by the drying rack' },
  d1_go_fish: { objective: 'Go to the river mouth (the path by the gate)' },
  d1_river: { objective: 'Walk to the end of the pier' },
  d1_fish: { objective: 'Fish from the end of the pier (fishing: coming soon)' },
};

/** Beat order, so "at or after" checks keep working when new beats are added. */
const STEP_ORDER = Object.keys(BEATS);

export function reached(s: StoryState, step: string): boolean {
  return STEP_ORDER.indexOf(s.step) >= STEP_ORDER.indexOf(step);
}

// ---- travel ----------------------------------------------------------------
// A dialogue choice can ask to move to another room; App runs it after the dialogue closes.
let pendingTravel: string | null = null;

/** The room a finished dialogue asked to go to (read once). */
export function takeStoryTravel(): string | null {
  const t = pendingTravel;
  pendingTravel = null;
  return t;
}

/** Called by App whenever a story room loads. */
export function onStoryRoomEnter(roomId: string) {
  const s = getStory();
  if (roomId === 'dalbit_river' && s.step === 'd1_go_fish') setStep('d1_river');
}

export function objectiveFor(s: StoryState): string {
  return BEATS[s.step]?.objective ?? '';
}

// ---- speakers --------------------------------------------------------------

const MOTHER = {
  name: npcName('mother'),
  portraitDir: '/sprites/npc/mother/portrait',
  faces: ['neutral', 'smile', 'careful', 'sorrow', 'wistful'],
  accent: '#3E4A6E',
  closePose: 'idle',
} as const;

const FATHER = {
  name: npcName('father'),
  portraitDir: '/sprites/npc/father/portrait',
  faces: ['neutral', 'smile', 'watchful', 'restrain', 'fierce'],
  accent: '#6E533C',
  closePose: 'mend_net',
} as const;

/** Yunseul's own thoughts when he looks at things (his portrait, no NPC sprite). */
const YUNSEUL = {
  name: npcName('yunseul'),
  portraitDir: '/sprites/npc/yunseul/portrait',
  faces: ['neutral', 'smile', 'determined', 'worried', 'surprised'],
  accent: '#6F7A8C',
  closePose: 'none',
} as const;

type Speaker = typeof MOTHER | typeof FATHER | typeof YUNSEUL;

function script(speaker: Speaker, start: string, nodes: DialogScript['nodes']): DialogScript {
  return { ...speaker, faces: [...speaker.faces], start, nodes };
}

function say(speaker: Speaker, lines: DialogScript['nodes'][string]['lines']): DialogScript {
  return script(speaker, 'a', { a: { lines } });
}

// ---- dialogue per beat -----------------------------------------------------

function motherDialog(s: StoryState): DialogScript {
  if (s.step === 'd1_wake') {
    return script(MOTHER, 'greet', {
      greet: {
        lines: [
          { text: "Yunseul-ah, you're up! The tide won't wait for you.", pose: 'happy', face: 'smile' },
          { text: "Your father's been at the nets since dawn. Eat first.", pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'Eat breakfast', next: 'breakfast' },
          { label: 'Is the rice jar full?', next: 'jar' },
        ],
      },
      jar: {
        lines: [
          { text: "Half full. It's always half full.", pose: 'talk', face: 'careful' },
          { text: "Don't you worry about the rice jar. That's my job.", pose: 'shake_head', face: 'careful' },
        ],
        choices: [{ label: 'Eat breakfast', next: 'breakfast' }],
      },
      breakfast: {
        lines: [
          { text: 'Barley, with a little rice on top for you.', pose: 'hold_bowl', face: 'smile' },
          { text: 'Eat it all. The sea takes more strength than you think.', pose: 'hold_bowl', face: 'neutral' },
        ],
        next: 'ate',
      },
      ate: {
        lines: [{ text: "Now go on. Your father's waiting by the drying rack.", pose: 'happy', face: 'smile' }],
      },
    });
  }
  if (s.step === 'd1_father') {
    return say(MOTHER, [{ text: "Your father's by the drying rack. Go on, before he grumbles.", pose: 'talk', face: 'smile' }]);
  }
  return say(MOTHER, [{ text: 'Come home before the tide turns.', pose: 'happy', face: 'smile' }]);
}

function fatherDialog(s: StoryState): DialogScript {
  if (s.step === 'd1_wake') {
    return say(FATHER, [{ text: 'Eat first. Your mother will scold us both.', pose: 'talk', face: 'neutral' }]);
  }
  if (s.step === 'd1_father') {
    return script(FATHER, 'greet', {
      greet: {
        lines: [{ text: "You're late. The fish woke up before you did.", pose: 'talk', face: 'neutral' }],
        choices: [
          { label: 'Sorry, Father', next: 'net' },
          { label: 'What happened to your hands?', next: 'hands' },
        ],
      },
      hands: {
        lines: [
          { text: 'Old work. I carried heavy doors for a big house, once.', pose: 'idle', face: 'watchful' },
          { text: "That's enough questions.", pose: 'talk', face: 'neutral' },
        ],
        next: 'net',
      },
      net: {
        lines: [{ text: 'Take the small net. Big fish are for big hands.', pose: 'talk', face: 'neutral' }],
        next: 'lesson',
      },
      lesson: {
        lines: [
          { text: "Don't pull when it bites. Pull when it turns.", pose: 'talk', face: 'smile' },
          { text: "Go on ahead to the river mouth. I'll finish this net and follow.", pose: 'mend_net', face: 'neutral' },
        ],
      },
    });
  }
  return say(FATHER, [{ text: 'The river mouth. Past the gate. Mind the rocks.', pose: 'mend_net', face: 'neutral' }]);
}

/** Things Yunseul can look at (room interactables with these ids). */
function lookDialog(id: string, s: StoryState): DialogScript | null {
  if (id === 'rice_jar') {
    return script(YUNSEUL, 'a', {
      a: {
        lines: s.flags.looked_rice_jar
          ? [{ text: "Mother's rice jar. Half full, she says.", face: 'neutral' }]
          : [
              { text: "Mother's rice jar. She says it's always half full.", face: 'neutral' },
              { text: "...It looks lower than last week.", face: 'worried' },
            ],
      },
    });
  }
  if (id === 'drying_rack') {
    return say(YUNSEUL, [
      { text: "Yesterday's mackerel, drying in the sun.", face: 'neutral' },
      { text: 'Dried fish sells for more. Or so the innkeeper says.', face: 'smile' },
    ]);
  }
  if (id === 'gate') {
    if (!reached(s, 'd1_go_fish')) {
      return say(YUNSEUL, [{ text: 'Not yet. If I skip breakfast, Mother will chase me with a ladle.', face: 'smile' }]);
    }
    return script(YUNSEUL, 'a', {
      a: {
        lines: [{ text: 'The path to the river mouth.', face: 'determined' }],
        choices: [
          { label: 'Go to the river mouth', next: 'go' },
          { label: 'Not yet', next: 'stay' },
        ],
      },
      go: { lines: [{ text: 'The tide is turning. Let\'s go.', face: 'smile' }] },
      stay: { lines: [{ text: 'A little longer. The river isn\'t going anywhere.', face: 'neutral' }] },
    });
  }
  // ---- river mouth ----
  if (id === 'pier_end') {
    if (s.step === 'd1_river' || s.step === 'd1_fish') {
      return say(YUNSEUL, [
        { text: 'The end of the pier. Where the river meets the sea.', face: 'neutral' },
        { text: "Father's words: don't pull when it bites. Pull when it turns.", face: 'determined' },
        { text: '[Coming soon: fishing.]', face: 'neutral' },
      ]);
    }
    return say(YUNSEUL, [{ text: 'The end of the pier. The water is so clear today.', face: 'smile' }]);
  }
  if (id === 'basket') {
    const fish = (s.bag.mackerel ?? 0) + (s.bag.dried_mackerel ?? 0);
    return say(YUNSEUL, [
      fish > 0
        ? { text: 'Our fish basket. Not empty anymore!', face: 'smile' }
        : { text: "Father's old fish basket. Empty, for now.", face: 'neutral' },
    ]);
  }
  return null;
}

/** The story's dialogue for a talk / look target, or null to use the normal dialogue. */
export function storyDialog(targetId: string, action: ContextActionId | undefined, s: StoryState = getStory()): DialogScript | null {
  if (action === 'talk') {
    if (targetId === 'mother') return motherDialog(s);
    if (targetId === 'father') return fatherDialog(s);
    return null;
  }
  if (action === 'read') return lookDialog(targetId, s);
  return null;
}

/** Story effects when a dialogue enters a node. */
export function onStoryNode(targetId: string, nodeId: string) {
  const s = getStory();
  if (targetId === 'mother' && nodeId === 'jar') setFlag('asked_rice_jar');
  if (targetId === 'mother' && nodeId === 'ate' && s.step === 'd1_wake') {
    setFlag('ate_breakfast');
    setEnergy(10);
    setStep('d1_father');
  }
  if (targetId === 'father' && nodeId === 'hands') setFlag('asked_father_hands');
  if (targetId === 'father' && nodeId === 'net' && !s.bag.small_net) {
    addItem('small_net');
    setStep('d1_go_fish');
  }
  if (targetId === 'gate' && nodeId === 'go' && reached(s, 'd1_go_fish')) pendingTravel = 'dalbit_river';
  if (targetId === 'pier_end' && nodeId === 'a' && s.step === 'd1_river') {
    setFlag('reached_pier_end');
    setStep('d1_fish');
  }
  if (targetId === 'rice_jar' && nodeId === 'a' && !s.flags.looked_rice_jar) {
    setFlag('looked_rice_jar');
    addLedger('You looked into the rice jar. Lower than last week.');
  }
}
