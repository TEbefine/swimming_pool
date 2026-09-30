// "The Heir of Dalbit" — Prologue director (Day 1: morning → river → market → dusk → night).
// The story decides WHO says WHAT depending on the current beat, and what happens when a
// dialogue reaches a node (items, coins, flags, next beat). Rooms whose id starts with "dalbit_"
// use it; everywhere else the normal dialogues in content/dialogues.ts run.
// Full script: the story bible artifact + project doc story/dalbit-heir.md.

import type { DialogScript, PortraitFace } from '../content/dialogues';
import type { ContextActionId, RoomDefinition } from '../types';
import { npcName } from '../content/npcNames';
import {
  addCoins, addCounter, addItem, addLedger, getStory, removeItem, setEnergy, setFlag, setStep,
  subscribeStory, updateStory, type StoryState,
} from './storyStore';
import { ITEMS, ITEM_IDS, giftTaste, sellPrice, withArticle, type Buyer, type ItemId } from './items';
import { dalbitYardRoom } from '../rooms/dalbitYard';
import { dalbitRiverRoom } from '../rooms/dalbitRiver';
import { dalbitMarketRoom } from '../rooms/dalbitMarket';

export function isStoryRoom(roomId: string): boolean {
  return roomId.startsWith('dalbit_');
}

/** Story beats, in order. `objective` is the line in the top banner. */
export const BEATS: Record<string, { objective: string }> = {
  d1_wake: { objective: 'Say good morning to Mother' },
  d1_father: { objective: 'Find Father by the drying rack' },
  d1_go_fish: { objective: 'Go to the river mouth (out through the gate, bottom right)' },
  d1_river: { objective: 'Walk to the end of the pier' },
  d1_fish: { objective: 'Catch some fish from the end of the pier' },
  d1_market: { objective: 'Sell your catch at the dock market (walk right along the beach)' },
  d1_sold: { objective: 'Go home before dark (back past the river mouth)' },
  d1_dusk: { objective: 'Show Mother what you brought home' },
  d1_frog: { objective: 'Sit with Father by the drying rack' },
  d1_night: { objective: 'Say goodnight to Mother' },
  d1_end: { objective: 'Day 1 is done. Day 2 is coming soon.' },
};

/** Beat order, so "at or after" checks keep working when new beats are added. */
const STEP_ORDER = Object.keys(BEATS);

export function reached(s: StoryState, step: string): boolean {
  return STEP_ORDER.indexOf(s.step) >= STEP_ORDER.indexOf(step);
}

// ---- time of day ------------------------------------------------------------
// The story has its own clock: the time of day follows the beat (not the real Bangkok time),
// so nobody gets locked out of "before noon" by playing at night. `?hour=` still overrides for tests.
export type Phase = 'morning' | 'midday' | 'dusk' | 'night';

const PHASE_HOUR: Record<Phase, number> = { morning: 8, midday: 12.5, dusk: 18.3, night: 21.5 };

export function storyPhase(s: StoryState = getStory()): Phase {
  if (reached(s, 'd1_night')) return 'night';
  if (reached(s, 'd1_dusk')) return 'dusk';
  if (reached(s, 'd1_market')) return 'midday';
  return 'morning';
}

const STORY_ROOMS: RoomDefinition[] = [dalbitYardRoom, dalbitRiverRoom, dalbitMarketRoom];

function applyStoryHour(s: StoryState) {
  const hour = PHASE_HOUR[storyPhase(s)];
  for (const room of STORY_ROOMS) if (room.view) room.view.fixedHour = hour;
}

// ---- automatic beats (watch the save) ---------------------------------------------------

function fishInBag(s: StoryState): number {
  return ITEM_IDS.filter((i) => ITEMS[i].kind === 'fish').reduce((n, i) => n + (s.bag[i] ?? 0), 0);
}

/** A good morning's catch (the bible: 4–6 mackerel). Tired arms also end the morning. */
const ENOUGH_FISH = 4;

function autoBeats(s: StoryState) {
  applyStoryHour(s);
  if (s.step === 'd1_fish' && (fishInBag(s) >= ENOUGH_FISH || s.energy <= 0)) setStep('d1_market');
}
subscribeStory(() => autoBeats(getStory()));
autoBeats(getStory()); // an older save may already have enough fish

// ---- things a finished dialogue asks App to do -------------------------------------------

let pendingTravel: string | null = null;
let pendingFishing = false;

/** A window the story opens after a dialogue closes: a buyer's counter, or choosing a gift. */
export type StoryPanel = { kind: 'sell'; buyer: Buyer } | { kind: 'give'; to: GiftTarget };
export type GiftTarget = 'mother' | 'father';
let pendingPanel: StoryPanel | null = null;

/** The room a finished dialogue asked to go to (read once). Unused since the maps are walked (2026-09-30);
 *  kept for scripted moves later (e.g. a cutscene that carries you home). */
export function takeStoryTravel(): string | null {
  const t = pendingTravel;
  pendingTravel = null;
  return t;
}

/** At the pier end, ◯ throws the line straight away (no dialogue) once fishing is unlocked, until dusk. */
export function canFishDirect(s: StoryState = getStory()): boolean {
  return reached(s, 'd1_fish') && !reached(s, 'd1_dusk') && s.energy > 0;
}

/** True once, right after a dialogue asked to start fishing. */
export function takeStoryFishing(): boolean {
  const f = pendingFishing;
  pendingFishing = false;
  return f;
}

/** The window a finished dialogue asked to open (read once). */
export function takeStoryPanel(): StoryPanel | null {
  const p = pendingPanel;
  pendingPanel = null;
  return p;
}

// ---- walking between maps -------------------------------------------------------
// The Dalbit maps are joined by paths you walk (yard gate ⟷ river mouth ⟷ dock market).
// The story can say "not yet" at an exit; App shows this line and the player steps back.

/** A line from Yunseul if the story doesn't allow this path yet, otherwise null (go ahead). */
export function storyExitBlock(from: string, to: string, s: StoryState = getStory()): DialogScript | null {
  const tooDark = say(YUNSEUL, [{ text: "It's getting dark. Mother would worry.", face: 'neutral' }]);
  if (from === 'dalbit_yard' && to === 'dalbit_river') {
    if (!reached(s, 'd1_go_fish')) {
      return say(YUNSEUL, [{ text: 'Not yet. If I skip breakfast, Mother will chase me with a ladle.', face: 'smile' }]);
    }
    if (reached(s, 'd1_dusk')) return tooDark;
  }
  if (from === 'dalbit_river' && to === 'dalbit_market') {
    if (!reached(s, 'd1_market')) {
      return say(YUNSEUL, [{ text: 'The shore path to the dock market. An empty basket sells for nothing. Fish first.', face: 'smile' }]);
    }
    if (reached(s, 'd1_dusk')) return tooDark;
  }
  return null;
}

/** Called by App whenever a story room loads. */
export function onStoryRoomEnter(roomId: string) {
  const s = getStory();
  if (roomId === 'dalbit_river' && s.step === 'd1_go_fish') setStep('d1_river');
  if (roomId === 'dalbit_market') setFlag('visited_market');
  if (roomId === 'dalbit_yard' && (s.step === 'd1_sold' || (s.step === 'd1_market' && s.flags.visited_market))) {
    setStep('d1_dusk');
  }
}

export function objectiveFor(s: StoryState): string {
  return BEATS[s.step]?.objective ?? '';
}

// ---- selling (the counter window calls these) ---------------------------------------------

/** The inn only takes a few fresh fish, and only before noon. */
export const INN_DAILY_LIMIT = 3;

export function innOpen(s: StoryState = getStory()): boolean {
  return storyPhase(s) === 'morning';
}

export function innLeftToday(s: StoryState = getStory()): number {
  return Math.max(0, INN_DAILY_LIMIT - (s.counters[`inn_sold_d${s.day}`] ?? 0));
}

/** Price this buyer pays right now, or null (won't take it / inn closed or full). */
export function priceAt(id: ItemId, buyer: Buyer, s: StoryState = getStory()): number | null {
  const p = sellPrice(id, buyer);
  if (p === null) return null;
  if (buyer === 'inn' && (!innOpen(s) || innLeftToday(s) <= 0)) return null;
  return p;
}

/** Sell one. Returns the coins earned, or 0 if the sale didn't happen. */
export function sellOne(id: ItemId, buyer: Buyer): number {
  const s = getStory();
  const price = priceAt(id, buyer, s);
  if (price === null || !removeItem(id, 1)) return 0;
  addCoins(price);
  addCounter(`sold_${buyer}`);
  if (buyer === 'inn') {
    addCounter(`inn_sold_d${s.day}`);
    addLedger('You sold fish at the inn. Four coins, not two.');
  } else {
    addLedger('You sold your fish to Master Gu. Two coins each.');
  }
  if (s.step === 'd1_market') setStep('d1_sold');
  return price;
}

// ---- eating (the bag calls this) ----------------------------------------------------------

/** Eat a food item from the bag. Returns false if it can't be eaten. */
export function eatItem(id: ItemId): boolean {
  const e = ITEMS[id].energy;
  if (!e || !removeItem(id, 1)) return false;
  setEnergy(getStory().energy + e);
  if (id === 'yeot') setFlag('ate_yeot');
  return true;
}

// ---- speakers --------------------------------------------------------------

interface Speaker {
  name: string;
  portraitDir?: string;
  faces?: readonly PortraitFace[];
  accent: string;
  closePose: string;
}

const MOTHER: Speaker = {
  name: npcName('mother'),
  portraitDir: '/sprites/npc/mother/portrait',
  faces: ['neutral', 'smile', 'careful', 'sorrow', 'wistful'],
  accent: '#3E4A6E',
  closePose: 'idle',
};

const FATHER: Speaker = {
  name: npcName('father'),
  portraitDir: '/sprites/npc/father/portrait',
  faces: ['neutral', 'smile', 'watchful', 'restrain', 'fierce'],
  accent: '#6E533C',
  closePose: 'mend_net',
};

/** Yunseul's own thoughts when he looks at things (his portrait, no NPC sprite). */
const YUNSEUL: Speaker = {
  name: npcName('yunseul'),
  portraitDir: '/sprites/npc/yunseul/portrait',
  faces: ['neutral', 'smile', 'determined', 'worried', 'surprised'],
  accent: '#6F7A8C',
  closePose: 'none',
};

// Market people: grey-box talk spots, no portraits or sprites yet.
const GU: Speaker = { name: 'Master Gu', accent: '#4A4A58', closePose: 'none' };
const INNKEEPER: Speaker = { name: 'Innkeeper', accent: '#6A4E86', closePose: 'none' };
const RICE_SELLER: Speaker = { name: 'Rice seller', accent: '#5E7050', closePose: 'none' };
const YEOT_SELLER: Speaker = { name: 'Yeot seller', accent: '#B0703A', closePose: 'none' };

function script(speaker: Speaker, start: string, nodes: DialogScript['nodes']): DialogScript {
  return {
    name: speaker.name,
    portraitDir: speaker.portraitDir,
    faces: speaker.faces ? [...speaker.faces] : undefined,
    accent: speaker.accent,
    closePose: speaker.closePose,
    start,
    nodes,
  };
}

function say(speaker: Speaker, lines: DialogScript['nodes'][string]['lines']): DialogScript {
  return script(speaker, 'a', { a: { lines } });
}

// ---- Mother ------------------------------------------------------------------

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
  if (s.step === 'd1_dusk') {
    const lines: DialogScript['nodes'][string]['lines'] = [
      { text: "You're back! And before dark, too.", pose: 'happy', face: 'smile' },
    ];
    if (s.counters.sold_gu || s.counters.sold_inn) {
      lines.push({ text: 'Master Gu paid you? Good. Every coin helps.', pose: 'talk', face: 'neutral' });
    } else {
      lines.push({ text: 'No luck at the market? The sea has its days.', pose: 'talk', face: 'careful' });
    }
    if (s.flags.ate_yeot && !s.flags.yeot_halves) {
      lines.push({ text: "Is that yeot on your chin? Did you save any for your father?", pose: 'talk', face: 'smile' });
    }
    return script(MOTHER, 'greet', {
      greet: {
        lines,
        choices: [
          { label: 'Give her something', next: 'give' },
          { label: 'Tell her about the market', next: 'market' },
        ],
      },
      give: { lines: [{ text: 'Hm? What is it?', pose: 'talk', face: 'neutral' }] },
      market: {
        lines: [
          { text: 'Two coins a fish. It was two when we came to this village, too.', pose: 'talk', face: 'wistful' },
          { text: "Go and sit with your father. He's been waiting for you.", pose: 'happy', face: 'smile' },
        ],
      },
    });
  }
  if (s.step === 'd1_frog') {
    return say(MOTHER, [{ text: 'Go on, sit with your father. I will finish the washing.', pose: 'talk', face: 'smile' }]);
  }
  if (s.step === 'd1_night') {
    return script(MOTHER, 'a', {
      a: {
        lines: [
          { text: 'Long ago, a mother walked home over the mountains with rice cakes for her children.', pose: 'talk', face: 'wistful' },
          { text: "A tiger stopped her: 'Give me a rice cake, and I won't eat you.'", pose: 'talk', face: 'careful' },
          { text: 'She gave one at every pass. When the rice cakes ran out, the tiger came to the children\'s door, wearing her clothes.', pose: 'talk', face: 'sorrow' },
          { text: 'The children saw a paw under the door, and they ran. They climbed a tree and prayed, and the sky let down a rope.', pose: 'talk', face: 'wistful' },
          { text: 'They became the Sun and the Moon.', pose: 'talk', face: 'smile' },
        ],
        choices: [
          { label: 'What happened to the mother?', next: 'mother' },
          { label: 'Goodnight, Mother', next: 'night' },
        ],
      },
      mother: {
        lines: [
          { text: '...', pose: 'idle', face: 'sorrow' },
          { text: 'She gave everything she had, so they could reach the sky. Sleep, Yunseul-ah.', pose: 'talk', face: 'wistful' },
        ],
      },
      night: { lines: [{ text: 'Sleep, Yunseul-ah. The tide comes early.', pose: 'talk', face: 'smile' }] },
    });
  }
  if (s.step === 'd1_end') {
    return say(MOTHER, [{ text: 'Sleep, Yunseul-ah.', pose: 'idle', face: 'smile' }]);
  }
  if (reached(s, 'd1_market')) {
    return say(MOTHER, [{ text: 'Sell the fish to Master Gu, and come home before dark.', pose: 'talk', face: 'smile' }]);
  }
  return say(MOTHER, [{ text: 'Come home before the tide turns.', pose: 'happy', face: 'smile' }]);
}

// ---- Father ------------------------------------------------------------------

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
  if (s.step === 'd1_frog') {
    return script(FATHER, 'a', {
      a: {
        lines: [
          { text: 'Sit. The net can wait.', pose: 'mend_net', face: 'neutral' },
          { text: 'Once a frog lived at the bottom of a well. He thought the sky was a circle, exactly the size of the well\'s mouth.', pose: 'mend_net', face: 'neutral' },
          { text: 'One day a sea turtle told him the sky was wider than any well. The frog laughed at him.', pose: 'mend_net', face: 'watchful' },
        ],
        choices: [
          { label: 'Was the turtle lying?', next: 'turtle' },
          { label: '(Say nothing)', next: 'turtle' },
        ],
      },
      turtle: {
        lines: [
          { text: '...No. The frog just never climbed out.', pose: 'idle', face: 'watchful' },
          { text: 'Gu pays two coins. Maybe that\'s the sky. Maybe it\'s only the well.', pose: 'talk', face: 'restrain' },
          { text: "Go say goodnight to your mother.", pose: 'mend_net', face: 'smile' },
        ],
      },
    });
  }
  if (s.step === 'd1_dusk') {
    return say(FATHER, [{ text: 'Your mother first. Then come and sit with me.', pose: 'mend_net', face: 'neutral' }]);
  }
  if (s.step === 'd1_night' || s.step === 'd1_end') {
    return say(FATHER, [{ text: 'Sleep. The tide comes early.', pose: 'mend_net', face: 'neutral' }]);
  }
  if (reached(s, 'd1_market')) {
    return say(FATHER, [{ text: 'Gu will say two coins. He always says two coins.', pose: 'mend_net', face: 'neutral' }]);
  }
  return say(FATHER, [{ text: 'The river mouth. Past the gate. Mind the rocks.', pose: 'mend_net', face: 'neutral' }]);
}

// ---- the market ------------------------------------------------------------------

function sellableAt(buyer: Buyer, s: StoryState): number {
  return ITEM_IDS.reduce((n, id) => n + (priceAt(id, buyer, s) !== null ? s.bag[id] ?? 0 : 0), 0);
}

function guDialog(s: StoryState): DialogScript {
  const hasFish = sellableAt('gu', s) > 0;
  return script(GU, 'greet', {
    greet: {
      lines: hasFish
        ? [{ text: 'Mackerel, two coins each. Same as yesterday. Same as tomorrow.' }]
        : [{ text: 'No fish, no coins, boy. That is the whole business.' }],
      choices: [
        ...(hasFish ? [{ label: 'Sell fish', next: 'sell' }] : []),
        { label: 'Why only two?', next: 'why' },
        { label: 'Bye', next: 'bye' },
      ],
    },
    sell: { lines: [{ text: "Put them on the scale. Let's see what the sea gave you." }] },
    why: {
      lines: [
        { text: 'Two is the price. It was two yesterday. It will be two tomorrow.' },
        { text: 'Want it to be three? Go and ask the Governor. He holds the seal. I only hold the scale.' },
      ],
      choices: [
        ...(hasFish ? [{ label: 'Sell fish', next: 'sell' }] : []),
        { label: 'Bye', next: 'bye' },
      ],
    },
    bye: { lines: [{ text: 'Come back when the basket is full.' }] },
  });
}

function innkeeperDialog(s: StoryState): DialogScript {
  if (!innOpen(s)) {
    return script(INNKEEPER, 'a', {
      a: {
        lines: [
          { text: "Fresh mackerel? I'd pay four. But only a few, and only before noon." },
          { text: "The sun's already past the roof, lad. Come early tomorrow. And come by the back door." },
        ],
      },
    });
  }
  const left = innLeftToday(s);
  const hasFish = sellableAt('inn', s) > 0;
  return script(INNKEEPER, 'greet', {
    greet: {
      lines: [
        left > 0
          ? { text: `Fresh fish? Four coins. I can take ${left} more today.` }
          : { text: "That's all I can take today. My cook will kill me." },
      ],
      choices: [
        ...(left > 0 && hasFish ? [{ label: 'Sell fish', next: 'sell' }] : []),
        { label: 'Bye', next: 'bye' },
      ],
    },
    sell: { lines: [{ text: "Quick, before Gu's men see you." }] },
    bye: { lines: [{ text: 'Smart boy. Come again.' }] },
  });
}

function yeotDialog(s: StoryState): DialogScript {
  const price = ITEMS.yeot.buy ?? 1;
  const canPay = s.coins >= price;
  return script(YEOT_SELLER, 'greet', {
    greet: {
      lines: [
        { text: '*clack clack* Sweet yeot! Sticks to your teeth, sticks to your heart!' },
        { text: `${price === 1 ? 'One coin' : `${price} coins`} a piece!` },
      ],
      choices: canPay
        ? [
            { label: `Buy one (${price} coin${price === 1 ? '' : 's'})`, next: 'buy' },
            { label: 'No thanks', next: 'bye' },
          ]
        : [{ label: 'I have no coins', next: 'broke' }],
    },
    buy: { lines: [{ text: "There you go! Don't let it melt in your pocket." }] },
    broke: { lines: [{ text: 'No coin, no candy! Sell your fish to Master Gu first.' }] },
    bye: { lines: [{ text: '*clack clack* Your loss, lad!' }] },
  });
}

// ---- things Yunseul looks at --------------------------------------------------------------

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
  // ---- river mouth ----
  if (id === 'pier_end') {
    if (!reached(s, 'd1_river')) {
      return say(YUNSEUL, [{ text: 'The end of the pier. The water is so clear today.', face: 'smile' }]);
    }
    if (reached(s, 'd1_dusk')) {
      return say(YUNSEUL, [{ text: 'The sun is going down. The fish can wait until tomorrow.', face: 'neutral' }]);
    }
    const castChoices = [
      { label: 'Cast the line', next: 'cast' },
      { label: 'Not now', next: 'later' },
    ];
    const tail: DialogScript['nodes'] = {
      cast: { lines: [{ text: "Don't pull when it bites. Pull when it turns.", face: 'determined' }] },
      later: { lines: [{ text: 'The fish can wait a little.', face: 'neutral' }] },
    };
    if (s.energy <= 0) {
      return say(YUNSEUL, [{ text: 'My arms are done for today. Time to sell what I have.', face: 'worried' }]);
    }
    if (s.step === 'd1_river') {
      return script(YUNSEUL, 'a', {
        a: {
          lines: [
            { text: 'The end of the pier. Where the river meets the sea.', face: 'neutral' },
            { text: "Father's words: don't pull when it bites. Pull when it turns.", face: 'determined' },
          ],
          choices: castChoices,
        },
        ...tail,
      });
    }
    return script(YUNSEUL, 'a', {
      a: { lines: [{ text: s.flags.first_catch ? 'The tide is still good.' : "The end of the pier. Let's try.", face: 'smile' }], choices: castChoices },
      ...tail,
    });
  }
  if (id === 'basket') {
    return say(YUNSEUL, [
      fishInBag(s) > 0
        ? { text: 'Our fish basket. Not empty anymore!', face: 'smile' }
        : { text: "Father's old fish basket. Empty, for now.", face: 'neutral' },
    ]);
  }
  // ---- market ----
  if (id === 'gu') return guDialog(s);
  if (id === 'innkeeper') return innkeeperDialog(s);
  if (id === 'yeot_cart') return yeotDialog(s);
  if (id === 'rice_seller') {
    return say(RICE_SELLER, [
      { text: 'Thirty coins a sack. Up again.' },
      { text: "Blame the Governor's grain tax, not me." },
    ]);
  }
  if (id === 'rice_board') {
    return say(YUNSEUL, [
      { text: 'The rice price board. One small sack: 30 coins.', face: 'neutral' },
      { text: "Thirty... That's fifteen mackerel at Master Gu's price.", face: 'worried' },
      { text: 'Mother buys rice every week.', face: 'worried' },
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
  // ---- morning ----
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
  if (targetId === 'rice_jar' && nodeId === 'a' && !s.flags.looked_rice_jar) {
    setFlag('looked_rice_jar');
    addLedger('You looked into the rice jar. Lower than last week.');
  }
  // ---- fishing ----
  if (targetId === 'pier_end' && nodeId === 'a' && s.step === 'd1_river') {
    setFlag('reached_pier_end');
    setStep('d1_fish');
  }
  if (targetId === 'pier_end' && nodeId === 'cast' && canFishDirect(s)) pendingFishing = true;
  // ---- market ----
  if (targetId === 'gu' && nodeId === 'sell') pendingPanel = { kind: 'sell', buyer: 'gu' };
  if (targetId === 'gu' && nodeId === 'why') setFlag('asked_gu_price');
  if (targetId === 'innkeeper' && nodeId === 'a' && !s.flags.met_innkeeper) {
    setFlag('met_innkeeper');
    addLedger('The innkeeper pays four coins a fish, if you come before noon.');
  }
  if (targetId === 'innkeeper' && nodeId === 'sell') pendingPanel = { kind: 'sell', buyer: 'inn' };
  if (targetId === 'yeot_cart' && nodeId === 'buy') {
    const price = ITEMS.yeot.buy ?? 1;
    if (s.coins >= price) {
      addCoins(-price);
      addItem('yeot');
      setFlag('bought_yeot');
    }
  }
  if (targetId === 'rice_board' && nodeId === 'a' && !s.flags.read_rice_board) {
    setFlag('read_rice_board');
    addLedger('You read the rice board. Thirty coins a sack.');
  }
  // ---- dusk and night ----
  if (targetId === 'mother' && nodeId === 'give' && s.step === 'd1_dusk') pendingPanel = { kind: 'give', to: 'mother' };
  if (targetId === 'mother' && nodeId === 'market' && s.step === 'd1_dusk') setStep('d1_frog');
  if (targetId === 'father' && nodeId === 'turtle' && s.step === 'd1_frog') {
    setFlag('heard_frog_story');
    if (s.flags.ate_yeot && !s.flags.yeot_halves) addLedger('You ate the yeot. Father pretended not to care, but he did.');
    setStep('d1_night');
  }
  if (targetId === 'mother' && (nodeId === 'mother' || nodeId === 'night') && s.step === 'd1_night') {
    if (nodeId === 'mother') setFlag('asked_about_mother');
    setFlag('day1_done');
    setStep('d1_end');
  }
}

// ---- giving ------------------------------------------------------------------------

type Line = DialogScript['nodes'][string]['lines'][number];

const TASTE_LINES: Record<GiftTarget, Record<'love' | 'like' | 'neutral' | 'dislike', Line[]>> = {
  mother: {
    love: [{ text: 'Oh! This will make a fine soup tonight. You are a good son.', pose: 'happy', face: 'smile' }],
    like: [{ text: "Thank you, Yunseul-ah. I'll put it to good use.", pose: 'talk', face: 'smile' }],
    neutral: [{ text: 'For the house? Thank you.', pose: 'talk', face: 'neutral' }],
    dislike: [{ text: '...Yunseul-ah. Where did you even find this?', pose: 'shake_head', face: 'careful' }],
  },
  father: {
    love: [{ text: 'Now that is a fish. Well caught.', pose: 'talk', face: 'smile' }],
    like: [{ text: "Good. We'll dry it.", pose: 'mend_net', face: 'neutral' }],
    neutral: [{ text: 'Hm. Put it in the basket.', pose: 'mend_net', face: 'neutral' }],
    dislike: [{ text: 'Throw it back where you found it.', pose: 'mend_net', face: 'restrain' }],
  },
};

const giftFlag = (to: GiftTarget, day: number) => `gift_${to}_d${day}`;

/** What the give window can offer: bag items (not story items) + coins. */
export function givable(s: StoryState = getStory()): ItemId[] {
  return ITEM_IDS.filter((id) => (s.bag[id] ?? 0) > 0 && giftTaste(id, 'mother') !== null);
}

/** Has this person already had a gift today? (Coins don't count.) */
export function giftedToday(to: GiftTarget, s: StoryState = getStory()): boolean {
  return !!s.flags[giftFlag(to, s.day)];
}

/**
 * Give an item (or all your coins) to Mother or Father. Changes the save and returns the
 * reaction dialogue for App to open. One gift per person per day.
 */
export function giveTo(to: GiftTarget, what: ItemId | 'coins'): DialogScript {
  const s = getStory();
  const speaker = to === 'mother' ? MOTHER : FATHER;
  const afterDusk: Line[] =
    to === 'mother' && s.step === 'd1_dusk'
      ? [{ text: "Now go and sit with your father. He's been waiting for you.", pose: 'happy', face: 'smile' }]
      : [];
  const finish = () => {
    if (to === 'mother' && s.step === 'd1_dusk') setStep('d1_frog');
  };

  // ---- coins ----
  if (what === 'coins') {
    if (s.coins <= 0) return say(speaker, [{ text: 'Keep your empty hands warm, Yunseul-ah.', face: 'smile' }]);
    if (to === 'father') {
      return say(FATHER, [
        { text: 'Coins? Give them to your mother.', pose: 'mend_net', face: 'neutral' },
        { text: 'She knows where every coin goes. I only know where the fish go.', pose: 'mend_net', face: 'smile' },
      ]);
    }
    const back = s.coins > 2 ? 2 : 0;
    updateStory((st) => ({ ...st, coins: back }));
    setFlag('gave_coins_mother');
    addLedger('You gave your coins to Mother. She looked at them a second too long.');
    finish();
    return say(MOTHER, [
      { text: '...', pose: 'idle', face: 'careful' },
      { text: 'Thank you, Yunseul-ah.', pose: 'talk', face: 'wistful' },
      ...(back > 0
        ? [{ text: 'Here. Keep a little for yourself.', pose: 'talk', face: 'smile' } as Line]
        : [{ text: 'Keep a little for yourself next time.', pose: 'talk', face: 'smile' } as Line]),
      ...afterDusk,
    ]);
  }

  // ---- items ----
  if (giftedToday(to, s)) {
    return say(speaker, [
      to === 'mother'
        ? { text: 'You already gave me something today, Yunseul-ah. Keep the rest.', pose: 'talk', face: 'smile' }
        : { text: "One gift a day is plenty. Keep it.", pose: 'mend_net', face: 'neutral' },
    ]);
  }
  const taste = giftTaste(what, to);
  if (taste === null || !removeItem(what, 1)) {
    return say(speaker, [{ text: 'Hm? You have nothing like that.', face: 'neutral' }]);
  }
  setFlag(giftFlag(to, s.day));
  setFlag(`gave_${what}_${to}`);

  // The yeot scene from the bible: Mother breaks it in halves.
  if (what === 'yeot' && to === 'mother') {
    setFlag('yeot_halves');
    setEnergy(getStory().energy + 1);
    addLedger('You gave your yeot to Mother. She broke it in halves and kept hers.');
    finish();
    return say(MOTHER, [
      { text: 'For me?', pose: 'happy', face: 'smile' },
      { text: '*She laughs, breaks it in two, and gives you half.*', pose: 'hold_bowl', face: 'smile' },
      { text: 'Sweet things taste better in halves.', pose: 'talk', face: 'wistful' },
      ...afterDusk,
    ]);
  }
  if (what === 'yeot' && to === 'father') {
    return say(FATHER, [
      { text: 'For me? ...Hm.', pose: 'idle', face: 'watchful' },
      { text: 'Your mother likes these more than she says.', pose: 'mend_net', face: 'smile' },
    ]);
  }
  finish();
  return say(speaker, [
    { text: `*You give ${to === 'mother' ? 'Mother' : 'Father'} ${withArticle(what)}.*`, face: 'neutral' },
    ...TASTE_LINES[to][taste],
    ...afterDusk,
  ]);
}
