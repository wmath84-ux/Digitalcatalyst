// src/course/ConfirmDeleteDialog.tsx
//
// Deletion confirmation for the Course Player (notes + mind maps).
//
// Why a dedicated component instead of reusing the My Day ConfirmDialog:
// the Course Player sheet is clipped (`overflow-hidden`) and themed with
// CSS variables that only exist INSIDE the player. A dialog rendered inside
// that tree would be cut off by the sheet and would not inherit the player's
// theme. This one portals straight to `document.body`:
//
//   - It is ALWAYS above the overlay sheet (z-40) and the dock (z-50),
//     so it can never hide under the player chrome.
//   - It is fixed + top-aligned on every viewport: phones, tablets in
//     portrait AND landscape. The top edge uses the safe-area inset, so the
//     card is never pushed under the status bar / notch / cut-out.
//   - Width is `min(100vw - 2rem, 26rem)` — comfortable thumb width on a
//     phone, a centred dialog on tablet/desktop. Height is capped to ~70dvh
//     (with a vh fallback) and the card scrolls internally, so a tiny
//     landscape phone can never push the buttons off-screen.
//   - High-contrast white surface: legible over both the dark and the light
//     course themes without inheriting either.
//
// The DELETE button is the ONLY path that calls `onConfirm`. Backdrop tap,
// Escape and Cancel all dismiss without deleting — no destructive action is
// ever reachable without an explicit second tap on the red button.

import { GlassSurface } from "../components/ui/glass";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { lockBodyScroll, unlockBodyScroll } from "../components/ui/overlayBounds";

interface CourseConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Extra detail rendered in a soft box under the message (optional). */
  detail?: string | null;
  confirmLabel?: string;
  confirmTitle?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CourseConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Delete",
  confirmTitle = "Delete",
  onConfirm,
  onCancel,
}: CourseConfirmDialogProps) {
  // Ref-counted body scroll lock: if another overlay (the player sheet) is
  // still open below, its lock is untouched and released in the right order.
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

  // Top-safe padding: never under the notch, never flush to the edge. The
  // card then sits at that top band on phones AND tablets (a small tablet
  // landscape has very little vertical room, so a fixed center could push
  // the card off the top or behind the browser chrome).
  const topPad = "max(env(safe-area-inset-top, 0px), clamp(0.75rem, 9vh, 3rem))";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto"
      style={{ paddingTop: topPad, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)", paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)", paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)" }}
      data-course-confirm-dialog
      data-course-confirm-open="true"
      role="presentation"
    >
      {/* Backdrop — tap anywhere outside the card cancels. */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onCancel}
        data-course-confirm-backdrop
      />

      <GlassSurface
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tint={0.9}
        radius={16}
        className="relative z-10 w-[min(100%,26rem)] shrink-0 overflow-hidden rounded-2xl shadow-2xl shadow-slate-950/40 animate-scaleIn"
        style={{ maxHeight: "max(18rem, min(70vh, 70dvh))" }}
        data-course-confirm-card
      >
        <div className="max-h-[inherit] overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600 sm:h-12 sm:w-12"
              data-course-confirm-icon
            >
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black leading-snug text-slate-900 sm:text-lg" data-course-confirm-title>
                {title}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500 sm:text-sm" data-course-confirm-message>
                {message}
              </p>
            </div>
          </div>

          {detail ? (
            <p
              className="mt-3 rounded-xl bg-slate-100/80 px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-600"
              data-course-confirm-detail
            >
              {detail}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
              data-course-confirm-cancel
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700 active:scale-[0.99]"
              aria-label={confirmTitle}
              data-course-confirm-delete
            >
              <Trash2 size={15} />
              {confirmLabel}
            </button>
          </div>
        </div>
      </GlassSurface>
    </div>,
    document.body,
  );
}
