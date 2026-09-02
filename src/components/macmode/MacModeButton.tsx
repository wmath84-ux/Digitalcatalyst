// src/components/macmode/MacModeButton.tsx
//
// The desktop top-bar entry point into Mac mode.
//
// Deliberately a small, self-contained pill rather than another
// `ExpandingTabs` item: the quick-actions bar is a set of ROUTES (alerts,
// favourites, cart, plans) with badges and an active state, while Mac mode is
// a modal takeover with none of those semantics. Keeping it separate also
// means the simulator's entry point is one import the rest of the top bar
// knows nothing about.

import { forwardRef } from "react";
import { cn } from "@/utils/cn";

/** Apple mark, drawn inline so the button costs no network request. */
function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.42 2.2-1.12 3.01-.84.98-2.2 1.74-3.32 1.65a3.6 3.6 0 0 1 1.12-2.9c.77-.84 2.1-1.5 3.32-1.76zm3.5 16.2c-.6 1.37-.9 1.98-1.66 3.2-1.07 1.7-2.58 3.82-4.45 3.83-1.66.02-2.09-1.08-4.35-1.07-2.26.01-2.73 1.09-4.39 1.08-1.87-.02-3.3-1.94-4.37-3.63C-2.3 16.3-2.6 10.6.13 7.62c1.16-1.3 2.86-2.12 4.63-2.12 1.8 0 2.94 1.09 4.43 1.09 1.45 0 2.33-1.09 4.42-1.09 1.57 0 3.24.86 4.42 2.34-3.89 2.13-3.26 7.68.84 9.79z"
      />
    </svg>
  );
}

interface MacModeButtonProps {
  onClick: () => void;
  className?: string;
}

const MacModeButton = forwardRef<HTMLButtonElement, MacModeButtonProps>(
  function MacModeButton({ onClick, className }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        data-mac-mode-trigger
        title="Open Mac mode — a full macOS desktop, right here"
        aria-label="Open Mac mode"
        className={cn(
          "group inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3",
          "text-[12px] font-black tracking-tight text-white/80 backdrop-blur-md",
          "transition duration-200 hover:border-white/30 hover:bg-white/[0.12] hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          className,
        )}
      >
        <AppleGlyph className="h-3.5 w-3.5 opacity-80 transition group-hover:opacity-100" />
        {/* The label is dropped on narrower desktops so the top bar's search
            field keeps its width; the icon plus tooltip still carry it. */}
        <span className="hidden xl:inline">Mac mode</span>
      </button>
    );
  },
);

export default MacModeButton;
