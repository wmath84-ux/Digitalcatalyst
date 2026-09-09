import { useEffect, type ReactNode } from "react";
import { cn } from "../utils/cn";

/**
 * Lightweight anchored dropdown. The parent wraps trigger + this panel in a
 * `relative` container; a transparent fixed backdrop handles outside clicks.
 */
export default function Dropdown({
  open,
  onClose,
  align = "right",
  className,
  children,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden="true" />
      <div
        role="menu"
        aria-label={ariaLabel}
        className={cn("menu-pop absolute top-full z-50 mt-1.5", align === "right" ? "right-0" : "left-0", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
