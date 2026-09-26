import { getTipForDate } from './tips';

export interface DialogLine {
  text: string;
  pose?: string;
}

export interface DialogScript {
  name: string;
  lines: DialogLine[];
}

export const dialogues: Record<string, DialogScript> = {
  barista: {
    name: 'Barista',
    lines: [
      { text: '{greeting}! Welcome to the café ☕', pose: 'wave' },
      { text: 'Here is today\'s little lesson:', pose: 'talk' },
      { text: '{tip}', pose: 'idea' },
      { text: 'Take it easy today. See you tomorrow!', pose: 'wai' },
    ],
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
