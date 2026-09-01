import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../utils/cn";
import { GlassSurface } from "./glass";
import { LiquidMetalButton } from "./LiquidMetalButton";
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
        tint={0.9}
        tintColor="255,255,255"
        blur={26}
        saturation={1.35}
        radius={0}
        style={{ borderRadius: "var(--glass-sheet-radius)" }}
        className="glass-dialog-in relative max-h-full w-full max-w-sm overflow-hidden shadow-2xl"
        contentClassName="max-h-full overflow-y-auto overscroll-contain p-6 custom-scrollbar"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 ring-1 ring-white/70">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-sm text-slate-500">{message}</p>
        <div className="mt-6 flex gap-3">
          <LiquidMetalButton tone="silver" onClick={onCancel} className="flex-1">
            Cancel
          </LiquidMetalButton>
          <LiquidMetalButton tone={tone} onClick={onConfirm} className="flex-1">
            {confirmLabel}
          </LiquidMetalButton>
        </div>
      </GlassSurface>
    </div>
  );
}
