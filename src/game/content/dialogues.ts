import { getTipForDate } from './tips';

/** Face expression shown on the portrait photo. */
export type PortraitFace = 'neutral' | 'smile' | 'thinking' | 'idea' | 'wai';

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
  portraitDir: string;
  /** Available portrait faces. */
  faces: PortraitFace[];
  /** Starting node id. */
  start: string;
  /** All dialog nodes keyed by id. */
  nodes: Record<string, DialogNode>;
}

export const dialogues: Record<string, DialogScript> = {
  barista: {
    name: 'Barista',
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
  return resolved;
}

/** Check whether a line is the {tip} line (before resolution). */
export function isTipLine(text: string): boolean {
  return text.includes('{tip}');
}
