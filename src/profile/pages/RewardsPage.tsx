import { Flame, Gift, Lock } from "lucide-react";
import { useApp } from "../context/AppContext";
import { cn } from "../utils/cn";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RewardsPage() {
  const { streak, badges, claimDailyReward } = useApp();

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-6 pt-5">
      {/* Streak */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-red-500 to-rose-600 p-5 text-white shadow-xl shadow-orange-200">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1 text-xs font-medium text-white/80">
              <Flame className="h-3.5 w-3.5" /> Current Streak
            </p>
            <p className="text-3xl font-extrabold">{streak.current} Days</p>
            <p className="text-[11px] text-white/70">Longest streak: {streak.longest} days</p>
          </div>
          <span className="text-5xl">🔥</span>
        </div>

        <div className="relative mt-4 flex justify-between gap-1.5">
          {streak.last7.map((active, idx) => (
            <div key={idx} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  active ? "bg-white text-orange-600" : "bg-white/20 text-white/60"
                )}
              >
                {active ? "🔥" : "·"}
              </div>
              <span className="text-[9.5px] text-white/70">{dayLabels[idx]}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={claimDailyReward}
          disabled={streak.claimedToday}
          className={cn(
            "relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold transition active:scale-[0.98]",
            streak.claimedToday
              ? "bg-white/15 text-white/70"
              : "bg-white text-orange-600 shadow-md"
          )}
        >
          <Gift className="h-4 w-4" />
          {streak.claimedToday ? "Today's Reward Claimed ✓" : "Claim Daily Reward (+15 🪙)"}
        </button>
      </section>

      {/* Badges */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Your Badges</p>
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10.5px] font-bold text-indigo-600">
            {earnedCount}/{badges.length} Earned
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={cn(
                "relative overflow-hidden rounded-2xl p-3.5 ring-1 transition",
                badge.earned ? "bg-gradient-to-br from-indigo-50 to-violet-50 ring-indigo-100" : "bg-neutral-50 ring-neutral-100"
              )}
            >
              {!badge.earned && (
                <span className="absolute right-2.5 top-2.5 text-neutral-300">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              )}
              <span className={cn("text-3xl", !badge.earned && "opacity-40 grayscale")}>{badge.icon}</span>
              <p className="mt-1.5 text-xs font-extrabold text-neutral-900">{badge.name}</p>
              <p className="mb-2 text-[10px] leading-snug text-neutral-500">{badge.description}</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={cn(
                    "h-full rounded-full",
                    badge.earned ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-neutral-300"
                  )}
                  style={{ width: `${Math.min(100, (badge.progress / badge.goal) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[9.5px] font-semibold text-neutral-400">
                {badge.progress}/{badge.goal}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
