// Vendored from the website-glass shadcn registry:
//   npx shadcn@latest add https://websiteglass.com/r/glass-toast.json
//   source item: registry/new-york/ui/glass-toast/glass-toast.tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

// ─── Store (singleton, Sonner-style) ─────────────────────────────────────────

export interface ToastData {
  id: number;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "error";
  duration?: number;
}

type Listener = (toasts: ToastData[]) => void;

let toasts: ToastData[] = [];
const listeners = new Set<Listener>();
let counter = 0;

function emit() {
  for (const l of listeners) l(toasts);
}

/** Push a toast from anywhere. Returns its id. */
export function toast(input: string | Omit<ToastData, "id">): number {
  const data = typeof input === "string" ? { title: input } : input;
  const id = ++counter;
  toasts = [...toasts, { id, duration: 4000, variant: "default", ...data }];
  emit();
  return id;
}
export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

type Position = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const posClass: Record<Position, string> = {
  "bottom-right": "bottom-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "top-right": "top-4 right-4 items-end",
  "top-left": "top-4 left-4 items-start",
};

export function GlassToaster({ position = "bottom-right" }: { position?: Position }) {
  const [items, setItems] = useState<ToastData[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const l: Listener = (t) => setItems([...t]);
    listeners.add(l);
    l(toasts);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (!mounted) return null;
  const fromTop = position.startsWith("top");

  return createPortal(
    <div className={cn("pointer-events-none fixed z-[1000] flex w-[min(24rem,90vw)] flex-col gap-2", posClass[position])}>
      {(fromTop ? items : [...items].reverse()).map((t) => (
        <ToastCard key={t.id} data={t} fromTop={fromTop} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ data, fromTop }: { data: ToastData; fromTop: boolean }) {
  useEffect(() => {
    if (!data.duration) return;
    const id = setTimeout(() => dismissToast(data.id), data.duration);
    return () => clearTimeout(id);
  }, [data.id, data.duration]);

  const accent =
    data.variant === "success" ? "#30d158" : data.variant === "error" ? "#ff453a" : null;

  return (
    <div
      className={cn(
        "pointer-events-auto w-full animate-in fade-in-0 zoom-in-95 duration-200",
        fromTop ? "slide-in-from-top-2" : "slide-in-from-bottom-2",
      )}
    >
      <GlassSurface tint={0.6} radius={16} className="w-full" contentClassName="flex items-start gap-3 p-3.5">
        {accent && (
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: accent }} />
        )}
        <div className="min-w-0 flex-1">
          {data.title && <p className="text-sm font-medium text-white">{data.title}</p>}
          {data.description && <p className="mt-0.5 text-sm text-white/55">{data.description}</p>}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismissToast(data.id)}
          className="-mr-1 shrink-0 rounded-md p-1 text-white/40 outline-none transition-colors hover:text-white focus-visible:text-white"
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </GlassSurface>
    </div>
  );
}
