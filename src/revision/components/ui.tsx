import type { HTMLAttributes, ReactNode } from "react";
import { AlertIcon } from "./icons";

export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-indigo-600 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Spinner className="h-8 w-8" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shadow-sm shadow-indigo-100">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {description && <p className="max-w-[280px] text-sm leading-relaxed text-slate-600">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600 shadow-sm shadow-rose-100">
        <AlertIcon className="h-8 w-8" />
      </div>
      <h3 className="text-base font-bold text-slate-900">Something went wrong</h3>
      <p className="max-w-[280px] text-sm leading-relaxed text-slate-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 min-h-[44px] rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white active:bg-slate-800"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200/80 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const statusStyles: Record<string, string> = {
  learning: "bg-amber-100 text-amber-800 border-amber-300",
  improving: "bg-sky-100 text-sky-800 border-sky-300",
  mastered: "bg-emerald-100 text-emerald-800 border-emerald-300",
  easy: "bg-emerald-100 text-emerald-800 border-emerald-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  hard: "bg-rose-100 text-rose-800 border-rose-300",
  correct: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wrong: "bg-rose-100 text-rose-800 border-rose-300",
  skipped: "bg-slate-200 text-slate-700 border-slate-300",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const cls = statusStyles[tone] ?? "bg-slate-200 text-slate-700 border-slate-300";
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
    <div className={`rev-card rounded-3xl p-4 ${className}`} {...rest}>
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
      className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-[15px] font-bold text-white shadow-md shadow-indigo-200 transition hover:brightness-105 active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none ${className}`}
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
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`dc-glass-soft flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-bold text-slate-800 transition active:scale-[0.98] active:bg-white/80 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100/70 disabled:text-slate-400 disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}
