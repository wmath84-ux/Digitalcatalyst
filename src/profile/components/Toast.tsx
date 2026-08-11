import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useApp } from "../context/AppContext";

export function Toast() {
  const { toast } = useApp();

  if (!toast) return null;

  const icon =
    toast.tone === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
    ) : toast.tone === "error" ? (
      <XCircle className="h-5 w-5 text-rose-400" />
    ) : (
      <Info className="h-5 w-5 text-sky-400" />
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl bg-neutral-900/95 px-4 py-3 text-sm font-medium text-white shadow-2xl ring-1 ring-white/10 backdrop-blur animate-toast-in">
        {icon}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
