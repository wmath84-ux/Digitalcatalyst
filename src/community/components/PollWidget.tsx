import type { Poll } from "../types";
import { cn } from "../utils/cn";

interface PollWidgetProps {
  poll: Poll;
  onVote: (optionId: string) => void;
  variant?: "light" | "dark";
}

export default function PollWidget({ poll, onVote, variant = "light" }: PollWidgetProps) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
  const hasVoted = !!poll.votedOptionId;
  const dark = variant === "dark";

  return (
    <div className={cn("rounded-2xl p-3", dark ? "bg-white/10 backdrop-blur-md" : "bg-slate-50 border border-slate-200")}>
      <p className={cn("mb-2.5 text-sm font-semibold", dark ? "text-white" : "text-slate-800")}>
        {poll.question}
      </p>
      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isChosen = poll.votedOptionId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={(e) => {
                e.stopPropagation();
                if (!hasVoted) onVote(opt.id);
              }}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border text-left transition active:scale-[0.98]",
                dark ? "border-white/25" : "border-slate-300",
                hasVoted ? "cursor-default" : "cursor-pointer"
              )}
            >
              {hasVoted && (
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all duration-500",
                    isChosen
                      ? "bg-gradient-to-r from-fuchsia-500/70 to-orange-400/70"
                      : dark
                      ? "bg-white/15"
                      : "bg-slate-200"
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div
                className={cn(
                  "relative flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium",
                  dark ? "text-white" : "text-slate-800"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {isChosen && <span>✓</span>}
                  {opt.text}
                </span>
                {hasVoted && <span className="text-xs font-bold tabular-nums">{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
      <p className={cn("mt-2 text-[11px]", dark ? "text-white/70" : "text-slate-500")}>
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""} {!hasVoted && "· tap to vote"}
      </p>
    </div>
  );
}
