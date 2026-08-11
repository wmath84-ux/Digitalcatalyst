import { useEffect, useRef, useState } from "react";
import { Share2, Link2, Check, MessageCircle, Send, AtSign, Mail } from "lucide-react";
import { cn } from "../../utils/cn";

export default function ShareButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleCopy = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const socials = [
    { icon: MessageCircle, label: "Messenger", color: "hover:bg-blue-50 hover:text-blue-600" },
    { icon: Send, label: "Twitter / X", color: "hover:bg-sky-50 hover:text-sky-500" },
    { icon: AtSign, label: "LinkedIn", color: "hover:bg-blue-50 hover:text-blue-700" },
    { icon: Mail, label: "Email", color: "hover:bg-zinc-100 hover:text-zinc-700" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:scale-105 hover:border-zinc-300 hover:text-zinc-900 hover:shadow-md",
          className
        )}
        aria-label="Share product"
      >
        <Share2 className="h-4.5 w-4.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-13 z-30 w-64 rounded-2xl border border-zinc-100 bg-white/95 p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Share this course
          </p>
          <div className="grid grid-cols-4 gap-2 pb-3">
            {socials.map((s) => (
              <button
                key={s.label}
                title={s.label}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border border-zinc-100 py-2.5 text-zinc-500 transition",
                  s.color
                )}
              >
                <s.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button
            onClick={handleCopy}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100"
          >
            <span className="flex items-center gap-2 truncate">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Copy product link</span>
            </span>
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : null}
          </button>
        </div>
      )}
    </div>
  );
}
