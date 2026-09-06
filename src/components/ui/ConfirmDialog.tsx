import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../utils/cn";
import { GlassSurface } from "./glass";
import { GlassButton } from "./glass-button";
import {
  lockBodyScroll,
  unlockBodyScroll,
  useOverlayBox,
  useOverlayBounds,
} from "./overlayBounds";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Danger is the default because every current call-site deletes something. */
  tone?: "danger" | "primary";
}

/**
 * Confirmation overlay with the same screen-size behaviour as `Modal`:
 * bottom-sheet-style centred card on phones, and on tablet / desktop a
 * dialog constrained to the My Day content column (the side navigation —
 * or the desktop shell's left rail on a small tablet in landscape —
 * stays visible and untouched). The panel is capped to the visible height,
 * so short landscape screens scroll internally instead of overflowing.
 *
 * Wave 1 (liquid glass): frosted `GlassSurface` panel + the pack's gel-press
 * buttons for Cancel / Delete, so the destructive action has weight without
 * the flat solid pill. `role="alertdialog"`, Escape-to-cancel and the shared
 * scroll lock are unchanged.
 *
 * My Day legibility: `dc-scene-plate` puts the same dark backing, rim and ink
 * floor under the confirmation that every card / bar / sheet wears, so a
 * delete prompt over the bright winter scene reads at the same contrast as
 * the list it came from (src/glass.css).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  tone = "danger",
}: ConfirmDialogProps) {
  const boundsRef = useOverlayBounds();
  const { scoped, box } = useOverlayBox(open, boundsRef);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isScoped = scoped && box !== null;

  return (
    <div
      className={cn(
        "animate-fadeIn flex",
        isScoped && box
          ? "fixed z-[60] items-center justify-center p-4 sm:p-6"
          : "fixed inset-0 z-[60] items-center justify-center p-4",
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
        onClick={onCancel}
      />
      <GlassSurface
        radius={0}
        style={{ borderRadius: "var(--glass-sheet-radius)" }}
        className="dc-scene-plate glass-dialog-in relative max-h-full w-full max-w-sm overflow-hidden text-white"
        contentClassName="max-h-full overflow-y-auto overscroll-contain p-6 custom-scrollbar"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-1.5 text-sm text-white/70">{message}</p>
        <div className="mt-6 flex gap-3">
          <GlassButton
            variant="capsule"
            type="button"
            onClick={onCancel}
            className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-4"
          >
            Cancel
          </GlassButton>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "h-11 flex-1 rounded-full px-4 text-sm font-bold text-white transition-colors",
              tone === "danger" ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-600 hover:bg-indigo-500",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </GlassSurface>
    </div>
  );
}
