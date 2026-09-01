import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
import { GlassSurface } from "./glass";
import {
  lockBodyScroll,
  unlockBodyScroll,
  useOverlayBox,
  useOverlayBounds,
  type OverlayBoundsRef,
} from "./overlayBounds";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  /**
   * Optional ref to the element the dialog should stay inside on tablet /
   * desktop widths. When omitted, the value from `OverlayBoundsProvider` is
   * used (My Day provides its content column); with neither, the modal is a
   * classic full-window overlay.
   */
  boundsRef?: OverlayBoundsRef | null;
}

/**
 * Responsive My Day overlay.
 *
 * - Phones (<768px, no desktop shell): bottom sheet pinned to the viewport
 *   bottom, full width, respecting the safe-area inset, never taller than
 *   the visible viewport.
 * - Tablets / laptops / desktops (>=768px) — AND small tablets in landscape
 *   (>=640px) where the desktop shell's left rail is rendered: centred dialog
 *   constrained to the My Day content column — the sticky side navigation /
 *   shell rail stays visible and clickable, and nothing spills over the app
 *   frame or off-screen.
 *
 * In both cases the panel is a flex column capped at the available height
 * (dvh-aware, with a vh fallback for older browsers): the header stays put and
 * long form content scrolls inside the body, so Save/Cancel can never be
 * pushed out of view on short screens (e.g. tablets in landscape).
 *
 * Wave 1 (liquid glass): the panel is now the pack's `GlassSurface` — a
 * specular-rimmed frosted lens instead of an opaque white card, so the page
 * behind a sheet stays faintly legible, and the phone sheet scales/slides in
 * through `.glass-dialog-in` (src/glass.css). Everything the overlay maths
 * depends on is untouched: `useOverlayBox` scoping, the shared body-scroll
 * lock, Escape, the dvh height cap and the safe-area padding. The tint is
 * deliberately high (0.86 white) because these sheets carry forms: legibility
 * of the inputs beats a showier see-through panel.
 */
export default function Modal({ open, onClose, title, children, maxWidth = "max-w-md", boundsRef }: ModalProps) {
  const contextBounds = useOverlayBounds();
  const resolvedBounds = boundsRef ?? contextBounds;
  const { scoped, box } = useOverlayBox(open, resolvedBounds);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isScoped = scoped && box !== null;

  return (
    <div
      className={cn(
        "animate-fadeIn flex",
        isScoped && box
          ? "fixed z-50 items-center justify-center p-4 sm:p-6"
          : "fixed inset-0 z-50 items-end justify-center sm:items-center sm:p-4",
      )}
      style={
        isScoped && box
          ? { top: box.top, left: box.left, width: box.width, height: box.height }
          : undefined
      }
    >
      <div
        className={cn(
          "absolute inset-0 bg-slate-900/40 backdrop-blur-sm",
          isScoped && "rounded-[1.75rem]",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <GlassSurface
        tint={0.86}
        tintColor="255,255,255"
        blur={26}
        saturation={1.35}
        radius={0}
        /* GlassSurface writes `borderRadius: radius` first and spreads `style`
           after, so the sheet-vs-card corner shape stays a CSS concern:
           --glass-sheet-radius is top-only on phones and uniform from 640px up
           (see src/glass.css). A `rounded-*` class could not do this — an
           inline style would beat it. */
        style={{ borderRadius: "var(--glass-sheet-radius)" }}
        className={cn(
          "glass-dialog-in relative flex w-full flex-col overflow-hidden shadow-2xl",
          maxWidth,
          isScoped && box
            ? "max-h-full"
            : "max-h-[calc(100vh-3.5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-3.5rem)] sm:max-h-[calc(100vh-2rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]",
        )}
        contentClassName="flex min-h-0 flex-1 flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/60 px-5 py-3 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-white/70"
          >
            {/* the disc itself is a mini lens: frost + specular rim */}
            <GlassSurface
              tint={0.5}
              blur={10}
              radius={999}
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            />
            <X className="relative size-5 text-slate-500" />
          </button>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
      </GlassSurface>
    </div>
  );
}

