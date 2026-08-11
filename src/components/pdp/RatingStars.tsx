import { Star } from "lucide-react";
import { cn } from "../../utils/cn";

export default function RatingStars({
  rating,
  size = "h-4 w-4",
  className,
}: {
  rating: number;
  size?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fillPct = Math.max(0, Math.min(1, rating - i)) * 100;
        return (
          <span key={i} className="relative inline-block">
            <Star className={cn(size, "text-zinc-300")} strokeWidth={1.5} />
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fillPct}%` }}
            >
              <Star className={cn(size, "fill-amber-400 text-amber-400")} strokeWidth={1.5} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
