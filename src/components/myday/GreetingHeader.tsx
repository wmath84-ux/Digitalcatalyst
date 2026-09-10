import { CalendarDays, Flame, Target } from "lucide-react";
import ProgressRing from "./ProgressRing";
import HeroMountains from "./HeroArt";
import { GlassSurface } from "../ui/glass";
import { quoteOfTheDay } from "./quotes";

interface GreetingHeaderProps {
  name: string;
  completed: number;
  total: number;
  streak: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function getMotivation(percent: number): string {
  if (percent === 100) return "All tasks completed! You're a champion! 🏆";
  if (percent >= 75) return "Almost there — finish strong today! 💪";
  if (percent >= 50) return "Halfway through — keep the momentum! 🔥";
  if (percent >= 25) return "Great start! Keep pushing forward! 🚀";
  return "A fresh day ahead — let's make it count! ✨";
}

const formattedDate = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function GreetingHeader({ name, completed, total, streak }: GreetingHeaderProps) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const quote = quoteOfTheDay();

  // The pinned `dc-scene-plate` shell stays exactly as the legibility
  // contract requires; the hero art + content below are the redesign.
  return (
    <GlassSurface radius={24} className="dc-scene-plate relative overflow-hidden text-white">

      <div className="myday-hero-art">
        <HeroMountains />
      </div>
      <div className="myday-hero-stars" />
      <div className="myday-hero-shooting" />
      <div className="myday-hero-scrim" />

      <div className="relative px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          {/* Left content */}
          <div className="min-w-0 flex-1">
            <div className="myday-date-pill">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{formattedDate}</span>
            </div>

            <h1 className="myday-greeting mt-3 text-[1.55rem] leading-tight sm:text-3xl lg:text-[2rem]">
              {getGreeting()}, {name}! 👋
            </h1>

            <p className="myday-subtitle mt-1.5 max-w-md text-[0.83rem] leading-relaxed sm:text-[0.95rem]">
              {getMotivation(percent)}
            </p>

            {/* Stat pills */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="myday-stat-pill">
                <Target className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                <span>{completed} / {total} tasks</span>
              </div>
              <div className="myday-stat-pill myday-stat-pill--streak">
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                {streak}-day streak
              </div>
            </div>
          </div>

          {/* Right rail: quote + progress ring */}
          <div className="flex shrink-0 flex-col items-end gap-3">
            <p className="myday-hero-quote hidden min-[420px]:block">
              &ldquo;{quote.text}&rdquo;
            </p>
            <div className="myday-ring-glow">
              <ProgressRing percent={percent} size={104} strokeWidth={9} />
            </div>
          </div>
        </div>

        {/* Linear progress bar */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-white/60">Daily Progress</span>
            <span className="font-bold text-white/85">{completed} of {total} completed</span>
          </div>
          <div className="myday-progress-track">
            <div
              className="myday-progress-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </GlassSurface>
  );
}
