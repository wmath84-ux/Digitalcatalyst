import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { lockBodyScroll, unlockBodyScroll } from "./overlayBounds";
import "./content-dialog.css";

/** Plain content overlay: bounded viewport, focus trap, Escape/backdrop close,
 * focus restoration and one independently scrollable body. Shared chrome stays
 * untouched; consumers keep their canonical data and action handlers. */
export default function ContentDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className = "",
  busy = false,
  role = "dialog",
  fallbackFocusRef,
  ...attributes
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  [key: `data-${string}`]: unknown;
}) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dc-content-dialog-backdrop" />
        <Dialog.Content
          {...attributes}
          role={role}
          className={`dc-content-dialog ${className}`}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = opener.current?.isConnected
              ? opener.current
              : fallbackFocusRef?.current;
            target?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <header className="dc-content-dialog-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description
                className={description ? undefined : "sr-only"}
              >
                {description || "Escape or Close returns to the page."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="dc-content-dialog-close"
                aria-label={`Close ${title.toLowerCase()}`}
                disabled={busy}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <div className="dc-content-dialog-body">{children}</div>
          {footer ? (
            <footer className="dc-content-dialog-footer">{footer}</footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
