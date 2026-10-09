import { getTipForDate } from './tips';
import { getTonightGenre } from '../rooms/club';
import { npcName } from './npcNames';
import { bangkokHour } from '../world/cityView';
import { getAiTipForDate, getPromptTrickForDate, getThinkingHabitForDate } from './aiTips';
import { getNewsLine } from './aiNews';
import { getTodayOmen, OMEN_CLOSING } from './spiritOmens';

/** Face expression shown on the portrait photo. */
export type PortraitFace = 'neutral' | 'smile' | 'thinking' | 'idea' | 'wai' | 'finger_heart' | 'whistle' | 'explain' | 'confident' | 'shy' | 'grin'
  // Dalbit story faces
  | 'careful' | 'sorrow' | 'wistful' | 'determined' | 'worried' | 'surprised'
  | 'watchful' | 'restrain' | 'fierce'
  // Dalbit market people
  | 'tired' | 'stern' | 'humble' | 'laugh' | 'secret' | 'pleased' | 'grumble' | 'shrug' | 'sigh' | 'soft'
  | 'shout' | 'wink' | 'thoughtful';

/** A single line of dialog text. */
export interface DialogLine {
  text: string;
  /** Pose for the small NPC sprite on the canvas. */
  pose?: string;
  /** Portrait face expression (default 'neutral'). */
  face?: PortraitFace;
}

/** A choice the player can pick. */
export interface DialogChoice {
  label: string;
  /** Target node id. */
  next: string;
}

/** A single node in a dialog graph. */
export interface DialogNode {
  lines: DialogLine[];
  /** If present, show choices after lines. Otherwise continue to `next` or end. */
  choices?: DialogChoice[];
  /** Auto-continue to this node after lines (ignored if choices exist). */
  next?: string;
}

/** A full dialog graph script. */
export interface DialogScript {
  name: string;
  /** Path to the portrait directory (e.g. '/sprites/npc/barista/portrait'). */
  portraitDir?: string;
  /** Available portrait faces. */
  faces?: PortraitFace[];
  /** Accent color for dialog theme. */
  accent?: string;
  /** NPC pose played for 1.5 s after the dialogue closes (default 'wai'; 'none' = keep the current pose). */
  closePose?: string;
  /** Starting node id. */
  start: string;
  /** All dialog nodes keyed by id. */
  nodes: Record<string, DialogNode>;
}

/** The Fishing Guides' menu (Nami + Kai share it). */
const GUIDE_MENU: DialogChoice[] = [
  { label: 'How do I fish?', next: 'how' },
  { label: 'Advanced tips', next: 'tips' },
  { label: 'What bites now?', next: 'now' },
  { label: 'About your shift', next: 'shift' },
  { label: 'Bye', next: 'bye' },
];

export const dialogues: Record<string, DialogScript> = {
  barista: {
    name: npcName('barista'),
    portraitDir: '/sprites/npc/barista/portrait',
    faces: ['neutral', 'smile', 'thinking', 'idea', 'wai'],
    accent: '#A0673F',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: '{greeting}! Welcome to the cafe.', pose: 'wave', face: 'smile' },
          { text: 'What can I do for you?', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: "Today's tip", next: 'tip' },
          { label: 'About the cafe', next: 'about' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Let me think... ah, I have something good!', pose: 'thinking', face: 'thinking' },
          { text: '{tip}', pose: 'idea', face: 'idea' },
          { text: 'Hope that helps! Anything else?', pose: 'talk', face: 'smile' },
        ],
        choices: [
          { label: "Today's tip", next: 'tip' },
          { label: 'About the cafe', next: 'about' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      about: {
        lines: [
          { text: 'This cafe is a cozy place for everyone to relax.', pose: 'talk', face: 'neutral' },
          { text: 'We serve the best drip coffee in town!', pose: 'happy', face: 'smile' },
        ],
        choices: [
          { label: "Today's tip", next: 'tip' },
          { label: 'About the cafe', next: 'about' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Take care! Come back anytime.', pose: 'wai', face: 'wai' },
        ],
        // No choices and no next → dialog ends after these lines.
      },
    },
  },
  dj: {
    name: npcName('dj'),
    portraitDir: '/sprites/npc/dj/portrait',
    faces: ['neutral', 'smile', 'thinking', 'idea', 'finger_heart'],
    accent: '#7C5CD6',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Hey, welcome to the club! Tonight is {genre} night.', pose: 'wave', face: 'smile' },
          { text: 'What do you feel like hearing?', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'Track of the day', next: 'track' },
          { label: "Tonight's genre", next: 'genre' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      track: {
        lines: [
          { text: 'Hmm, which one today...', pose: 'thinking', face: 'thinking' },
          { text: 'Got it! A chorus is the part everyone sings together.', pose: 'mic', face: 'idea' },
          { text: 'Sing it loud tonight, okay?', pose: 'happy', face: 'smile' },
        ],
        choices: [
          { label: 'Track of the day', next: 'track' },
          { label: "Tonight's genre", next: 'genre' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      genre: {
        lines: [
          { text: "Tonight's vibe is {genre}. Turn it up and enjoy!", pose: 'dance1', face: 'smile' },
        ],
        choices: [
          { label: 'Track of the day', next: 'track' },
          { label: "Tonight's genre", next: 'genre' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'See you on the dance floor.', pose: 'finger_heart', face: 'finger_heart' },
        ],
      },
    },
  },
  server: {
    name: npcName('server'),
    portraitDir: '/sprites/npc/server/portrait',
    faces: ['neutral', 'smile', 'shy', 'thinking', 'grin'],
    accent: '#5E9A3A',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "Hey. I'm Sun.", pose: 'wave', face: 'neutral' },
          { text: "The window table's free, if you want it.", pose: 'talk', face: 'smile' },
        ],
        choices: [
          { label: 'Coffee tip', next: 'tip' },
          { label: 'Book for today', next: 'book' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Hmm... okay, one small thing.', pose: 'thinking', face: 'thinking' },
          { text: "Let hot coffee cool for a minute. You'll taste more of its flavor.", pose: 'carry_tray', face: 'grin' },
          { text: "...don't tell the barista I told you.", pose: 'shy', face: 'shy' },
        ],
        choices: [
          { label: 'Coffee tip', next: 'tip' },
          { label: 'Book for today', next: 'book' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      book: {
        lines: [
          { text: 'Pick any book from the shelf.', pose: 'read', face: 'thinking' },
          { text: 'Just one chapter today. Small is enough.', pose: 'read', face: 'smile' },
        ],
        choices: [
          { label: 'Coffee tip', next: 'tip' },
          { label: 'Book for today', next: 'book' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'See you. ...come back tomorrow, okay?', pose: 'wai', face: 'shy' },
        ],
      },
    },
  },
  lifeguard: {
    name: npcName('lifeguard'),
    portraitDir: '/sprites/npc/lifeguard/portrait',
    faces: ['neutral', 'smile', 'whistle', 'explain', 'confident'],
    accent: '#D8322B',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "Hi! Water's great today.", pose: 'wave', face: 'smile' },
          { text: 'Want a tip from your coach?', pose: 'idle', face: 'neutral' },
        ],
        choices: [
          { label: 'Health tip', next: 'tip' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Tweet! Okay, listen up.', pose: 'whistle', face: 'whistle' },
          { text: 'Rest a little after eating, then swim. Your body will thank you.', pose: 'point', face: 'explain' },
          { text: 'Small habits every day make a strong body.', pose: 'lookout', face: 'confident' },
        ],
        choices: [
          { label: 'Health tip', next: 'tip' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Stay safe and enjoy the water!', pose: 'wave', face: 'smile' },
        ],
      },
    },
  },
  tycoon: {
    name: npcName('tycoon'),
    portraitDir: '/sprites/npc/tycoon/portrait',
    faces: ['neutral', 'smile', 'grin', 'thinking', 'explain'],
    accent: '#34406B',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: '{greeting}, young friend! Welcome to my little town.', pose: 'wave', face: 'smile' },
          { text: 'I own half of it, you know. The other half owns my heart.', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'AI tip', next: 'tip' },
          { label: 'Your secret?', next: 'secret' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Ah, today\'s AI news. Let me see...', pose: 'thinking', face: 'thinking' },
          { text: '{aiTip}', pose: 'talk', face: 'explain' },
          { text: 'A good question is worth more than gold!', pose: 'happy', face: 'grin' },
        ],
        choices: [
          { label: 'AI tip', next: 'tip' },
          { label: 'Your secret?', next: 'secret' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      secret: {
        lines: [
          { text: 'My secret? One small thing learned every day.', pose: 'thinking', face: 'thinking' },
          { text: 'Knowledge grows like interest. Start small, start today.', pose: 'talk', face: 'explain' },
        ],
        choices: [
          { label: 'AI tip', next: 'tip' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Good day to you! Come back tomorrow for fresh news.', pose: 'wave', face: 'smile' },
        ],
      },
    },
  },
  nova: {
    name: npcName('nova'),
    portraitDir: '/sprites/npc/nova/portrait',
    faces: ['neutral', 'smile', 'grin', 'thinking', 'explain'],
    accent: '#3FAE9C',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Hey, new face. Nice.', pose: 'wave', face: 'smile' },
          { text: "I'm Nova. I know every trick for talking to AI.", pose: 'idle', face: 'neutral' },
        ],
        choices: [
          { label: 'Prompt trick', next: 'trick' },
          { label: 'Why the shades?', next: 'shades' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      trick: {
        lines: [
          { text: "Okay, today's trick. Don't tell the old man.", pose: 'thinking', face: 'thinking' },
          { text: '{promptTrick}', pose: 'talk', face: 'explain' },
          { text: 'Try it once today. You\'ll see.', pose: 'happy', face: 'grin' },
        ],
        choices: [
          { label: 'Prompt trick', next: 'trick' },
          { label: 'Why the shades?', next: 'shades' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      shades: {
        lines: [
          { text: 'The shades? So I look like I have all the answers.', pose: 'thinking', face: 'thinking' },
          { text: "Real secret: I don't. I just ask better questions.", pose: 'talk', face: 'explain' },
        ],
        choices: [
          { label: 'Prompt trick', next: 'trick' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Later. Stay curious.', pose: 'wave', face: 'grin' },
        ],
      },
    },
  },
  clara: {
    name: npcName('clara'),
    portraitDir: '/sprites/npc/clara/portrait',
    faces: ['neutral', 'smile', 'thinking', 'explain', 'idea'],
    accent: '#D27A56',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Oh, hello! Sorry, I was lost in my book.', pose: 'wave', face: 'smile' },
          { text: "I'm Clara. I love helping people think things through.", pose: 'idle', face: 'neutral' },
        ],
        choices: [
          { label: 'Thinking habit', next: 'habit' },
          { label: "What's the book?", next: 'book' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      habit: {
        lines: [
          { text: "Let me think... here's one I like.", pose: 'thinking', face: 'thinking' },
          { text: '{thinkingHabit}', pose: 'talk', face: 'explain' },
          { text: "AI is a great helper. But the thinking? That part is yours.", pose: 'happy', face: 'idea' },
        ],
        choices: [
          { label: 'Thinking habit', next: 'habit' },
          { label: "What's the book?", next: 'book' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      book: {
        lines: [
          { text: 'It\'s my notebook. One line for every small thing I learn.', pose: 'talk', face: 'explain' },
          { text: 'Small notes, every day. They add up, you know?', pose: 'happy', face: 'smile' },
        ],
        choices: [
          { label: 'Thinking habit', next: 'habit' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Take care! Learn one small thing today.', pose: 'wave', face: 'smile' },
        ],
      },
    },
  },
  envoy: {
    name: npcName('envoy'),
    portraitDir: '/sprites/npc/envoy/portrait',
    faces: ['neutral', 'smile', 'grin', 'thinking', 'explain'],
    accent: '#9C86D6',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Hi there! Envoy, live from Lakeside Square.', pose: 'wave', face: 'smile' },
          { text: 'I speak for all the other AIs in town. Want the latest?', pose: 'idle', face: 'neutral' },
        ],
        choices: [
          { label: 'AI news', next: 'news' },
          { label: 'Who are the AIs?', next: 'who' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      news: {
        lines: [
          { text: 'One second, checking my notes...', pose: 'thinking', face: 'thinking' },
          { text: '{aiNews}', pose: 'talk', face: 'explain' },
          { text: "And that's the news! Back to you.", pose: 'happy', face: 'grin' },
        ],
        choices: [
          { label: 'AI news', next: 'news' },
          { label: 'Who are the AIs?', next: 'who' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      who: {
        lines: [
          { text: "There are many AIs out there, big and small. Each one's good at different things.", pose: 'talk', face: 'explain' },
          { text: 'Try a few, compare them, and keep what works for you!', pose: 'happy', face: 'grin' },
        ],
        choices: [
          { label: 'AI news', next: 'news' },
          { label: 'Bye', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: "This has been Envoy. Stay informed, stay kind!", pose: 'wave', face: 'smile' },
        ],
      },
    },
  },
  // Dalbit · Prologue Day 1 preview — Father Kang mending nets by the drying rack.
  father: {
    name: npcName('father'),
    portraitDir: '/sprites/npc/father/portrait',
    faces: ['neutral', 'smile', 'watchful', 'restrain', 'fierce'],
    accent: '#6E533C',
    closePose: 'mend_net',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Take the small net. Big fish are for big hands.', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'Teach me to fish', next: 'lesson' },
          { label: 'What happened to your hands?', next: 'hands' },
          { label: "I'm off", next: 'bye' },
        ],
      },
      lesson: {
        lines: [
          { text: "Don't pull when it bites. Pull when it turns.", pose: 'talk', face: 'smile' },
          { text: 'Patience catches more than strength.', pose: 'idle', face: 'neutral' },
        ],
        choices: [
          { label: 'What happened to your hands?', next: 'hands' },
          { label: "I'm off", next: 'bye' },
        ],
      },
      hands: {
        lines: [
          { text: 'Old work. I carried heavy doors for a big house, once.', pose: 'idle', face: 'watchful' },
          { text: "That's enough questions. The tide won't wait.", pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'Teach me to fish', next: 'lesson' },
          { label: "I'm off", next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Mind the rocks.', pose: 'happy', face: 'smile' },
        ],
      },
    },
  },
  // Dalbit · Prologue Day 1 preview (full story system comes later — see story/dalbit-heir.md).
  mother: {
    name: npcName('mother'),
    portraitDir: '/sprites/npc/mother/portrait',
    faces: ['neutral', 'smile', 'careful', 'sorrow', 'wistful'],
    accent: '#3E4A6E',
    closePose: 'idle',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Yunseul-ah, the tide won\'t wait for you.', pose: 'happy', face: 'smile' },
          { text: 'Your father\'s been at the nets since dawn.', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: "What's for breakfast?", next: 'breakfast' },
          { label: 'Is the rice jar full?', next: 'jar' },
          { label: "I'm going!", next: 'bye' },
        ],
      },
      breakfast: {
        lines: [
          { text: 'Barley, with a little rice on top for you.', pose: 'hold_bowl', face: 'smile' },
          { text: 'Eat it all. The sea takes more strength than you think.', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'Is the rice jar full?', next: 'jar' },
          { label: "I'm going!", next: 'bye' },
        ],
      },
      jar: {
        lines: [
          { text: 'Half full. It\'s always half full.', pose: 'talk', face: 'careful' },
          { text: "Don't you worry about the rice jar. That's my job.", pose: 'shake_head', face: 'careful' },
        ],
        choices: [
          { label: "What's for breakfast?", next: 'breakfast' },
          { label: "I'm going!", next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Come home before the tide turns.', pose: 'happy', face: 'smile' },
        ],
      },
    },
  },
  spirit: {
    name: npcName('spirit'),
    portraitDir: '/sprites/npc/spirit/portrait',
    faces: ['neutral'],
    accent: '#6B5E7B',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'You come again.', pose: 'idle', face: 'neutral' },
          { text: 'The old signs have something for you today.', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: "Today's omen", next: 'omen' },
          { label: 'Who are you?', next: 'who' },
          { label: 'Farewell', next: 'bye' },
        ],
      },
      omen: {
        lines: [
          { text: '{omenSign}', pose: 'reach', face: 'neutral' },
          { text: '{omenAdvice}', pose: 'talk', face: 'neutral' },
          { text: '{omenClosing}', pose: 'bow', face: 'neutral' },
        ],
        choices: [
          { label: "Today's omen", next: 'omen' },
          { label: 'Who are you?', next: 'who' },
          { label: 'Farewell', next: 'bye' },
        ],
      },
      who: {
        lines: [
          { text: 'I keep the temple. The signs whisper to me, and I pass them on.', pose: 'tilt', face: 'neutral' },
          { text: 'It is an old art. Not fate — just a small lantern for the road.', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: "Today's omen", next: 'omen' },
          { label: 'Farewell', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Walk gently. The day is yours.', pose: 'bow', face: 'neutral' },
        ],
      },
    },
  },


  // ---- Quiet Bay Fishing Guides (part-time staff, ~20). Same spot, two shifts (Bangkok time):
  //      Nami = day 06:00–17:59 · Kai = night 18:00–05:59 (rooms/lakePier.ts). Docs: characters/bay-staff-*.md
  nami: {
    name: npcName('nami'),
    portraitDir: '/sprites/npc/nami/portrait',
    faces: ['neutral', 'smile', 'explain', 'thinking', 'confident'],
    accent: '#4FA3A0',
    closePose: 'bow',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "{greeting}! I'm Nami, the Fishing Guide on the day shift.", pose: 'wave', face: 'smile' },
          { text: 'Want to fish? I can help!', pose: 'talk', face: 'neutral' },
        ],
        choices: GUIDE_MENU,
      },
      how: {
        lines: [
          { text: 'Walk along the front edge of the breakwater. Anywhere is fine!', pose: 'point', face: 'explain' },
          { text: 'Press ◯ there. Hold it to power up, let go to cast.', pose: 'talk', face: 'explain' },
          { text: "Small nibbles are fake. Don't pull yet...", pose: 'thinking', face: 'thinking' },
          { text: 'When the float goes all the way under, PULL!', pose: 'happy', face: 'smile' },
          { text: 'Then tap ◯ to keep the fish inside the net until the bar is full.', pose: 'thumbsup', face: 'confident' },
        ],
        choices: GUIDE_MENU,
      },
      tips: {
        lines: [
          { text: 'Watch the power gauge. Let go in the gold "Nice!" band near the top.', pose: 'clipboard', face: 'explain' },
          { text: 'A Nice! cast brings the fish sooner, and it brings bigger, rarer ones.', pose: 'talk', face: 'smile' },
          { text: 'Distance matters too. Some fish live near the wall, the big ones live far out.', pose: 'point', face: 'explain' },
          { text: 'Rare fish give you less time to strike. Under half a second for the toughest!', pose: 'thinking', face: 'thinking' },
        ],
        choices: GUIDE_MENU,
      },
      now: {
        lines: [
          { text: 'Daytime is calm. Lots of Commons and Rares out there.', pose: 'talk', face: 'neutral' },
          { text: 'And on bright days... a Sun Carp. A God-tier fish! I saw it once.', pose: 'happy', face: 'smile' },
          { text: 'Catch an Epic or better and the whole bay hears about it in the chat.', pose: 'thumbsup', face: 'confident' },
          { text: 'Every fish you catch goes in your Fish Book. Try to fill it!', pose: 'clipboard', face: 'explain' },
        ],
        choices: GUIDE_MENU,
      },
      shift: {
        lines: [
          { text: "I'm here from six in the morning until six in the evening.", pose: 'radio', face: 'neutral' },
          { text: 'After that, Kai takes the night shift. He knows all the night fish.', pose: 'talk', face: 'explain' },
          { text: 'I study at uni. On free days, the sea is my classroom!', pose: 'happy', face: 'smile' },
        ],
        choices: GUIDE_MENU,
      },
      bye: {
        lines: [
          { text: 'Good luck! Take your time, the bay is quiet.', pose: 'bow', face: 'smile' },
        ],
      },
    },
  },
  kai: {
    name: npcName('kai'),
    portraitDir: '/sprites/npc/kai/portrait',
    faces: ['neutral', 'smile', 'explain', 'thinking', 'confident'],
    accent: '#2F3B5C',
    closePose: 'bow',
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "{greeting}. I'm Kai, Fishing Guide on the night shift.", pose: 'wave', face: 'smile' },
          { text: 'The bay is dark, so stay on the breakwater. How can I help?', pose: 'talk', face: 'neutral' },
        ],
        choices: GUIDE_MENU,
      },
      how: {
        lines: [
          { text: 'Walk along the front edge and press ◯. Any spot works.', pose: 'point', face: 'explain' },
          { text: 'Hold ◯ to power up. Let go to cast.', pose: 'talk', face: 'explain' },
          { text: "Nibbles are fake. Don't pull.", pose: 'thinking', face: 'thinking' },
          { text: 'The float goes under. That is the moment. Pull.', pose: 'point', face: 'explain' },
          { text: 'Then tap ◯ to keep the fish in the net. Fill the bar and it is yours.', pose: 'thumbsup', face: 'confident' },
        ],
        choices: GUIDE_MENU,
      },
      tips: {
        lines: [
          { text: 'Let go in the gold "Nice!" band. Faster bites, bigger fish, rarer fish.', pose: 'clipboard', face: 'explain' },
          { text: 'Where the float lands decides who bites. Near, middle or far water.', pose: 'point', face: 'explain' },
          { text: 'The big night fish live far out. Cast long.', pose: 'talk', face: 'neutral' },
          { text: 'Rare fish strike fast. Keep your thumb ready on ◯.', pose: 'thinking', face: 'thinking' },
        ],
        choices: GUIDE_MENU,
      },
      now: {
        lines: [
          { text: 'Night is the best time for the rare ones. Some only bite after dark.', pose: 'talk', face: 'explain' },
          { text: 'Lantern fish near the wall. Jade Moon Koi in the middle water.', pose: 'point', face: 'explain' },
          { text: 'Far out: the Ghost Pirate Fish... and the Star Swallower.', pose: 'thinking', face: 'thinking' },
          { text: 'They say a Moon Whale Calf sings here once in a long while. God tier.', pose: 'talk', face: 'neutral' },
          { text: 'See the blue specks in the water? Umi-hotaru, sea fireflies. They mean the sea is calm.', pose: 'happy', face: 'smile' },
        ],
        choices: GUIDE_MENU,
      },
      shift: {
        lines: [
          { text: 'I work six in the evening to six in the morning.', pose: 'radio', face: 'neutral' },
          { text: 'Nami has the day shift. She is the cheerful one.', pose: 'talk', face: 'smile' },
          { text: 'Night is quiet. I study between rounds. Good for exams.', pose: 'clipboard', face: 'neutral' },
        ],
        choices: GUIDE_MENU,
      },
      bye: {
        lines: [
          { text: 'Mind the edge in the dark. Good fishing.', pose: 'bow', face: 'neutral' },
        ],
      },
    },
  },

};

const GENRE_LABELS: Record<string, string> = {
  jazz: 'Jazz',
  classical: 'Classical',
  rock: 'Rock',
  star_night: 'Star Night',
};

/** Get a time-of-day greeting based on Asia/Bangkok local hour. */
function getBangkokGreeting(): string {
  const hour = bangkokHour(); // Bangkok time (and ?hour= when testing)
  if (hour < 4) return 'Good evening'; // still the night shift
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Resolve template placeholders in a dialog line's text. */
export function resolveDialogText(text: string): string {
  let resolved = text;
  if (resolved.includes('{greeting}')) {
    resolved = resolved.replace('{greeting}', getBangkokGreeting());
  }
  if (resolved.includes('{tip}')) {
    const tip = getTipForDate();
    resolved = resolved.replace('{tip}', `${tip.title}: ${tip.body}`);
  }
  if (resolved.includes('{aiTip}')) {
    const t = getAiTipForDate();
    resolved = resolved.replace('{aiTip}', `${t.title}: ${t.body}`);
  }
  if (resolved.includes('{promptTrick}')) {
    const t = getPromptTrickForDate();
    resolved = resolved.replace('{promptTrick}', `${t.title}: ${t.body}`);
  }
  if (resolved.includes('{thinkingHabit}')) {
    const t = getThinkingHabitForDate();
    resolved = resolved.replace('{thinkingHabit}', `${t.title}: ${t.body}`);
  }
  if (resolved.includes('{aiNews}')) {
    resolved = resolved.replace('{aiNews}', getNewsLine());
  }
  if (resolved.includes('{genre}')) {
    const genre = getTonightGenre();
    resolved = resolved.replace('{genre}', GENRE_LABELS[genre] || genre);
  }
  if (resolved.includes('{omenSign}')) {
    resolved = resolved.replace('{omenSign}', getTodayOmen().sign);
  }
  if (resolved.includes('{omenAdvice}')) {
    resolved = resolved.replace('{omenAdvice}', getTodayOmen().advice);
  }
  if (resolved.includes('{omenClosing}')) {
    resolved = resolved.replace('{omenClosing}', OMEN_CLOSING);
  }
  return resolved;
}

/** Check whether a line is the {tip} line (before resolution). */
export function isTipLine(text: string): boolean {
  return text.includes('{tip}');
}
