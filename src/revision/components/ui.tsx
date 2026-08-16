import type { ReactNode } from "react";
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
      <p className="text-sm text-slate-500">{label}</p>
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="max-w-[280px] text-sm leading-relaxed text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <AlertIcon className="h-8 w-8" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">Something went wrong</h3>
      <p className="max-w-[280px] text-sm leading-relaxed text-slate-500">{message}</p>
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
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const statusStyles: Record<string, string> = {
  learning: "bg-amber-50 text-amber-700 border-amber-200",
  improving: "bg-sky-50 text-sky-700 border-sky-200",
  mastered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  easy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  hard: "bg-rose-50 text-rose-700 border-rose-200",
  correct: "bg-emerald-50 text-emerald-700 border-emerald-200",
  wrong: "bg-rose-50 text-rose-700 border-rose-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const cls = statusStyles[tone] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${cls}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}>
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
      className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-[15px] font-semibold text-white shadow-sm transition active:scale-[0.98] active:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${className}`}
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
      className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-[15px] font-semibold text-slate-700 transition active:scale-[0.98] active:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 ${className}`}
    >
      {children}
    </button>
  );
}
