import { useEffect } from "react";

interface ToastProps {
  message: string;
  onDone: () => void;
}

export default function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[max(env(safe-area-inset-top),14px)] z-[60] flex justify-center px-6">
      <div className="rounded-full bg-slate-900/95 px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-xl animate-[fadeIn_0.2s_ease-out]">
        {message}
      </div>
    </div>
  );
}
