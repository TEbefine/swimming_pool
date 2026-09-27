// The Envoy's AI news desk. YOU edit this list — she only reports what is written here,
// so the news is always true. Add the newest item at the TOP. Keep each line short (2 sentences).
//
// Example:
//   { date: '2026-10-01', headline: 'New model released', body: 'Company X released model Y today. It can read images and text.' },
//
// If no item is newer than NEWS_FRESH_DAYS, she shares an AI word of the day instead.

export interface AiNewsItem {
  /** YYYY-MM-DD (Bangkok date the news came out) */
  date: string;
  headline: string;
  body: string;
}

export const AI_NEWS: AiNewsItem[] = [];

export const NEWS_FRESH_DAYS = 14;

export interface AiWord {
  word: string;
  meaning: string;
}

/** Evergreen AI glossary for slow news days. */
export const AI_WORDS: AiWord[] = [
  { word: 'LLM', meaning: 'Large Language Model: an AI trained on huge amounts of text to understand and write language.' },
  { word: 'Prompt', meaning: 'The instruction or question you give an AI.' },
  { word: 'Token', meaning: 'A small chunk of text, often part of a word. Language models read and write in tokens.' },
  { word: 'Context window', meaning: 'How much text a model can look at in one go, like its short-term memory.' },
  { word: 'Hallucination', meaning: 'When an AI states something false as if it were true. Always check!' },
  { word: 'Training data', meaning: 'The examples an AI learned from before you ever talked to it.' },
  { word: 'Fine-tuning', meaning: 'Extra training on a small, focused set of examples so a model gets good at one job.' },
  { word: 'Multimodal', meaning: 'An AI that works with more than one kind of input, like text, images or sound.' },
  { word: 'AI agent', meaning: 'An AI that can plan steps and use tools to finish a task, not just answer a question.' },
  { word: 'Open-weight model', meaning: 'A model whose trained weights are published, so anyone can run it on their own computer.' },
  { word: 'Bias', meaning: 'When an AI leans unfairly one way because of patterns in its training data.' },
  { word: 'Embedding', meaning: 'A list of numbers that captures the meaning of text, so computers can compare ideas.' },
  { word: 'Guardrails', meaning: 'Rules and checks that keep an AI\'s behavior safe and on track.' },
  { word: 'Inference', meaning: 'The moment a trained model is actually used to answer you.' },
];

function bangkokDay(now: Date): number {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  return Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86_400_000);
}

/** Newest news item that is still fresh, or null. */
export function getFreshNews(now: Date = new Date()): AiNewsItem | null {
  const today = bangkokDay(now);
  const fresh = AI_NEWS
    .filter((n) => {
      const d = Math.floor(Date.parse(n.date + 'T00:00:00Z') / 86_400_000);
      return !Number.isNaN(d) && today - d >= 0 && today - d <= NEWS_FRESH_DAYS;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return fresh[0] ?? null;
}

/** Same word for everyone all day, offset from the other daily lists. */
export function getAiWordForDate(now: Date = new Date()): AiWord {
  const day = bangkokDay(now) + 3;
  return AI_WORDS[((day % AI_WORDS.length) + AI_WORDS.length) % AI_WORDS.length];
}

/** Text for the {aiNews} line. */
export function getNewsLine(now: Date = new Date()): string {
  const n = getFreshNews(now);
  if (n) return `BREAKING: ${n.headline}. ${n.body}`;
  const w = getAiWordForDate(now);
  return `Slow news day, so here's the AI word of the day: ${w.word}. ${w.meaning}`;
}
