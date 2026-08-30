import { useEffect, useState } from "react";
import { CheckCircle2, Info, XCircle, X, type LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const icons: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles: Record<ToastType, string> = {
  // Use a light, high-contrast surface for errors. A solid red pill can hide
  // the message on some devices / dark-theme CSS, which is what users see as
  // "ek pura red box jisme kuch bhi nahi dikhta". The dark red text on white
  // is readable while still being unmistakably an error.
  success: "bg-emerald-600 text-white shadow-emerald-900/20",
  error: "bg-white text-rose-700 border border-rose-300 shadow-rose-200/70",
  info: "bg-slate-800 text-white shadow-slate-900/30",
};

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const Icon = icons[toast.type];

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-xl transition-all duration-300",
        styles[toast.type],
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      <Icon
        className={cn("h-4.5 w-4.5 mt-0.5 shrink-0", toast.type === "error" ? "text-rose-600" : "text-white")}
        aria-hidden="true"
      />
      <span
        className="min-w-0 flex-1 break-words text-left text-sm font-semibold leading-snug"
        style={toast.type === "error" ? { color: "#9f1239" } : { color: "#fff" }}
      >
        {toast.text}
      </span>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
        className={cn(
          "mt-0.5 shrink-0 rounded-md p-0.5 transition hover:opacity-100",
          toast.type === "error" ? "text-rose-400 opacity-70 hover:bg-rose-100" : "text-white/80 opacity-70 hover:bg-white/10",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Toast({ toasts, onRemove }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}
