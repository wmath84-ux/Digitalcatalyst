import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../utils/cn";
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
}

/**
 * Confirmation overlay with the same screen-size behaviour as `Modal`:
 * bottom-sheet-style centred card on phones, and on tablet / desktop a
 * dialog constrained to the My Day content column (the side navigation —
 * or the desktop shell's left rail on a small tablet in landscape —
 * stays visible and untouched). The panel is capped to the visible height,
 * so short landscape screens scroll internally instead of overflowing.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
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
      <div
        className="relative max-h-full w-full max-w-sm animate-scaleIn overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 shadow-2xl custom-scrollbar"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-sm text-slate-500">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
