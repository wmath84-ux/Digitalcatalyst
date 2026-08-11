import { Coins, Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";

export default function EduCoinsBadge({
  amount,
  size = "md",
  className,
}: {
  amount: number;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        size === "md" ? "px-4 py-3" : "px-3 py-1.5",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-yellow-200/40 blur-xl" />
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 text-white shadow-md shadow-amber-300/50",
          size === "md" ? "h-9 w-9" : "h-6 w-6"
        )}
      >
        <Coins className={size === "md" ? "h-4.5 w-4.5" : "h-3.5 w-3.5"} />
      </div>
      <div className="relative flex flex-col leading-tight">
        <span className={cn("font-bold text-amber-900", size === "md" ? "text-sm" : "text-xs")}>
          Earn {amount.toLocaleString()} EduCoins
        </span>
        {size === "md" && (
          <span className="flex items-center gap-1 text-[11px] text-amber-700/80">
            <Sparkles className="h-3 w-3" /> Redeemable on your next purchase
          </span>
        )}
      </div>
    </div>
  );
}
