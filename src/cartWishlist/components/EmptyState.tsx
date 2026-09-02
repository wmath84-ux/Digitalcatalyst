import { ReactNode } from "react";
import { GlassSurface } from "../../components/ui/glass";

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
  accent = "bg-indigo-600",
}: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <GlassSurface radius={32} className="w-full max-w-[280px] text-white" contentClassName="flex flex-col items-center px-6 py-10">
      <div className="relative mb-6">
        <div className={`flex h-28 w-28 items-center justify-center rounded-[2rem] ${accent}`}>
          <div className="text-white">{icon}</div>
        </div>
      </div>
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-white/55">
        {subtitle}
      </p>
      <button
        onClick={onAction}
        className={`mt-8 w-full max-w-[220px] rounded-full ${accent} px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95`}
      >
        {actionLabel}
      </button>
      </GlassSurface>
    </div>
  );
}
