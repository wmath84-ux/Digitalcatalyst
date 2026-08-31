import { CalendarDays, Moon, Palette, Sun } from "lucide-react";
import { motion } from "framer-motion";
import type { ThemeMode } from "../../flowpath/hooks/useTheme";

interface FlowPathHeaderProps {
  themeMode: ThemeMode;
  resolvedTheme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenCurve: () => void;
}

export function FlowPathHeader({
  themeMode,
  resolvedTheme,
  onToggleTheme,
  onOpenCurve,
}: FlowPathHeaderProps) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 sm:px-6 sm:pt-4">
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel flex w-full max-w-5xl items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 sm:px-5 sm:py-3"
      >
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-display flex items-center gap-1.5 text-[15px] font-bold tracking-[0.14em] text-fp-text sm:text-lg">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_2px_rgba(139,123,255,0.9)]" />
            FLOWPATH
          </span>
          <span className="hidden truncate text-[11px] text-fp-muted sm:block sm:text-xs">
            Your day. Your goals. One continuous flow.
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-xl border border-fp-border bg-fp-surface px-3 py-1.5 text-xs text-fp-muted transition hover:border-fp-border-hover hover:bg-fp-surface-hover hover:text-fp-text sm:flex"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {today}
          </button>

          <button
            type="button"
            aria-label="Flow curve settings"
            onClick={onOpenCurve}
            className="grid h-8 w-8 place-items-center rounded-xl border border-fp-border bg-fp-surface text-fp-muted transition hover:border-fp-border-hover hover:bg-fp-surface-hover hover:text-fp-text sm:h-9 sm:w-9"
          >
            <Palette className="h-4 w-4" />
          </button>

          <button
            type="button"
            aria-label={`Theme: ${themeMode}`}
            onClick={onToggleTheme}
            className="grid h-8 w-8 place-items-center rounded-xl border border-fp-border bg-fp-surface text-fp-muted transition hover:border-fp-border-hover hover:bg-fp-surface-hover hover:text-fp-text sm:h-9 sm:w-9"
          >
            {resolvedTheme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>
        </div>
      </motion.div>
    </header>
  );
}
