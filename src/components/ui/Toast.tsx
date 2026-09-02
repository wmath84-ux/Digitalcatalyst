import { useEffect, useRef } from "react";
import { toast as pushGlassToast, dismissToast } from "./glass-toast";

/**
 * Toast — the app's existing, prop-driven toast surface.
 *
 * Wave 14 (liquid glass): the *rendering* now belongs entirely to the pack's
 * `glass-toast` (`GlassToaster` mounted once in `src/main.tsx`, the Sonner-style
 * `toast()` store). This component keeps its public API exactly as it was —
 * `{ toasts, onRemove }`, `ToastMessage`, `ToastType` — because My Day feeds it
 * state, but it renders nothing itself: every entry in `toasts` is forwarded
 * to the pack store (`variant` = success / error / default) and mapped back to
 * `onRemove` when the pack dismisses it (auto after 4 s, or via its × button).
 * One look, one viewport, two entry points.
 */

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

const variantOf: Record<ToastType, "success" | "error" | "default"> = {
  success: "success",
  error: "error",
  info: "default",
};

export default function Toast({ toasts, onRemove }: ToastProps) {
  // app id -> pack id, so a prop-list removal can dismiss the glass card too
  const forwarded = useRef(new Map<string, number>());
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  useEffect(() => {
    const live = new Set(toasts.map((t) => t.id));
    for (const t of toasts) {
      if (forwarded.current.has(t.id)) continue;
      const packId = pushGlassToast({ title: t.text, variant: variantOf[t.type] });
      forwarded.current.set(t.id, packId);
      // the pack auto-dismisses after its default 4000 ms; mirror that into
      // the parent's list so the two stores never drift apart
      window.setTimeout(() => {
        if (forwarded.current.get(t.id) === packId) {
          forwarded.current.delete(t.id);
          onRemoveRef.current(t.id);
        }
      }, 4000);
    }
    for (const [appId, packId] of forwarded.current) {
      if (!live.has(appId)) {
        dismissToast(packId);
        forwarded.current.delete(appId);
      }
    }
  }, [toasts]);

  return null;
}
