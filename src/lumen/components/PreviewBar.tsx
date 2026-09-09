import { Laptop, Monitor, MonitorPlay, PanelRight, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { cn } from "../utils/cn";

export type PreviewMode = "full" | "player" | number;

const OPTIONS: { id: string; mode: PreviewMode; icon: LucideIcon; label: string; title: string }[] = [
  { id: "full", mode: "full", icon: Monitor, label: "Full", title: "Fill the window" },
  { id: "1180", mode: 1180, icon: Laptop, label: "1180", title: "Laptop — 1180px container" },
  { id: "760", mode: 760, icon: Tablet, label: "760", title: "Tablet — 760px container" },
  { id: "420", mode: 420, icon: Smartphone, label: "420", title: "Phone — 420px container" },
  { id: "300", mode: 300, icon: PanelRight, label: "300", title: "Narrow side panel — 300px" },
  { id: "player", mode: "player", icon: MonitorPlay, label: "Course player", title: "Course player split view — drag the divider to resize the chat panel" },
];

export default function PreviewBar({ mode, onMode, chatPx }: { mode: PreviewMode; onMode: (m: PreviewMode) => void; chatPx: number }) {
  const isActive = (m: PreviewMode) => (typeof m === "number" ? mode === m : typeof mode === "string" && mode === m);

  return (
    <div className="z-30 flex h-[44px] flex-none items-center gap-3 overflow-x-auto border-b border-[--border] bg-[--surface] px-2.5 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden">
      <span className="hidden flex-none text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[--ink-4] min-[720px]:block">
        Layout preview
      </span>
      <div className="flex flex-none items-center gap-0.5 rounded-[9px] bg-[--bg-2] p-[3px]" role="tablist" aria-label="Layout preview width">
        {OPTIONS.map(({ id, mode: m, icon: Icon, label, title }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive(m)}
            title={title}
            onClick={() => onMode(m)}
            className={cn(
              "focus-ring flex h-[27px] flex-none items-center gap-1.5 rounded-[7px] px-2 text-[11.5px] font-medium transition-all",
              isActive(m) ? "bg-[--surface] text-[--ink] shadow-[var(--sh-xs)]" : "text-[--ink-3] hover:text-[--ink-2]"
            )}
          >
            <Icon size={13} aria-hidden="true" />
            <span className={label.length > 4 ? "hidden min-[560px]:inline" : "inline"}>{label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <span className="mono flex-none rounded-[6px] border border-[--border] bg-[--bg] px-1.5 py-0.5 text-[10.5px] tabular-nums text-[--ink-3]" title="Live width of the chat container">
        chat · {Math.round(chatPx)}px
      </span>
    </div>
  );
}
