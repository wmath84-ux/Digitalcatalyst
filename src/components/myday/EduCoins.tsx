import { Award, Coins, Flame, Sparkles, Star, TrendingUp, Trophy } from "lucide-react";
import { cn } from "../../utils/cn";

interface EduCoinsProps {
  totalCoins: number;
  earnedToday: number;
  streak: number;
  tasksCompleted: number;
  totalTasks: number;
  weeklyActivity: number[];
}

const days = ["M", "T", "W", "T", "F", "S", "S"];

const milestones = [
  { coins: 10, label: "First Steps", icon: Star },
  { coins: 25, label: "Getting Warm", icon: Flame },
  { coins: 50, label: "Half Century", icon: Award },
  { coins: 100, label: "Champion", icon: Trophy },
];

export default function EduCoins({ totalCoins, earnedToday, streak, tasksCompleted, totalTasks, weeklyActivity }: EduCoinsProps) {
  const todayIndex = (new Date().getDay() + 6) % 7;

  // Determine the next milestone
  const nextMilestone = milestones.find((m) => m.coins > earnedToday) ?? milestones[milestones.length - 1];
  const prevMilestone = [...milestones].reverse().find((m) => m.coins <= earnedToday);
  const milestoneProgress = prevMilestone && nextMilestone && nextMilestone.coins > (prevMilestone?.coins ?? 0)
    ? Math.min(100, ((earnedToday - (prevMilestone?.coins ?? 0)) / (nextMilestone.coins - (prevMilestone?.coins ?? 0))) * 100)
    : earnedToday >= (nextMilestone?.coins ?? 100) ? 100 : (earnedToday / (nextMilestone?.coins ?? 100)) * 100;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      {/* Header with gradient */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 via-orange-400 to-amber-500 px-4 py-5 sm:px-6">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-yellow-300/20 blur-xl" />

        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-white/80">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">EduCoins & Streak</span>
            </div>
            <p className="text-3xl font-extrabold text-white">{totalCoins.toLocaleString()}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-white/80">
              <TrendingUp className="h-3 w-3" />
              +{earnedToday} earned today
            </p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Coins className="h-8 w-8 text-white" />
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-orange-50 p-3.5 ring-1 ring-orange-100">
            <div className="flex items-center gap-1.5 text-orange-500">
              <Flame className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Streak</span>
            </div>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{streak}</p>
            <p className="text-[11px] font-medium text-slate-400">consecutive days</p>
          </div>
          <div className="rounded-2xl bg-violet-50 p-3.5 ring-1 ring-violet-100">
            <div className="flex items-center gap-1.5 text-violet-500">
              <Trophy className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Tasks</span>
            </div>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{tasksCompleted}/{totalTasks}</p>
            <p className="text-[11px] font-medium text-slate-400">completed today</p>
          </div>
        </div>

        {/* Milestone progress */}
        <div className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Next milestone</span>
            <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
              {nextMilestone && (
                <>
                  <nextMilestone.icon className="h-3.5 w-3.5" />
                  {nextMilestone.label} ({nextMilestone.coins} coins)
                </>
              )}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
              style={{ width: `${Math.min(100, milestoneProgress)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between">
            {milestones.map((m) => {
              const reached = earnedToday >= m.coins;
              const MIcon = m.icon;
              return (
                <div key={m.coins} className="flex flex-col items-center gap-0.5">
                  <div className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full transition-all",
                    reached ? "bg-amber-400 text-white shadow-sm" : "bg-slate-200 text-slate-400",
                  )}>
                    <MIcon className="h-3 w-3" />
                  </div>
                  <span className={cn("text-[9px] font-semibold", reached ? "text-amber-600" : "text-slate-400")}>
                    {m.coins}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly bar chart */}
        <div className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100">
          <p className="mb-3 text-xs font-semibold text-slate-500">This week's activity</p>
          <div className="flex items-end justify-between gap-1.5">
            {weeklyActivity.map((value, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="relative flex h-20 w-full items-end overflow-hidden rounded-lg bg-slate-200/60">
                  <div
                    className={cn(
                      "w-full rounded-lg transition-all duration-500",
                      i === todayIndex
                        ? "bg-gradient-to-t from-indigo-600 to-violet-400"
                        : i < todayIndex
                          ? "bg-gradient-to-t from-amber-400 to-amber-200"
                          : "bg-gradient-to-t from-slate-300 to-slate-200",
                    )}
                    style={{ height: `${Math.max(8, value)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold",
                    i === todayIndex ? "text-indigo-600" : "text-slate-400",
                  )}
                >
                  {days[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
