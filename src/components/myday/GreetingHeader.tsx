import { CalendarDays, Flame, Target, TrendingUp } from "lucide-react";
import ProgressRing from "./ProgressRing";

interface GreetingHeaderProps {
  name: string;
  completed: number;
  total: number;
  streak: number;
  coins: number;
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

export default function GreetingHeader({ name, completed, total, streak, coins }: GreetingHeaderProps) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 shadow-xl shadow-indigo-200/50">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.07] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute right-20 bottom-0 h-40 w-40 rounded-full bg-sky-400/10 blur-2xl" />

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {/* Left content */}
          <div className="min-w-0 flex-1">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm ring-1 ring-inset ring-white/10">
              <CalendarDays className="h-3.5 w-3.5" />
              {formattedDate}
            </div>

            <h1 className="text-2xl font-extrabold text-white sm:text-3xl lg:text-[2rem]">
              {getGreeting()}, {name}! 👋
            </h1>

            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/75 sm:text-base">
              {getMotivation(percent)}
            </p>

            {/* Stat pills */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm">
                <Target className="h-3.5 w-3.5 text-sky-300" />
                <span className="text-white/90">{completed}</span>
                <span className="text-white/50">/</span>
                <span className="text-white/90">{total}</span>
                <span className="text-white/50">tasks</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-400/20 px-3 py-1.5 text-xs font-semibold text-orange-100 ring-1 ring-inset ring-orange-300/20">
                <Flame className="h-3.5 w-3.5 text-orange-300" />
                {streak}-day streak
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-100 ring-1 ring-inset ring-amber-300/20">
                <TrendingUp className="h-3.5 w-3.5 text-amber-300" />
                {coins.toLocaleString()} coins
              </div>
            </div>
          </div>

          {/* Progress Ring */}
          <div className="flex items-center justify-center sm:justify-end">
            <ProgressRing percent={percent} size={120} strokeWidth={10} />
          </div>
        </div>

        {/* Linear progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-white/60 mb-2">
            <span>Daily Progress</span>
            <span className="font-semibold text-white/80">{completed} of {total} completed</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-300 to-fuchsia-400"
              style={{
                width: `${percent}%`,
                transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
