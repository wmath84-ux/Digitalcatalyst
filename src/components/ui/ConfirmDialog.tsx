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
  useVisualViewportBox,
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
  const visualViewportBox = useVisualViewportBox(open);

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
  const positionBox = isScoped ? box : visualViewportBox;

  return (
    <div
      className={cn(
        "animate-fadeIn fixed z-[60] flex items-center justify-center p-4",
        isScoped && "sm:p-6",
        !positionBox && "inset-0",
      )}
      style={positionBox ? { top: positionBox.top, left: positionBox.left, width: positionBox.width, height: positionBox.height } : undefined}
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
        <div className={cn(
          "mb-4 flex size-12 items-center justify-center rounded-2xl ring-1",
          tone === "danger"
            ? "bg-gradient-to-br from-rose-500/35 to-rose-700/25 text-rose-200 ring-rose-400/40 shadow-[0_0_24px_-6px_rgba(244,63,94,0.7),inset_0_1px_0_rgba(255,255,255,0.2)]"
            : "bg-gradient-to-br from-violet-500/35 to-indigo-700/25 text-violet-200 ring-violet-400/40 shadow-[0_0_24px_-6px_rgba(124,92,255,0.7),inset_0_1px_0_rgba(255,255,255,0.2)]",
        )}>
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-extrabold tracking-tight text-white">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/70">{message}</p>
        <div className="mt-6 flex gap-3">
          <GlassButton
            variant="capsule"
            type="button"
            onClick={onCancel}
            className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-4 [&>span>div]:font-bold"
          >
            Cancel
          </GlassButton>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "h-11 flex-1 rounded-full border border-white/20 px-4 text-sm font-extrabold text-white transition-all hover:brightness-110 active:scale-[0.98]",
              tone === "danger"
                ? "bg-gradient-to-br from-rose-500 to-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_26px_-10px_rgba(244,63,94,0.7)]"
                : "bg-gradient-to-br from-violet-500 to-indigo-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_26px_-10px_rgba(124,92,255,0.7)]",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </GlassSurface>
    </div>
  );
}
