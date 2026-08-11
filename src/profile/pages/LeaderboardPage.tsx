import { useState } from "react";
import { Copy, Medal, TrendingUp } from "lucide-react";
import { useApp } from "../context/AppContext";
import { cn } from "../utils/cn";

const periods = ["Weekly", "Monthly", "All-Time"];

export function LeaderboardPage() {
  const { leaderboard, user, showToast } = useApp();
  const [period, setPeriod] = useState("Monthly");

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const currentUser = leaderboard.find((u) => u.isCurrentUser);

  function copyId(id: string) {
    navigator.clipboard?.writeText(id).catch(() => {});
    showToast("Referral ID copied!");
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-6 pt-5">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 to-neutral-800 p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-extrabold">
            <TrendingUp className="h-4 w-4 text-emerald-400" /> Top Learners
          </p>
          <div className="flex gap-1 rounded-full bg-white/10 p-1">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-bold transition",
                  period === p ? "bg-white text-neutral-900" : "text-white/60"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Podium */}
        <div className="flex items-end justify-center gap-3 pb-1 pt-3">
          {[top3[1], top3[0], top3[2]].map((u, idx) => {
            if (!u) return null;
            const isFirst = u.rank === 1;
            return (
              <div key={u.referralId} className="flex flex-col items-center">
                <span className="text-2xl">{u.emoji}</span>
                <p className="mt-1 max-w-[64px] truncate text-[10.5px] font-bold">{u.name.split(" ")[0]}</p>
                <p className="text-[9.5px] text-white/60">{u.points} pts</p>
                <div
                  className={cn(
                    "mt-2 flex w-16 items-center justify-center rounded-t-xl font-extrabold text-white",
                    isFirst
                      ? "h-20 bg-gradient-to-t from-amber-500 to-amber-300 text-neutral-900"
                      : idx === 0
                      ? "h-14 bg-gradient-to-t from-slate-500 to-slate-300 text-neutral-900"
                      : "h-11 bg-gradient-to-t from-orange-700 to-orange-400"
                  )}
                >
                  #{u.rank}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {currentUser && (
        <section className="rounded-3xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-indigo-400">Your Rank</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-sm font-extrabold text-white">
                #{currentUser.rank}
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-900">{user.name}</p>
                <p className="text-[10.5px] text-neutral-500">{currentUser.points} points</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyId(user.referralId)}
              className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[10.5px] font-bold text-indigo-600 ring-1 ring-indigo-200 active:scale-95 transition"
            >
              <Copy className="h-3 w-3" /> {user.referralId}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-3xl bg-white p-2 shadow-sm ring-1 ring-neutral-100">
        <p className="px-3 pt-3 pb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
          Full Rankings
        </p>
        <div className="divide-y divide-neutral-50">
          {rest.map((u) => (
            <div
              key={u.referralId}
              className={cn(
                "flex items-center gap-3 px-3 py-3",
                u.isCurrentUser && "rounded-2xl bg-indigo-50/70"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                  u.rank <= 10 ? "bg-neutral-100 text-neutral-500" : "bg-neutral-50 text-neutral-400"
                )}
              >
                {u.rank}
              </span>
              <span className="text-xl">{u.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-neutral-900">
                  {u.name} {u.isCurrentUser && <span className="text-indigo-500">(You)</span>}
                </p>
                <button
                  type="button"
                  onClick={() => copyId(u.referralId)}
                  className="flex items-center gap-1 text-[10px] text-neutral-400 active:text-indigo-500"
                >
                  {u.referralId} <Copy className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-neutral-700">
                <Medal className="h-3.5 w-3.5 text-amber-400" /> {u.points}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
