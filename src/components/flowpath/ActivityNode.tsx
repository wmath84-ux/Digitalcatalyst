import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { ActivityStatus, ActivityType } from "../../flowpath/types/flowpath";
import { ACTIVITY_TYPE_META } from "../../flowpath/types/flowpath";
import { ACTIVITY_ICONS } from "./icons";

interface ActivityNodeProps {
  type: ActivityType;
  status: ActivityStatus;
  onClick?: () => void;
}

export function ActivityNode({ type, status, onClick }: ActivityNodeProps) {
  const meta = ACTIVITY_TYPE_META[type];
  const Icon = ACTIVITY_ICONS[type];
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const isOverdue = status === "overdue";

  const size = isCurrent ? 56 : 42;
  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      whileHover={{ scale: isCurrent ? 1.06 : 1.12 }}
      whileTap={{ scale: 0.94 }}
      className={`fp-node-btn relative grid place-items-center rounded-full ${isCurrent ? "fp-pulse fp-floaty" : ""}`}
      style={{
        width: size,
        height: size,
        background: isCompleted
          ? "linear-gradient(155deg, var(--fp-text-10), var(--fp-text-3))"
          : `radial-gradient(circle at 32% 28%, ${meta.color}${isLight ? "45" : "55"}, var(--fp-bg-0) 70%)`,
        border: `1px solid ${isCompleted ? "var(--fp-text-15)" : isOverdue ? "rgba(251,113,133,0.55)" : meta.color + "88"}`,
        boxShadow: isCurrent
          ? `0 0 0 1px var(--fp-border) inset, 0 0 34px 6px ${meta.glow}, 0 18px 40px -12px rgba(0,0,0,0.8)`
          : isCompleted
            ? "0 6px 20px -8px rgba(0,0,0,0.6)"
            : `0 0 16px 1px ${meta.glow}, 0 10px 24px -10px rgba(0,0,0,0.7)`,
        opacity: isCompleted ? 0.62 : 1,
      }}
      aria-label={`${meta.label} — ${status}`}
    >
      <span
        className="pointer-events-none absolute inset-[2px] rounded-full opacity-40"
        style={{
          background: "linear-gradient(155deg, rgba(255,255,255,0.5), transparent 55%)",
        }}
      />
      {isCompleted ? (
        <Check className="h-4 w-4 text-fp-text-70" strokeWidth={3} />
      ) : (
        <Icon
          className={isCurrent ? "h-6 w-6" : "h-4 w-4"}
          style={{ color: isOverdue ? "var(--fp-rose-text)" : isLight ? "var(--fp-text)" : "white" }}
          strokeWidth={2.2}
        />
      )}
    </motion.button>
  );
}
