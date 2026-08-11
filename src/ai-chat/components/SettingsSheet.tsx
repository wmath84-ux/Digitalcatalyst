import type { ThemeMode } from "../types";
import { CpuIcon, MoonIcon, SunIcon, XIcon } from "./icons";
import { cn } from "../utils/cn";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onToggleTheme: (t: ThemeMode) => void;
  onOpenModelConfig: () => void;
}

export default function SettingsSheet({
  open,
  onClose,
  theme,
  onToggleTheme,
  onOpenModelConfig,
}: SettingsSheetProps) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed left-0 right-0 bottom-0 z-50 rounded-t-3xl bg-white dark:bg-[#111217] shadow-2xl transition-transform duration-300",
          open ? "translate-y-0 animate-sheet-up" : "translate-y-full pointer-events-none"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-10 rounded-full bg-zinc-200 dark:bg-white/15" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-50">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <XIcon width={17} height={17} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2">
          <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-4">
            <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 mb-3">
              Appearance
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-full bg-zinc-200/60 dark:bg-white/5 p-1">
              <button
                onClick={() => onToggleTheme("light")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition",
                  theme === "light"
                    ? "bg-white text-zinc-900 shadow"
                    : "text-zinc-500 dark:text-zinc-400"
                )}
              >
                <SunIcon width={15} height={15} />
                Light
              </button>
              <button
                onClick={() => onToggleTheme("dark")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition",
                  theme === "dark"
                    ? "bg-zinc-900 text-white shadow"
                    : "text-zinc-500 dark:text-zinc-400"
                )}
              >
                <MoonIcon width={15} height={15} />
                Dark
              </button>
            </div>
          </div>

          <button
            onClick={onOpenModelConfig}
            className="w-full flex items-center gap-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-4 active:scale-[0.98] transition"
          >
            <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shrink-0">
              <CpuIcon width={17} height={17} />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-[13.5px] font-medium text-zinc-800 dark:text-zinc-100">
                Choose / Manage Models
              </span>
              <span className="block text-[11.5px] text-zinc-400">
                Add custom models, API keys & endpoints
              </span>
            </span>
            <span className="text-zinc-300 text-lg">›</span>
          </button>

          <div className="pt-2 pb-1 text-center">
            <p className="text-[11px] text-zinc-300 dark:text-zinc-600">AI Chat · v1.0.0</p>
          </div>
        </div>
      </div>
    </>
  );
}
