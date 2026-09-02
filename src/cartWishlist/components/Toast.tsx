import { CheckCircle2 } from "lucide-react";
import { GlassSurface } from "../../components/ui/glass";

interface ToastProps {
  message: string | null;
}

export default function Toast({ message }: ToastProps) {
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 z-[60] w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2 transition-all duration-300 ${
        message ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
      }`}
    >
      <GlassSurface radius={16} className="text-white" contentClassName="flex items-center gap-2 px-4 py-3">
        <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
        <span className="text-xs font-semibold text-white">{message}</span>
      </GlassSurface>
    </div>
  );
}
