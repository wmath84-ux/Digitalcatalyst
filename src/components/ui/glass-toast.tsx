// src/components/ui/glass-toast.tsx
//
// PORTED, not vendored. The upstream `glass-toast` registry item had not
// finished transferring when this wave was written (the docs host is not
// reachable from the build sandbox — see docs/liquid-glass-rollout-plan.md §1),
// so this file implements the component's *documented* API — a singleton toast
// system plus one portaled viewport — on top of the vendored primitives
// (`GlassSurface`, `glass-motion`). Run
//
//   npx shadcn@latest add https://websiteglass.com/r/glass-toast.json
//
// to replace it with the registry copy; `scripts/verify-glass-registry.mjs`
// lists this file as PORTED so the fidelity check reports it instead of
// silently treating it as the upstream source.
"use client";

import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GlassSurface } from "@/components/ui/glass";
import { cn } from "@/lib/utils";

export type GlassToastTone = "success" | "error" | "info";

export interface GlassToastMessage {
  id: string;
  text: string;
  tone?: GlassToastTone;
  /** ms before auto-dismiss; 0 keeps it until dismissToast(). */
  duration?: number;
  action?: ReactNode;
}

const DEFAULT_DURATION = 4000;

// ── singleton bus ─────────────────────────────────────────────────────────────
// One module-level list + one viewport means any call site (a hook, an event
// handler, an api helper) can raise a toast without prop-drilling. `Toast.tsx`
// keeps feeding the prop-driven list the app already uses; both render through
// GlassToastCard, so there is exactly one toast look.
type Listener = (messages: GlassToastMessage[]) => void;

let messages: GlassToastMessage[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(messages);
}

function push(message: Omit<GlassToastMessage, "id">): string {
  const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  messages = [...messages, { ...message, id }];
  emit();
  const duration = message.duration ?? DEFAULT_DURATION;
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id: string): void {
  messages = messages.filter((m) => m.id !== id);
  emit();
}

export const toast = {
  show: (text: string, tone: GlassToastTone = "info") => push({ text, tone }),
  success: (text: string) => push({ text, tone: "success" }),
  error: (text: string) => push({ text, tone: "error" }),
  info: (text: string) => push({ text, tone: "info" }),
  dismiss: dismissToast,
};

// ── the card ──────────────────────────────────────────────────────────────────

interface GlassToastCardProps extends ComponentProps<"div"> {
  text: string;
  tone?: GlassToastTone;
  icon?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}

/**
 * Tone maps to a material, not just a colour:
 *   success → emerald frost, white label (a confident, self-lit pill)
 *   error   → white frost, rose label  (a solid red capsule hides the message
 *             on some devices — that is the "ek pura red box, kuch nahi dikhta"
 *             bug this repo already fixed once; keep the readable direction)
 *   info    → slate frost, dark label
 */
const TONES: Record<GlassToastTone, { tint: number; tintRgb: string; label: string; ring: string }> = {
  success: { tint: 0.62, tintRgb: "5,150,105", label: "text-white", ring: "shadow-emerald-900/20" },
  error: { tint: 0.78, tintRgb: "255,255,255", label: "text-rose-700", ring: "shadow-rose-200/70" },
  info: { tint: 0.7, tintRgb: "30,41,59", label: "text-white", ring: "shadow-slate-900/30" },
};

export function GlassToastCard({ text, tone = "info", icon, action, onDismiss, className, ...props }: GlassToastCardProps) {
  const t = TONES[tone];
  return (
    <GlassSurface
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      tint={t.tint}
      tintColor={t.tintRgb}
      blur={18}
      saturation={1.5}
      radius={18}
      className={cn("glass-toast-in pointer-events-auto w-full", t.ring, className)}
      contentClassName="flex items-start gap-2.5 px-4 py-3"
      {...props}
    >
      {icon ? <span aria-hidden className={cn("mt-0.5 shrink-0", t.label)}>{icon}</span> : null}
      <span className={cn("min-w-0 flex-1 break-words text-left text-sm font-semibold leading-snug", t.label)}>
        {text}
      </span>
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className={cn(
            "mt-0.5 shrink-0 rounded-lg p-1 opacity-70 transition hover:opacity-100 focus-visible:opacity-100",
            t.label,
          )}
        >
          <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </GlassSurface>
  );
}

// ── viewport ────────────────────────────────────────────────────────────────

/** Mount once, near the app root. Fixed, centred, above the sheet layer. */
export function ToastViewport({ className }: { className?: string }) {
  const [list, setList] = useState<GlassToastMessage[]>(messages);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const listener: Listener = (next) => setList(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!mounted || list.length === 0) return null;

  return createPortal(
    <div
      /* No role/aria-live on this wrapper on purpose: each GlassToastCard is
         already `role="status"` (or `role="alert"` for errors), which makes it a
         live region by itself. A second aria-live up here would announce every
         toast twice. */
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4 sm:bottom-6",
        className,
      )}
    >
      <div className="flex w-full max-w-sm flex-col gap-2">
        {list.map((m) => (
          <GlassToastCard
            key={m.id}
            text={m.text}
            tone={m.tone}
            action={m.action}
            onDismiss={() => dismissToast(m.id)}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
