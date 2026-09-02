// Glass Toast — AI Canvas design (https://aicanvas.me/components/glass-toast)
//
// Frosted glassmorphism toast notification stack with 4 variants
// (success / error / warning / info), an auto-dismiss progress bar inside the
// card itself, and spring-animated stacking (Framer Motion `popLayout`).
// The Sonner-style singleton store API is kept 1:1 with the previous vendored
// component, so every existing `toast()` / `dismissToast()` caller keeps
// working — they simply render through the new AI Canvas cards.
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Store (singleton, Sonner-style) ─────────────────────────────────────────

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastData {
  id: number;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Listener = (toasts: ToastData[]) => void;

const TOAST_DURATION = 4000;
const MAX_TOASTS = 3;

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
  const item: ToastData = { duration: TOAST_DURATION, variant: "default", ...data, id };
  toasts = [...toasts, item].slice(-MAX_TOASTS);
  emit();
  return id;
}
export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// ─── Variant styling (AI Canvas glass-toast palette) ─────────────────────────

const VARIANTS: Record<
  Exclude<ToastVariant, "default">,
  { color: string; Icon: typeof Info; label: string }
> = {
  success: { color: "#06D6A0", Icon: CheckCircle2, label: "Success" },
  error: { color: "#FF5C8A", Icon: XCircle, label: "Error" },
  warning: { color: "#FFBE0B", Icon: AlertTriangle, label: "Warning" },
  info: { color: "#3A86FF", Icon: Info, label: "Info" },
};

function variantOf(v: ToastVariant | undefined) {
  return VARIANTS[v && v !== "default" ? v : "info"];
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

type Position = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const posClass: Record<Position, string> = {
  "bottom-right": "bottom-4 left-4 right-4 flex-col-reverse sm:bottom-6 sm:left-auto sm:right-6",
  "bottom-left": "bottom-4 left-4 right-4 flex-col-reverse sm:bottom-6 sm:right-auto sm:left-6",
  "top-right": "top-4 left-4 right-4 flex-col sm:top-6 sm:left-auto sm:right-6",
  "top-left": "top-4 left-4 right-4 flex-col sm:top-6 sm:right-auto sm:left-6",
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
  const fromRight = position.endsWith("right");

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed z-[1000] flex gap-3 sm:w-[380px]",
        posClass[position],
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((t) => (
          <ToastCard key={t.id} data={t} fromRight={fromRight} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ToastCard({ data, fromRight }: { data: ToastData; fromRight: boolean }) {
  const reduceMotion = useReducedMotion();
  const { color, Icon } = variantOf(data.variant);

  // The AI Canvas card is designed for dark surfaces. On the light admin
  // shell (html[data-glass="off"]) or the course player's light theme the
  // same layout/motion rides a darker glass pane so the white ink stays
  // legible.
  const [onLightSurface] = useState(() => {
    if (typeof document === "undefined") return false;
    if (document.documentElement.dataset.glass === "off") return true;
    const player = document.querySelector("[data-course-player]");
    return player?.getAttribute("data-course-theme") === "light";
  });

  // ── Auto-dismiss progress bar ────────────────────────────────────────────
  // rAF loop drains the 2px bar from full to empty. Hovering the card
  // freezes `elapsed`, so the toast never disappears while being read.
  const barRef = useRef<HTMLDivElement | null>(null);
  const hoveredRef = useRef(false);

  useEffect(() => {
    const duration = data.duration;
    if (!duration) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let done = false;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!hoveredRef.current) elapsed += delta;
      const fraction = Math.max(0, 1 - elapsed / duration);
      if (barRef.current) barRef.current.style.transform = `scaleX(${fraction})`;
      if (fraction <= 0) {
        if (!done) {
          done = true;
          dismissToast(data.id);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data.id, data.duration]);

  const off = fromRight ? 80 : -80;
  const enterExit = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: off, scale: 0.95 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: off, scale: 0.95 },
      };

  return (
    <motion.div
      layout
      {...enterExit}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      whileHover={reduceMotion ? undefined : { scale: 1.01 }}
      onHoverStart={() => {
        hoveredRef.current = true;
      }}
      onHoverEnd={() => {
        hoveredRef.current = false;
      }}
      className="pointer-events-auto relative w-full overflow-hidden rounded-2xl"
      style={{
        background: onLightSurface ? "rgba(18,18,24,0.78)" : "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
      role="status"
    >
      {/* Separate non-animating blur layer, so the frosted backdrop never
          re-rasterises while the card springs around. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 rounded-2xl"
        style={{
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        }}
      />

      <div className="relative z-10 flex items-center gap-3 py-3.5 pl-4 pr-10">
        {/* Tinted icon tile */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}18`, border: `1px solid ${color}22` }}
        >
          <Icon size={18} style={{ color }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {data.title && (
            <p className="truncate text-sm font-semibold text-white/90">{data.title}</p>
          )}
          {data.description && (
            <p className="mt-0.5 text-xs text-white/50">{data.description}</p>
          )}
        </div>
      </div>

      {/* Close — 44x44 touch target wrapping a 20x20 glass circle */}
      <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2">
        <motion.button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismissToast(data.id)}
          className="flex h-11 w-11 cursor-pointer items-center justify-center outline-none"
          whileTap={{ scale: 0.88 }}
        >
          <motion.span
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            whileHover={{ background: "rgba(255,255,255,0.14)" }}
          >
            <X size={10} className="text-white/60" aria-hidden />
          </motion.span>
        </motion.button>
      </div>

      {/* Draining progress bar */}
      {data.duration ? (
        <div className="absolute bottom-0 left-0 right-0 z-10 h-[2px]">
          <div
            ref={barRef}
            className="h-full w-full origin-left"
            style={{ background: `${color}99`, transform: "scaleX(1)" }}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
