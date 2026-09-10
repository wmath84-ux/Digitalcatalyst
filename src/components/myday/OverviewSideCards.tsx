import { ChevronRight, Flame, Quote } from "lucide-react";
import { cn } from "../../utils/cn";
import { quoteOfTheDay } from "./quotes";

interface StreakCardProps {
  streak: number;
  onOpen?: () => void;
}

/** Study streak, driven by the real completion-derived streak value. */
export function StreakCard({ streak, onOpen }: StreakCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Study streak: ${streak} days. ${streak > 0 ? "Keep going!" : "Complete a task to start your streak!"}`}
      className="myday-streak w-full text-left transition hover:brightness-110"
    >
      <span className="myday-streak-flame">
        <Flame className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-orange-200/80">
          Study Streak
        </span>
        <span className="block text-xl font-black leading-tight tracking-tight text-white">
          {streak} Day{streak === 1 ? "" : "s"}
        </span>
        <span className="block truncate text-[11px] font-semibold text-white/60">
          {streak > 0 ? "Keep going! 🔥" : "Complete a task to begin! ✨"}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-white/40" aria-hidden="true" />
    </button>
  );
}

interface QuoteCardProps {
  className?: string;
}

/** Motivational quote of the day. */
export function QuoteCard({ className }: QuoteCardProps) {
  const quote = quoteOfTheDay();
  return (
    <figure className={cn("myday-quote-card", className)}>
      <Quote className="h-5 w-5 text-violet-200/70" aria-hidden="true" />
      <blockquote className="relative z-[1] mt-1.5 text-[0.95rem] font-bold leading-snug text-white">
        {quote.text}
      </blockquote>
      <figcaption className="relative z-[1] mt-1.5 text-xs font-semibold text-violet-100/75">
        — {quote.author}
      </figcaption>
    </figure>
  );
}
