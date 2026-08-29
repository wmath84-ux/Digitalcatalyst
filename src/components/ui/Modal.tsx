import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
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
 * - Phones (<768px): bottom sheet pinned to the viewport bottom, full width,
 *   respecting the safe-area inset, never taller than the visible viewport.
 * - Tablets / laptops / desktops (>=768px): centred dialog constrained to the
 *   My Day content column — the sticky side navigation stays visible and
 *   clickable, and nothing spills over the app frame or off-screen.
 *
 * In both cases the panel is a flex column capped at the available height
 * (dvh-aware, with a vh fallback for older browsers): the header stays put and
 * long form content scrolls inside the body, so Save/Cancel can never be
 * pushed out of view on short screens (e.g. tablets in landscape).
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
      <div
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-slideUp sm:rounded-3xl",
          maxWidth,
          isScoped && box
            ? "max-h-full"
            : "max-h-[calc(100vh-3.5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-3.5rem)] sm:max-h-[calc(100vh-2rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
