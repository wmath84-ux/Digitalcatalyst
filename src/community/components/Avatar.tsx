import { cn } from "../utils/cn";
import type { User } from "../types";

interface AvatarProps {
  user?: User;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  ring?: boolean;
  onClick?: () => void;
}

const sizeMap = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-3xl",
};

export default function Avatar({ user, size = "md", ring, onClick }: AvatarProps) {
  if (!user) return null;
  const initials = user.displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "relative shrink-0 rounded-full",
        ring && "p-[2px] bg-gradient-to-tr from-amber-400 via-pink-500 to-fuchsia-600",
        !onClick && "cursor-default"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ring-2 ring-white",
          sizeMap[size],
          user.gradient
        )}
      >
        {initials}
      </div>
      {user.isAdmin && size !== "xs" && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] ring-2 ring-white">
          🛡️
        </span>
      )}
    </button>
  );
}
