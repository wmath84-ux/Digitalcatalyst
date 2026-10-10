// Light / Dark segmented switch for the colour theme (src/lib/theme.ts).
//
// Built from neutral white-alpha utilities, which the light theme remaps to ink,
// so the track, rule and label adapt with no extra styles. The active segment is
// brand indigo with white ink; the light theme keeps saturated plates white.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useThemeMode } from "../../hooks/useThemeMode";
import type { ThemeMode } from "../../lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
];

export function ThemeModeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useThemeMode();

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setMode(mode === "light" ? "dark" : "light");
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      data-theme-toggle
      data-theme-mode={mode}
      onKeyDown={onKeyDown}
      className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1 ${className}`}
    >
      {OPTIONS.map(({ mode: option, label, Icon }) => {
        const active = option === mode;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-theme-option={option}
            onClick={() => setMode(option)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              active
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default ThemeModeToggle;
