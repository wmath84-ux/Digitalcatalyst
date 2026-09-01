import { useEffect, useState } from "react";
import { CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { GlassToastCard, type GlassToastTone } from "./glass-toast";
import { cn } from "../../utils/cn";

/**
 * Toast — the app's existing, prop-driven toast surface.
 *
 * Wave 1 (liquid glass) keeps this component's public API exactly as it was —
 * `{ toasts, onRemove }`, `ToastMessage`, `ToastType` — because My Day (and
 * later every other feature) already feeds it state. Only the *material*
 * changed: each row is now the pack's `GlassToastCard`, i.e. a frosted
 * `GlassSurface` chip with a specular rim, which is what the standalone
 * `toast.success()/error()/info()` singleton in ./glass-toast renders too.
 * One look, two entry points.
 *
 * Behaviour unchanged: 4 s auto-dismiss, a 300 ms exit before the parent is
 * asked to remove the entry, `role=alert` on errors, and the readable
 * rose-on-white error style (see glass-toast.tsx for why).
 *
 * One deliberate promotion: the stack moved from z-[70] to z-[120], the same
 * band the portal-driven `ToastViewport` uses. A toast raised by a dialog
 * (coupon applied, entitlement saved) used to land *behind* that dialog, which
 * reads as "nothing happened"; the course player's own confirm sheet already
 * lives at 120, so both sit in the same layer and DOM order decides.
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

const icons: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const toneOf: Record<ToastType, GlassToastTone> = {
  success: "success",
  error: "error",
  info: "info",
};

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const Icon = icons[toast.type];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div className={cn("transition-all duration-300", visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
      <GlassToastCard
        text={toast.text}
        tone={toneOf[toast.type]}
        icon={<Icon className="size-4.5" aria-hidden="true" />}
        onDismiss={() => onRemove(toast.id)}
      />
    </div>
  );
}

export default function Toast({ toasts, onRemove }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[120] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}
