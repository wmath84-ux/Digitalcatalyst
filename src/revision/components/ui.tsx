import type { HTMLAttributes, ReactNode } from "react";
import { AlertIcon } from "./icons";
import { GlassButton } from "./RevisionGlassButton";

export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-primary ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Spinner className="h-8 w-8" />
      <p className="dc-scene-ink text-sm font-medium text-on-surface-variant">{label}</p>
    </div>
  );
}

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl border border-outline-variant bg-indigo-500/10 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4">
      <Shimmer className="h-40 w-full rounded-3xl" />
      <div className="grid grid-cols-3 gap-3">
        <Shimmer className="h-20 rounded-2xl" />
        <Shimmer className="h-20 rounded-2xl" />
        <Shimmer className="h-20 rounded-2xl" />
      </div>
      <Shimmer className="h-28 w-full rounded-3xl" />
      <Shimmer className="h-28 w-full rounded-3xl" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20 text-primary">
          {icon}
        </div>
      )}
      <h3 className="dc-scene-ink text-base font-bold text-on-surface">{title}</h3>
      {description && <p className="dc-scene-ink max-w-[280px] text-sm leading-relaxed text-on-surface-variant">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-error">
        <AlertIcon className="h-8 w-8" />
      </div>
      <h3 className="dc-scene-ink text-base font-bold text-on-surface">Something went wrong</h3>
      <p className="dc-scene-ink max-w-[280px] text-sm leading-relaxed text-on-surface-variant">{message}</p>
      {onRetry && (
        <GlassButton variant="capsule" onClick={onRetry} className="mt-1">
          Try again
        </GlassButton>
      )}
    </div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full border border-outline-variant ${className}`}>
      <div
        className="h-full rounded-full bg-indigo-600 transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const statusStyles: Record<string, string> = {
  learning: "bg-amber-500/20 text-on-secondary-fixed-variant border-amber-400/30",
  improving: "bg-sky-500/20 text-primary border-sky-400/30",
  mastered: "bg-emerald-500/20 text-tertiary border-emerald-400/30",
  easy: "bg-emerald-500/20 text-tertiary border-emerald-400/30",
  medium: "bg-amber-500/20 text-on-secondary-fixed-variant border-amber-400/30",
  hard: "bg-rose-500/20 text-error border-rose-400/30",
  correct: "bg-emerald-500/20 text-tertiary border-emerald-400/30",
  wrong: "bg-rose-500/20 text-error border-rose-400/30",
  skipped: "text-on-surface-variant border-outline-variant",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const cls = statusStyles[tone] ?? "text-on-surface-variant border-outline-variant";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${cls}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rev-card rounded-2xl border border-outline-variant bg-surface p-4 text-on-surface ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 text-[15px] font-bold text-on-primary transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  className = "",
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** `sm` = compact row inside a Test Bank card. */
  size?: "md" | "sm";
}) {
  /* The pack's Glass Button (capsule). The registry fixes the pill at h-12 px-6
     on its inner surface; `[&>span>div]` reaches that surface so `w-full` and
     the compact size apply without touching the vendored file. */
  const surface =
    size === "sm"
      ? "[&>span>div]:h-8 [&>span>div]:px-3 [&>span>div]:rounded-lg text-[10px]"
      : "text-[15px]";
  return (
    <GlassButton
      variant="capsule"
      onClick={onClick}
      disabled={disabled}
      className={`${size === "sm" ? "w-auto [&>span>div]:w-auto" : "w-full [&>span>div]:w-full"} disabled:cursor-not-allowed disabled:opacity-50 ${surface} ${className}`}
    >
      <span className="inline-flex items-center justify-center gap-2 font-bold">{children}</span>
    </GlassButton>
  );
}
