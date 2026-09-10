/** Shared motivational quotes for the My Day overview. */

export interface DayQuote {
  text: string;
  author: string;
}

export const DAY_QUOTES: DayQuote[] = [
  { text: "Discipline today creates freedom tomorrow.", author: "Unknown" },
  { text: "Small steps lead to big results.", author: "Learnbook" },
  { text: "Small steps every day create big results.", author: "Learnbook" },
  { text: "A better version of you is waiting. Keep learning!", author: "Learnbook" },
  { text: "You can do it! Stay consistent.", author: "Learnbook" },
  { text: "Focus on progress, not perfection.", author: "Unknown" },
  { text: "What gets scheduled gets done.", author: "Unknown" },
];

/** Deterministic quote of the day — stable for the whole day, rotates daily. */
export function quoteOfTheDay(date: Date = new Date()): DayQuote {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = dayIndex(date, start);
  return DAY_QUOTES[dayOfYear % DAY_QUOTES.length];
}

/** Hero strip copy for the Tasks page (mirrors the reference's right-rail line). */
export const HERO_QUOTES: DayQuote[] = [
  { text: "A focused mind turns today's effort into tomorrow's success.", author: "Learnbook" },
  { text: "A focused mind builds a brighter future.", author: "Learnbook" },
  { text: "Progress is the sum of small efforts, repeated day in and day out.", author: "Learnbook" },
  { text: "Do today what others won't, so tomorrow others can't.", author: "Learnbook" },
];

/** Deterministic hero quote — the same one all day, like the panel quote. */
export function heroQuoteOfTheDay(date: Date = new Date()): DayQuote {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = dayIndex(date, start);
  return HERO_QUOTES[dayOfYear % HERO_QUOTES.length];
}

function dayIndex(date: Date, start: Date): number {
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}
