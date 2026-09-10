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
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return DAY_QUOTES[dayOfYear % DAY_QUOTES.length];
}
