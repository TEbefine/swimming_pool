import { getTipForDate } from './tips';
import { getTonightGenre } from '../rooms/club';
import { npcName } from './npcNames';

/** Face expression shown on the portrait photo. */
export type PortraitFace = 'neutral' | 'smile' | 'thinking' | 'idea' | 'wai' | 'finger_heart' | 'whistle' | 'explain' | 'confident' | 'shy' | 'grin';

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
  /** Starting node id. */
  start: string;
  /** All dialog nodes keyed by id. */
  nodes: Record<string, DialogNode>;
}

export const dialogues: Record<string, DialogScript> = {
  barista: {
    name: npcName('barista'),
    portraitDir: '/sprites/npc/barista/portrait',
    faces: ['neutral', 'smile', 'thinking', 'idea', 'wai'],
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: '{greeting}! Welcome to the cafe.', pose: 'wave', face: 'smile' },
          { text: 'What can I do for you?', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: "TODAY'S TIP", next: 'tip' },
          { label: 'ABOUT THE CAFE', next: 'about' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Let me think... ah, I have something good!', pose: 'thinking', face: 'thinking' },
          { text: '{tip}', pose: 'idea', face: 'idea' },
          { text: 'Hope that helps! Anything else?', pose: 'talk', face: 'smile' },
        ],
        choices: [
          { label: "TODAY'S TIP", next: 'tip' },
          { label: 'ABOUT THE CAFE', next: 'about' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      about: {
        lines: [
          { text: 'This cafe is a cozy place for everyone to relax.', pose: 'talk', face: 'neutral' },
          { text: 'We serve the best drip coffee in town!', pose: 'happy', face: 'smile' },
        ],
        choices: [
          { label: "TODAY'S TIP", next: 'tip' },
          { label: 'ABOUT THE CAFE', next: 'about' },
          { label: 'BYE', next: 'bye' },
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
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: 'Hey, welcome to the club! Tonight is {genre} night.', pose: 'wave', face: 'smile' },
          { text: 'What do you feel like hearing?', pose: 'talk', face: 'neutral' },
        ],
        choices: [
          { label: 'TRACK OF THE DAY', next: 'track' },
          { label: "TONIGHT'S GENRE", next: 'genre' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      track: {
        lines: [
          { text: 'Hmm, which one today...', pose: 'thinking', face: 'thinking' },
          { text: 'Got it! A chorus is the part everyone sings together.', pose: 'mic', face: 'idea' },
          { text: 'Sing it loud tonight, okay?', pose: 'happy', face: 'smile' },
        ],
        choices: [
          { label: 'TRACK OF THE DAY', next: 'track' },
          { label: "TONIGHT'S GENRE", next: 'genre' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      genre: {
        lines: [
          { text: "Tonight's vibe is {genre}. Turn it up and enjoy!", pose: 'dance1', face: 'smile' },
        ],
        choices: [
          { label: 'TRACK OF THE DAY', next: 'track' },
          { label: "TONIGHT'S GENRE", next: 'genre' },
          { label: 'BYE', next: 'bye' },
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
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "Hey. I'm Sun.", pose: 'wave', face: 'neutral' },
          { text: "The window table's free, if you want it.", pose: 'talk', face: 'smile' },
        ],
        choices: [
          { label: 'COFFEE TIP', next: 'tip' },
          { label: 'BOOK FOR TODAY', next: 'book' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Hmm... okay, one small thing.', pose: 'thinking', face: 'thinking' },
          { text: "Let hot coffee cool for a minute. You'll taste more of its flavor.", pose: 'carry_tray', face: 'grin' },
          { text: "...don't tell the barista I told you.", pose: 'shy', face: 'shy' },
        ],
        choices: [
          { label: 'COFFEE TIP', next: 'tip' },
          { label: 'BOOK FOR TODAY', next: 'book' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      book: {
        lines: [
          { text: 'Pick any book from the shelf.', pose: 'read', face: 'thinking' },
          { text: 'Just one chapter today. Small is enough.', pose: 'read', face: 'smile' },
        ],
        choices: [
          { label: 'COFFEE TIP', next: 'tip' },
          { label: 'BOOK FOR TODAY', next: 'book' },
          { label: 'BYE', next: 'bye' },
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
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          { text: "Hi! Water's great today.", pose: 'wave', face: 'smile' },
          { text: 'Want a tip from your coach?', pose: 'idle', face: 'neutral' },
        ],
        choices: [
          { label: 'HEALTH TIP', next: 'tip' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      tip: {
        lines: [
          { text: 'Tweet! Okay, listen up.', pose: 'whistle', face: 'whistle' },
          { text: 'Rest a little after eating, then swim. Your body will thank you.', pose: 'point', face: 'explain' },
          { text: 'Small habits every day make a strong body.', pose: 'lookout', face: 'confident' },
        ],
        choices: [
          { label: 'HEALTH TIP', next: 'tip' },
          { label: 'BYE', next: 'bye' },
        ],
      },
      bye: {
        lines: [
          { text: 'Stay safe and enjoy the water!', pose: 'wave', face: 'smile' },
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
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Bangkok' })
      .format(new Date()),
    10
  );
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
  if (resolved.includes('{genre}')) {
    const genre = getTonightGenre();
    resolved = resolved.replace('{genre}', GENRE_LABELS[genre] || genre);
  }
  return resolved;
}

/** Check whether a line is the {tip} line (before resolution). */
export function isTipLine(text: string): boolean {
  return text.includes('{tip}');
}
