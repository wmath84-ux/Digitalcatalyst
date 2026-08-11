import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  accent?: string;
}

export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  accent = "from-violet-500 to-indigo-600",
}: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <div className="relative mb-6">
        <div
          className={`absolute inset-0 -z-10 scale-150 rounded-full bg-gradient-to-br ${accent} opacity-10 blur-2xl`}
        />
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br ${accent} shadow-xl shadow-indigo-200/60`}
        >
          <div className="text-white">{icon}</div>
        </div>
      </div>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-slate-500">
        {subtitle}
      </p>
      <button
        onClick={onAction}
        className={`mt-8 w-full max-w-[220px] rounded-2xl bg-gradient-to-r ${accent} px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-300/50 transition active:scale-95`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
