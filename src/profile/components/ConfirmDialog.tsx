import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-xs rounded-3xl bg-white p-5 text-center shadow-2xl animate-fade-in">
        <div
          className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
            danger ? "bg-rose-50 text-rose-500" : "bg-indigo-50 text-indigo-600"
          }`}
        >
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="mb-1 text-sm font-bold text-neutral-900">{title}</h3>
        <p className="mb-5 text-xs text-neutral-500">{description}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-xs font-bold text-neutral-600 active:scale-95 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white active:scale-95 transition ${
              danger ? "bg-rose-600" : "bg-indigo-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
