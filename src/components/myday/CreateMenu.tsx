import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus, type LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export interface CreateMenuOption {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
}

interface CreateMenuProps {
  /** The create destinations shown in the dropdown (My Day passes CREATE_OPTIONS). */
  options: CreateMenuOption[];
  /** Fired with the chosen option id AFTER the menu has closed itself. */
  onSelect: (id: string) => void;
}

/**
 * My Day's big "+" creation hub.
 *
 * The button sits at the centre of the overview; tapping it opens a
 * COMPACT drop-up that floats just above the button (never under it and
 * never off-screen), pops in from the button with a small scale/rise and
 * staggers its rows in one after another. Width is a fixed, narrow menu
 * width (224–240 px), so the same tidy dropdown reads correctly on a
 * phone, every tablet size (portrait, small landscape with the desktop
 * rail, wide) and desktop — no per-breakpoint layout to break.
 *
 * Closes on: choosing an option, tapping/clicking anywhere outside the
 * row, any scroll/touch-move/wheel gesture, and the Escape key.
 */
export default function CreateMenu({ options, onSelect }: CreateMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside pointer + scroll dismissal. Scroll closes it because the
  // drop-up is anchored to the button's on-screen spot; a scrolled page
  // would leave it floating over unrelated content.
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    const closeOnOutsideScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("touchstart", closeOnOutsidePointer, { passive: true });
    document.addEventListener("scroll", closeOnOutsideScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", closeOnOutsideScroll, { passive: true });
    window.addEventListener("wheel", closeOnOutsideScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("touchstart", closeOnOutsidePointer);
      document.removeEventListener("scroll", closeOnOutsideScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchmove", closeOnOutsideScroll);
      window.removeEventListener("wheel", closeOnOutsideScroll);
    };
  }, [open]);

  // Escape dismisses, like every other overlay in the app.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={menuRef} data-myday-create-row className="relative flex flex-col items-center pb-8">
      {/* The inner wrapper is the positioning context: the drop-up hangs
          `bottom: calc(100% + …)` off IT (button + caption), so it always
          clears the button with even spacing on every screen height. */}
      <div className="relative flex flex-col items-center">
        <button
          type="button"
          aria-label="Create item"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl transition active:scale-95 md:h-24 md:w-24",
            open && "rotate-45",
          )}
        >
          <Plus className="h-10 w-10 md:h-12 md:w-12" strokeWidth={2.5} />
        </button>
        <p className="mt-3 text-sm font-semibold text-white/55 md:text-base">Add to your day</p>

        {open && (
          /* Fixed-width anchor, centred on the button. The dedicated
             `dc-create-menu-anchor` class (not a utility) carries the
             max-width reset — see the comment in index.css for why the
             layered `max-w-none` utility loses on tablets. */
          <div
            className="dc-create-menu-anchor absolute left-1/2 z-20 w-56 -translate-x-1/2 sm:w-64"
            style={{ bottom: "calc(100% + 0.9rem)" }}
          >
            <div
              data-myday-create-menu
              role="menu"
              aria-label="Create"
              className="dc-create-menu dc-glass relative mx-auto w-full max-w-[calc(100vw-2rem)] rounded-2xl p-1.5"
            >
              {options.map((option, index) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onSelect(option.id);
                    }}
                    className="dc-create-item group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08] active:bg-white/[0.08]"
                    style={{ animationDelay: `${40 + index * 35}ms` }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white/85">
                      {option.label}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                  </button>
                );
              })}
              {/* Little tail that ties the drop-up to the + button. */}
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[3px] bg-white/[0.08]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
