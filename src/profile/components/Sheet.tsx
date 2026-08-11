import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl animate-sheet-up">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-neutral-200" />
          <h2 className="mt-2 text-base font-bold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 active:scale-95 transition"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="px-5 pb-8 pt-4">{children}</div>
      </div>
    </div>
  );
}
